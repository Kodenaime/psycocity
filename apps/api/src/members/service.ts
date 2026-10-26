import { ageOn } from "@psycocity/validation";
import type { ClientSession, Types } from "mongoose";
import { finalApplicationSchema, type z, memberActivationSchema } from "@psycocity/validation";
import { hashToken, newToken, type IdentityService, type Identity } from "../identity/service.js";
import { hashPassword, verifyPassword } from "../identity/password.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createPaymentModel } from "../payments/models.js";
import { createOfferModel } from "../offers/models.js";
import { createApplicationModels } from "../applications/models.js";
import { guardianStatus } from "../guardian/service.js";
import { createAdminModels } from "../admin/models.js";
import { createOutboxModel } from "../mail/models.js";
import { createMemberModels } from "./models.js";
export function createMembershipService(identity: IdentityService, mail: MailRuntime, origin: string) {
  const connection = identity.models.User.db; const models = createMemberModels(connection); const {Entitlement, Invitation, Member} = models; const Payment = createPaymentModel(connection); const Offer = createOfferModel(connection); const {Application} = createApplicationModels(connection); const {Audit} = createAdminModels(connection); const Outbox = createOutboxModel(connection);
  let dummyHash: Promise<string> | undefined;
  async function eligible(paymentId: Types.ObjectId, session?: ClientSession) {
    const payment = await Payment.findOne({_id: paymentId, state: "successful", verifiedAt: {$ne: null}, providerId: {$type: "string"}, reviewReason: "", refundedKobo: 0}).session(session ?? null);
    if (!payment) return null;
    const [application, offer, owner] = await Promise.all([Application.findById(payment.applicationId).session(session ?? null), Offer.findById(payment.offerId).session(session ?? null), identity.models.User.findById(payment.ownerId).session(session ?? null)]);
    if (!application?.submittedSnapshot || application.status !== "accepted" || application.consentHold || !offer?.active || offer.status !== "paid" || offer.track !== application.track || String(offer.applicationId) !== String(application._id) || offer.amountKobo !== payment.amountKobo || offer.currency !== payment.currency || String(offer.ownerId) !== String(payment.ownerId) || String(application.ownerId) !== String(payment.ownerId) || !owner?.emailVerifiedAt || owner.status !== "active") return null;
    if (!finalApplicationSchema.safeParse({track: application.track, answers: application.submittedSnapshot.answers}).success || !(await guardianStatus(application, connection, session)).canUpload) return null;
    return {payment, application, owner, type: application.track === "academy" ? "student" as const : "model" as const};
  }
  async function cancelInvitations(id: Types.ObjectId, session: ClientSession) {
    const previous = await Invitation.find({entitlementId: id, status: "pending"}).session(session).select("_id").lean();
    await Invitation.updateMany({entitlementId: id, status: "pending"}, {$set: {status: "revoked"}}, {session});
    await Outbox.updateMany({dedupeKey: {$in: previous.map(value => `member-invitation:${value._id}`)}, state: {$ne: "delivered"}}, {$set: {state: "failed", lastErrorCode: "INVITATION_REPLACED"}, $unset: {encryptedPayload: 1, claimId: 1, leaseUntil: 1}}, {session});
  }
  async function issue(id: string, actor?: Identity, authorize?: (actor: Identity, session: ClientSession) => Promise<void>, initial = false) {
    if (!mail) return false;
    return connection.transaction(async session => {
      if (actor && authorize) await authorize(actor, session);
      const entitlement = await Entitlement.findById(id).session(session);
      if (!entitlement || entitlement.status === "activated" || !authorize && actor && (actor.userId !== String(entitlement.ownerId) || entitlement.status === "revoked") || !actor && entitlement.status !== "pending") return false;
      if (actor && authorize && actor.userId === String(entitlement.ownerId)) return false;
      const proof = await eligible(entitlement.paymentId, session); if (!proof || proof.owner.emailNormalized !== entitlement.email || proof.type !== entitlement.type) return false;
      const previous = await Invitation.findOne({entitlementId: entitlement._id, status: "pending"}).session(session);
      if (initial && previous) return true;
      if (!initial && entitlement.lastIssuedAt && entitlement.lastIssuedAt.getTime() > Date.now() - 60_000) return false;
      await Entitlement.updateOne({_id: entitlement._id, version: entitlement.version}, {$inc: {version: 1}}, {session});
      await cancelInvitations(entitlement._id, session);
      const token = newToken(); const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
      const [invitation] = await Invitation.create([{entitlementId: entitlement._id, tokenHash: hashToken(token), email: entitlement.email, type: entitlement.type, expiresAt}], {session});
      const url = new URL("/member/activate", origin); url.searchParams.set("token", token);
      await mail.enqueue({to: entitlement.email, subject: "Activate your Psycocity membership", text: `Your verified payment permits separate ${entitlement.type === "student" ? "academy student" : "model"} membership registration. Sign in with your verified applicant email and current password using this private single-use key/link:\n${url.href}\n\nThis invitation expires in seven days. Request a replacement in your applicant portal if necessary; you do not pay again. Never share this key or send it to staff. This does not create a public model listing.`}, `member-invitation:${invitation!._id}`, session, expiresAt);
      entitlement.status = "pending"; entitlement.lastIssuedAt = new Date(); entitlement.version++; await entitlement.save({session});
      await Payment.updateOne({_id: proof.payment._id}, {$inc: {membershipRevision: 1}, $set: {membershipProvisionedAt: new Date()}}, {session}); await Application.updateOne({_id: proof.application._id}, {$inc: {eligibilityRevision: 1}}, {session});
      await Audit.create([{...(actor ? {actorId: actor.userId} : {}), action: initial ? "member.invitation_issued" : "member.invitation_reissued", entityId: entitlement._id}], {session}); return true;
    });
  }
  async function ensure(paymentId: Types.ObjectId) {
    let id: string | null;
    try {id = await connection.transaction(async session => {
      const existing = await Entitlement.findOne({paymentId}).session(session); if (existing) return String(existing._id);
      const proof = await eligible(paymentId, session); if (!proof) return null;
      const current = await Entitlement.findOne({applicationId: proof.application._id}).session(session); if (current) return String(current._id);
      const [entitlement] = await Entitlement.create([{applicationId: proof.application._id, paymentId, ownerId: proof.owner._id, type: proof.type, email: proof.owner.emailNormalized}], {session});
      await Payment.updateOne({_id: paymentId}, {$inc: {membershipRevision: 1}}, {session}); await Application.updateOne({_id: proof.application._id}, {$inc: {eligibilityRevision: 1}}, {session}); return String(entitlement!._id);
    });} catch (error) {if (!(error instanceof Error && "code" in error && error.code === 11000)) throw error; const existing = await Entitlement.findOne({paymentId}).lean(); id = existing ? String(existing._id) : null;}
    if (id) await issue(id, undefined, undefined, true); return id;
  }
  async function backfillOnce() {
    const payment = await Payment.findOne({state: "successful", verifiedAt: {$ne: null}, reviewReason: "", refundedKobo: 0, membershipProvisionedAt: {$exists: false}, $or: [{membershipNextAttemptAt: {$exists: false}}, {membershipNextAttemptAt: {$lte: new Date()}}]}).sort({membershipNextAttemptAt: 1, _id: 1});
    if (!payment) return false;
    // Eligibility and uniqueness are checked transactionally, including historical payments.
    try {await ensure(payment._id);} catch { /* Keep the durable paid record available for retry. */ }
    await Payment.updateOne({_id: payment._id}, {$set: {membershipNextAttemptAt: new Date(Date.now() + 60_000)}}); return true;
  }
  async function status(ownerId?: string, applicationId?: string) {
    const entitlements = await Entitlement.find({...ownerId ? {ownerId} : {}, ...applicationId ? {applicationId} : {}}).sort({_id: -1}).limit(20);
    const values = [];
    for (const entitlement of entitlements) {
      const invitation = await Invitation.findOne({entitlementId: entitlement._id}).sort({createdAt: -1, _id: -1}).lean();
      values.push({id: String(entitlement._id), applicationId: String(entitlement.applicationId), type: entitlement.type, status: entitlement.status, eligible: Boolean(await eligible(entitlement.paymentId)), invitationStatus: invitation ? invitation.status === "pending" && invitation.expiresAt <= new Date() ? "expired" : invitation.status : "not_issued", expiresAt: invitation?.expiresAt.toISOString() ?? null});
    }
    return {entitlements: values, defaultExpiryDays: 7 as const};
  }
  async function revoke(id: string, actor: Identity, authorize: (actor: Identity, session: ClientSession) => Promise<void>) {
    return connection.transaction(async session => {await authorize(actor, session); const entitlement = await Entitlement.findById(id).session(session); if (!entitlement || entitlement.status === "activated" || String(entitlement.ownerId) === actor.userId) return false; await cancelInvitations(entitlement._id, session); entitlement.status = "revoked"; entitlement.version++; await entitlement.save({session}); await Audit.create([{actorId: actor.userId, action: "member.invitation_revoked", entityId: entitlement._id}], {session}); return true;});
  }
  async function activate(input: z.infer<typeof memberActivationSchema>) {
    const user = await identity.models.User.findOne({emailNormalized: input.email, status: "active", emailVerifiedAt: {$ne: null}}).select("+passwordHash").lean();
    dummyHash ??= hashPassword("member-activation-dummy-passphrase");
    const correct = await verifyPassword(user?.passwordHash ?? await dummyHash, input.password);
    if (!user || !correct) return null;
    return connection.transaction(async session => {
      const invitation = await Invitation.findOne({tokenHash: hashToken(input.token), email: input.email, status: "pending", expiresAt: {$gt: new Date()}}).session(session);
      if (!invitation) return null;
      const entitlement = await Entitlement.findOne({_id: invitation.entitlementId, status: "pending", ownerId: user._id, email: input.email, type: invitation.type}).session(session); if (!entitlement) return null;
      const proof = await eligible(entitlement.paymentId, session); if (!proof || (proof.owner.credentialsVersion ?? 0) !== (user.credentialsVersion ?? 0) || proof.type !== invitation.type) return null;
      if (input.username && proof.owner.usernameNormalized && proof.owner.usernameNormalized !== input.username) return null;
      if (await Member.exists({userId: user._id, type: entitlement.type}).session(session)) return null;
      await Entitlement.updateOne({_id: entitlement._id, version: entitlement.version}, {$inc: {version: 1}}, {session});
      await Member.create([{userId: user._id, entitlementId: entitlement._id, type: entitlement.type}], {session});
      await identity.models.User.updateOne({_id: user._id, credentialsVersion: user.credentialsVersion ?? 0}, {$addToSet: {roles: entitlement.type}, ...(input.username ? {$set: {usernameNormalized: input.username}} : {})}, {session});
      invitation.status = "used"; invitation.usedAt = new Date(); await invitation.save({session});
      await Outbox.updateOne({dedupeKey: `member-invitation:${invitation._id}`, state: {$ne: "delivered"}}, {$set: {state: "failed", lastErrorCode: "INVITATION_CONSUMED"}, $unset: {encryptedPayload: 1, claimId: 1, leaseUntil: 1}}, {session}); entitlement.status = "activated"; entitlement.activatedAt = new Date(); entitlement.version++; await entitlement.save({session});
      await Payment.updateOne({_id: proof.payment._id}, {$inc: {membershipRevision: 1}}, {session}); await Application.updateOne({_id: proof.application._id}, {$inc: {eligibilityRevision: 1}}, {session});
      await identity.models.Session.updateMany({userId: user._id, revokedAt: null}, {$set: {revokedAt: new Date()}}, {session});
      const fresh = await identity.issueSession(String(user._id), {session, expectedCredentialsVersion: user.credentialsVersion ?? 0});
      await Audit.create([{actorId: user._id, action: "member.activated", entityId: entitlement._id}], {session}); return {session: fresh, type: entitlement.type};
    });
  }
  async function access(actor: Identity) {
    const records = await Member.find({userId: actor.userId}).sort({_id: -1}).limit(10); const memberships = [];
    for (const member of records) {const entitlement = await Entitlement.findOne({_id: member.entitlementId, status: "activated"}).lean(); const proof=entitlement?await eligible(entitlement.paymentId):null; memberships.push({id: String(member._id), type: member.type, status: member.status, accessible: Boolean(member.status === "active" && actor.roles.includes(member.type) && proof)});if(member.type === "student" && member.representationApprovedAt)memberships.push({id:String(member._id),type:"model",status:member.status,accessible:Boolean(member.status==="active"&&actor.roles.includes("model")&&proof&&ageOn(proof.application.submittedSnapshot.answers.personal.birthDate)>=18)});}
    return {email: actor.email, memberships};
  }
  return {models, eligible, ensure, issue, revoke, status, activate, access, backfillOnce};
}
