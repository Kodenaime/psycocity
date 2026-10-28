import { createPaymentModel } from "../payments/models.js";
import express from "express";
import type { ClientSession } from "mongoose";
import { admissionDecisionSchema, admissionTermsText, admissionTermsVersion, finalApplicationSchema } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import type { AuthConfig } from "../identity/config.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { requireIdentity, requireRoles } from "../identity/middleware.js";
import { sameOriginJson, requireCsrf, requireVerified } from "../identity/security.js";
import { createApplicationModels } from "../applications/models.js";
import { guardianStatus } from "../guardian/service.js";
import { createAdminModels } from "../admin/models.js";
import { AdminActionError } from "../admin/service.js";
import { createOfferModel } from "./models.js";
import { sendError } from "../http.js";
const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{24}$/.test(value);
class DecisionError extends Error {constructor(public status: number, message: string) {super(message);}}
export function createOfferRouters(identity: IdentityService, config: AuthConfig, mail: MailRuntime, authorize?: (actor: Identity, session: ClientSession) => Promise<void>) {
  const connection = identity.models.User.db; const Offer = createOfferModel(connection); const {Application, Transition} = createApplicationModels(connection); const {Audit} = createAdminModels(connection);
  const admin = express.Router(); const owner = express.Router({mergeParams: true});
  const list: express.RequestHandler = async (request, response) => {
    const id = request.params.id ?? request.params.applicationId;
    const application = validId(id) ? await Application.findOne({_id: id, ...(authorize ? {} : {ownerId: (response.locals.identity as Identity).userId})}).lean() : null;
    if (!application) {sendError(response, 404, "NOT_FOUND", "Application not found"); return;}
    const rows = await Offer.find({applicationId: application._id}).sort({revision: -1}).limit(20).lean();
    response.json({items: rows.map(value => ({id: String(value._id), applicationId: String(value.applicationId), track: value.track, amountKobo: value.amountKobo, currency: value.currency, termsVersion: value.termsVersion, termsText: value.termsText, expiresAt: value.expiresAt.toISOString(), issuedAt: value.createdAt.toISOString(), revision: value.revision, status: value.status === "issued" && value.expiresAt <= new Date() ? "expired" : value.status, active: value.active, eligibleForCheckout: value.active && value.status === "issued" && value.expiresAt > new Date() && application.status === "accepted" && !application.consentHold})), defaultDeadlineDays: 14});
  };
  admin.get("/:id/offers", list);
  admin.post("/:id/decision", sameOriginJson(config.origin), requireCsrf, express.json({limit: "4kb"}), async (request, response) => {
    const parsed = admissionDecisionSchema.safeParse(request.body); if (!parsed.success || !validId(request.params.id)) {sendError(response, 400, "INVALID_REQUEST", "Choose a decision, current version, reason and a deadline of 1–90 days"); return;}
    try {
      await connection.transaction(async session => {
        const actor = response.locals.identity as Identity; if (!authorize) throw new DecisionError(403, "Staff authorization required"); await authorize(actor, session);
        const application = await Application.findById(request.params.id).session(session);
        if (!application?.submittedSnapshot) throw new DecisionError(404, "Submitted application not found");
        if (String(application.ownerId) === actor.userId) throw new DecisionError(403, "Another staff member must decide your application");
        const input = parsed.data;
        if (application.version !== input.version) throw new DecisionError(409, "Application changed. Refresh before deciding.");
        const renew = input.decision === "renew";
        if (renew ? application.status !== "accepted" : !["assessed", "waitlisted"].includes(application.status)) throw new DecisionError(409, "Complete assessment before a final decision; renew only accepted offers");
        if (application.consentHold) throw new DecisionError(409, "Resolve the guardian consent hold before deciding");
        if (!mail) throw new DecisionError(503, "Decision notification email is unavailable");
        const offerRequired = input.decision === "accept" || renew;
        if (offerRequired) {
          const eligible = finalApplicationSchema.safeParse({track: application.track, answers: application.submittedSnapshot.answers});
          const consent = await guardianStatus(application, connection, session);
          if (!eligible.success || !consent.canUpload) throw new DecisionError(409, "Eligibility or guardian consent must be resolved before acceptance");
          const previous = await Offer.findOne({applicationId: application._id, active: true}).session(session);
          if (previous && (!renew || previous.status !== "issued" || previous.expiresAt > new Date())) throw new DecisionError(409, "An active unexpired or paid offer cannot be replaced");
          if (renew && !previous) throw new DecisionError(409, "No expired offer is available to renew");
          if (previous && await createPaymentModel(connection).exists({offerId: previous._id, active: true}).session(session)) throw new DecisionError(409, "Reconcile the existing payment attempt before renewing this offer");
          if (previous) {previous.active = false; previous.status = "replaced"; await previous.save({session});}
          const latest = await Offer.findOne({applicationId: application._id}).sort({revision: -1}).session(session);
          await Offer.create([{applicationId: application._id, ownerId: application.ownerId, track: application.track, amountKobo: previous?.amountKobo ?? (application.track === "academy" ? 5_000_000 : 3_000_000), currency: "NGN", termsVersion: previous?.termsVersion ?? admissionTermsVersion, termsText: previous?.termsText ?? admissionTermsText, expiresAt: new Date(Date.now() + input.deadlineDays * 24 * 60 * 60_000), issuedBy: actor.userId, revision: (latest?.revision ?? 0) + 1, applicationVersion: application.version + 1}], {session});
        }
        const from = application.status; const to = offerRequired ? "accepted" : input.decision === "reject" ? "rejected" : "waitlisted";
        application.status = to; application.version++; if (to === "rejected") {application.active = false;application.reapplyAfter=new Date(Date.now()+input.reapplyDays*24*60*60_000);await identity.models.User.updateOne({_id:application.ownerId},{$max:{applicationBlockedUntil:application.reapplyAfter},$inc:{applicationRevision:1}},{session});} await application.save({session});
        await Transition.create([{applicationId: application._id, from, to, actorId: actor.userId, version: application.version, publicMessage: `${renew ? "Your admission offer was renewed." : `Admission decision: ${to}.`} ${input.reason}${to==="rejected"?` You may apply again from ${application.reapplyAfter!.toISOString()}.`:""}`}], {session});
        await Audit.create([{actorId: actor.userId, action: `admission.${input.decision}`, entityId: application._id}], {session});
        const user = await identity.models.User.findById(application.ownerId).session(session).lean(); if (!user) throw new DecisionError(409, "Applicant account unavailable");
        await mail.enqueue({to: user.emailNormalized, subject: `Your Psycocity admission ${renew ? "offer renewal" : "decision"}`, text: `${input.reason}\n\nStatus: ${to}. ${offerRequired ? "Your fee, terms and offer deadline are available in your private applicant account. Membership still requires verified payment and a separate invitation." : "No payment is due for this decision."} ${to==="rejected"?`You may apply again from ${application.reapplyAfter!.toISOString()}.`:""}\n${new URL(`/applicant/application/${application._id}`, config.origin).href}`}, `admission-decision:${application._id}:${application.version}`, session);
      });
      response.json({message: "Admission decision recorded"});
    } catch (error) {
      if (error instanceof DecisionError) {sendError(response, error.status, error.status === 403 ? "FORBIDDEN" : error.status === 404 ? "NOT_FOUND" : error.status === 503 ? "UNAVAILABLE" : "CONFLICT", error.message); return;}
      if (error instanceof AdminActionError) {sendError(response, 403, "MFA_REQUIRED", error.message); return;} throw error;
    }
  });
  owner.use(requireIdentity(identity), requireRoles("applicant"), requireVerified, (_request, response, next) => {response.set("Cache-Control", "no-store"); next();}); owner.get("/", list);
  return {admin, owner};
}
