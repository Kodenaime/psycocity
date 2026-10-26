import { z } from "zod";
export { z };
export const healthSchema = z.object({ status: z.literal("ok"), service: z.literal("psycocity-api") });
export const readinessSchema = z.object({ status: z.enum(["ready", "not_ready"]) });
export const emptyQuerySchema = z.object({}).strict();
export const errorCodeSchema = z.enum(["INVALID_REQUEST", "NOT_FOUND", "INTERNAL_ERROR", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "RATE_LIMITED", "UNAVAILABLE", "MFA_REQUIRED"]);
export const apiErrorSchema = z.object({ error: z.object({ code: errorCodeSchema, message: z.string(), requestId: z.string(), details: z.array(z.object({ path: z.string(), message: z.string() })).optional() }) });
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(12, "Use at least 12 characters").max(128, "Use no more than 128 characters");
export const registerSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const loginSchema = z.object({ identifier: z.string().min(1).max(254).transform(value => value.trim().toLowerCase()), password: z.string().min(1).max(128) }).strict();
export const emailRequestSchema = z.object({ email: emailSchema }).strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export const resetPasswordSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password: passwordSchema }).strict();
export const messageSchema = z.object({ message: z.string() });
export const currentUserSchema = z.object({ user: z.object({ id: z.string(), email: z.email(), roles: z.array(z.string()), verified: z.boolean(), mfaRequired: z.boolean().default(false), mfaEnabled: z.boolean().default(false) }) });
export const authCapabilitiesSchema = z.object({ registrationAvailable: z.boolean(), testMode: z.boolean() });

export const trackSchema = z.enum(["academy", "established"]);
export const applicationStates = ["draft", "submitted", "under_review", "corrections_requested", "shortlisted", "assessment_scheduled", "assessed", "accepted", "waitlisted", "rejected", "withdrawn"] as const;
export function lagosDate(now = new Date()): string {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => values.find(value => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function ageOn(birthDate: string, asOf = lagosDate()): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  const [currentYear, currentMonth, currentDay] = asOf.split("-").map(Number);
  return currentYear! - year! - (currentMonth! < month! || (currentMonth === month && currentDay! < day!) ? 1 : 0);
}
export const birthDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= lagosDate();
}, "Enter a valid birth date that is not in the future");
export const draftAnswersSchema = z.object({
  personal: z.object({ legalName: z.string().max(120).optional(), professionalName: z.string().max(120).optional(), birthDate: birthDateSchema.or(z.literal("")).optional(), phone: z.string().max(30).optional() }).strict().optional(),
  location: z.object({ country: z.literal("Nigeria").optional(), state: z.string().max(80).optional(), city: z.string().max(100).optional() }).strict().optional(),
  measurements: z.object({ heightCm: z.number().positive().max(300).optional(), bustChestCm: z.number().positive().max(250).optional(), waistCm: z.number().positive().max(250).optional(), hipsCm: z.number().positive().max(250).optional(), shoeSize: z.number().positive().max(60).optional(), shoeSystem: z.enum(["EU", "UK", "US"]).optional() }).strict().optional(),
  background: z.object({ experience: z.string().max(2000).optional(), interests: z.string().max(1000).optional(), availability: z.string().max(1000).optional(), introduction: z.string().max(2000).optional(), portfolioUrl: z.url({ protocol: /^https$/ }).or(z.literal("")).optional(), socialUrl: z.url({ protocol: /^https$/ }).or(z.literal("")).optional() }).strict().optional(),
  academy: z.object({ learningGoals: z.string().max(2000).optional(), hybridAvailability: z.string().max(1000).optional() }).strict().optional(),
  established: z.object({ representationHistory: z.string().max(2000).optional(), contractualRestrictions: z.string().max(2000).optional() }).strict().optional(),
}).strict();
export type DraftAnswers = z.infer<typeof draftAnswersSchema>;
export const createApplicationSchema = z.object({ track: trackSchema }).strict();
export const saveApplicationSchema = z.object({ version: z.number().int().nonnegative(), answers: draftAnswersSchema, track: trackSchema.optional() }).strict();
export const correctionPaths = ["personal.legalName", "personal.professionalName", "personal.birthDate", "personal.phone", "location.country", "location.state", "location.city", "measurements.heightCm", "measurements.bustChestCm", "measurements.waistCm", "measurements.hipsCm", "measurements.shoeSize", "measurements.shoeSystem", "background.experience", "background.interests", "background.availability", "background.introduction", "background.portfolioUrl", "background.socialUrl", "academy.learningGoals", "academy.hybridAvailability", "established.representationHistory", "established.contractualRestrictions", "photos.headshot", "photos.profile", "photos.full_body_front", "photos.full_body_side", "photos.portfolio", "guardian"] as const;
export const applicationSchema = z.object({ id: z.string(), track: trackSchema, status: z.enum(applicationStates), version: z.number().int(), consentHold: z.boolean().default(false), correctionFields: z.array(z.enum(correctionPaths)).default([]), correctionMessage: z.string().nullable().default(null), submittedAt: z.iso.datetime().nullable().default(null), withdrawnAt: z.iso.datetime().nullable().default(null), answers: draftAnswersSchema, updatedAt: z.iso.datetime() });
export type Application = z.infer<typeof applicationSchema>;
export const applicationSummarySchema = applicationSchema.omit({ answers: true });
export const applicationPageSchema = z.object({ items: z.array(applicationSummarySchema), nextCursor: z.string().nullable() });
export const applicationListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().regex(/^[0-9a-fA-F]{24}$/).optional() }).strict();

export const photoSlots = ["headshot", "profile", "full_body_front", "full_body_side", "portfolio"] as const;
export const photoSlotSchema = z.enum(photoSlots);
export const uploadRequestSchema = z.object({ applicationId: z.string().regex(/^[0-9a-f]{24}$/), slot: photoSlotSchema }).strict();
export const uploadGrantSchema = z.object({ assetId: z.string(), uploadUrl: z.string(), uploadToken: z.string(), expiresAt: z.iso.datetime(), maxBytes: z.number() });
export const mediaSummarySchema = z.object({ id: z.string(), slot: photoSlotSchema, width: z.number(), height: z.number(), bytes: z.number(), previewUrl: z.string() });
export const mediaPageSchema = z.object({ items: z.array(mediaSummarySchema) });

export const guardianPolicyVersion = "guardian-admission-v1";
export const guardianRelationshipSchema = z.enum(["parent", "legal_guardian"]);
export const guardianRequestSchema = z.object({ guardianName: z.string().trim().min(2).max(120), email: emailSchema, relationship: guardianRelationshipSchema }).strict();
export const guardianStatusSchema = z.object({ required: z.boolean(), canUpload: z.boolean(), status: z.enum(["not_required", "incomplete", "ineligible", "missing", "pending", "consented", "declined", "withdrawn", "expired", "changed"]), guardianName: z.string().optional(), guardianEmail: z.email().optional(), relationship: guardianRelationshipSchema.optional() });
export const guardianPreviewRequestSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), purpose: z.enum(["consent", "withdraw"]) }).strict();
export const guardianPreviewSchema = z.object({ applicantName: z.string(), guardianName: z.string(), relationship: guardianRelationshipSchema, policyVersion: z.string() });
export const guardianDecisionSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), guardianName: z.string().trim().min(2).max(120), relationship: guardianRelationshipSchema, adult: z.literal(true), agrees: z.literal(true), policyVersion: z.literal(guardianPolicyVersion) }).strict();

export const nigeriaStates = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT"] as const;
export const applicationTermsVersion = "application-terms-v1";
export const applicationPrivacyVersion = "application-privacy-v1";
const finalName = z.string().trim().min(2).max(120).refine(value => !/[\p{Cc}]/u.test(value), "Use a single-line name without control characters");
const phoneSchema = z.string().transform(value => {
  const cleaned = value.replace(/[ ()-]/g, "");
  return /^0[1-9]\d{9}$/.test(cleaned) ? `+234${cleaned.slice(1)}` : cleaned;
}).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Include a valid country code, for example +2348012345678"));
const finalBaseAnswers = z.object({
  personal: z.object({ legalName: finalName, professionalName: z.string().trim().max(120).optional(), birthDate: birthDateSchema, phone: phoneSchema }).strict(),
  location: z.object({ country: z.literal("Nigeria"), state: z.string().trim().transform(value => nigeriaStates.find(state => state.toLowerCase() === value.toLowerCase()) ?? (["abuja", "federal capital territory"].includes(value.toLowerCase()) ? "FCT" : value)).pipe(z.enum(nigeriaStates)), city: z.string().trim().min(2).max(100) }).strict(),
  measurements: draftAnswersSchema.shape.measurements.unwrap().extend({ heightCm: z.number().positive().max(300), shoeSize: z.number().positive().max(60), shoeSystem: z.enum(["EU", "UK", "US"]) }),
  background: draftAnswersSchema.shape.background.unwrap().extend({ introduction: z.string().trim().min(20).max(2000), interests: z.string().trim().min(3).max(1000), availability: z.string().trim().min(3).max(1000) }),
}).strict();
export const finalApplicationSchema = z.discriminatedUnion("track", [
  z.object({ track: z.literal("academy"), answers: finalBaseAnswers.extend({ academy: z.object({ learningGoals: z.string().trim().min(10).max(2000), hybridAvailability: z.string().trim().min(3).max(1000) }).strict(), established: draftAnswersSchema.shape.established }) }).strict(),
  z.object({ track: z.literal("established"), answers: finalBaseAnswers.extend({ established: z.object({ representationHistory: z.string().trim().min(2).max(2000), contractualRestrictions: z.string().trim().min(2).max(2000) }).strict(), academy: draftAnswersSchema.shape.academy }) }).strict(),
]).superRefine((input, context) => {
  if (ageOn(input.answers.personal.birthDate) < (input.track === "academy" ? 16 : 18)) context.addIssue({ code: "custom", path: ["answers", "personal", "birthDate"], message: input.track === "academy" ? "Academy applicants must be at least 16" : "Established models must be at least 18" });
  if (input.track === "established" && (input.answers.background.experience?.trim().length ?? 0) < 10) context.addIssue({ code: "custom", path: ["answers", "background", "experience"], message: "Describe your professional modelling experience" });
});
export const fieldIssueSchema = z.object({ path: z.string(), message: z.string() });
export const applicationDeclarationsSchema = z.object({ accuracy: z.literal(true), termsAccepted: z.literal(true), privacyAccepted: z.literal(true), termsVersion: z.literal(applicationTermsVersion), privacyVersion: z.literal(applicationPrivacyVersion) }).strict();
export const submitApplicationSchema = z.object({ version: z.number().int().nonnegative(), declarations: applicationDeclarationsSchema }).strict();
export const withdrawApplicationSchema = z.object({ version: z.number().int().nonnegative() }).strict();
export const submissionRequirementsSchema = z.object({ canSubmit: z.boolean(), issues: z.array(fieldIssueSchema), termsVersion: z.literal(applicationTermsVersion), privacyVersion: z.literal(applicationPrivacyVersion) });
export const applicationTimelineSchema = z.object({ items: z.array(z.object({ from: z.string(), to: z.string(), at: z.iso.datetime(), message: z.string().optional() })) });

export const loginResponseSchema = messageSchema.extend({ mfaRequired: z.boolean().default(false), setupRequired: z.boolean().default(false) });
export const staffInviteSchema = z.object({ email: emailSchema }).strict();
export const staffActivationSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password: passwordSchema }).strict();
export const mfaCodeSchema = z.object({ method: z.enum(["totp", "recovery"]), code: z.string().trim().min(6).max(40) }).strict();
export const mfaInfoSchema = z.object({ email: z.email(), enabled: z.boolean() });
export const mfaEnrollmentSchema = z.object({ secret: z.string(), uri: z.string() });
export const mfaResultSchema = messageSchema.extend({ recoveryCodes: z.array(z.string()).optional() });
export const adminOverviewSchema = z.object({ userId: z.string(), email: z.email(), activeStaff: z.number(), securedStaff: z.number(), pendingInvitations: z.number(), awaitingApplications: z.number() });
export const staffPageSchema = z.object({ items: z.array(z.object({ id: z.string(), email: z.email(), active: z.boolean(), mfaEnabled: z.boolean() })), nextCursor: z.string().nullable() });
export const staffInvitationPageSchema = z.object({ items: z.array(z.object({ id: z.string(), email: z.email(), status: z.string(), expiresAt: z.iso.datetime() })), nextCursor: z.string().nullable() });
export const auditPageSchema = z.object({ items: z.array(z.object({ id: z.string(), action: z.string(), actorId: z.string().nullable(), actorLabel: z.string(), entityId: z.string().nullable(), at: z.iso.datetime() })), nextCursor: z.string().nullable() });
export const pageQuerySchema = applicationListQuerySchema;

export const reviewQueueQuerySchema = applicationListQuerySchema.extend({ track: trackSchema.optional(), status: z.enum(applicationStates.filter(value => value !== "draft")).optional(), minAge: z.coerce.number().int().min(0).max(120).optional(), maxAge: z.coerce.number().int().min(0).max(120).optional(), from: z.iso.date().optional(), through: z.iso.date().optional(), consentHold: z.enum(["true", "false"]).optional() }).superRefine((input, context) => { if (input.minAge !== undefined && input.maxAge !== undefined && input.minAge > input.maxAge) context.addIssue({ code: "custom", path: ["minAge"], message: "Minimum age cannot exceed maximum age" }); if (input.from && input.through && input.from > input.through) context.addIssue({ code: "custom", path: ["from"], message: "Start date must not follow end date" }); });
export const reviewQueueSchema = z.object({ items: z.array(z.object({ id: z.string(), track: trackSchema, status: z.enum(applicationStates), version: z.number(), applicantName: z.string(), age: z.number().nullable(), submittedAt: z.iso.datetime(), consentHold: z.boolean() })), nextCursor: z.string().nullable() });
export const reviewActionSchema = z.object({ version: z.number().int().nonnegative(), action: z.enum(["start_review", "shortlist", "record_assessment", "request_corrections"]), publicMessage: z.string().trim().max(2000).optional(), fields: z.array(z.enum(correctionPaths)).max(correctionPaths.length).optional(), internalNote: z.string().trim().max(2000).optional() }).strict().superRefine((input, context) => { if (input.action === "request_corrections" && (!input.fields?.length || (input.publicMessage?.length ?? 0) < 10)) context.addIssue({ code: "custom", path: ["fields"], message: "Choose correction fields and provide clear applicant instructions" }); });
export const reviewNoteRequestSchema = z.object({ version: z.number().int().nonnegative(), body: z.string().trim().min(2).max(2000) }).strict();
export const reviewDetailSchema = z.object({ application: applicationSchema, applicantEmail: z.email().nullable(), selfReview: z.boolean(), photos: z.array(mediaSummarySchema), declarations: applicationDeclarationsSchema, guardian: z.object({ name: z.string(), email: z.email(), relationship: z.string(), policyVersion: z.string(), status: z.string(), verifiedAt: z.iso.datetime().nullable() }).nullable(), notes: z.array(z.object({ id: z.string(), body: z.string(), actor: z.string(), at: z.iso.datetime() })), history: z.array(z.object({ from: z.string(), to: z.string(), actor: z.string(), at: z.iso.datetime(), message: z.string().optional() })) });

const eventFields = {
  title: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(2000), instructions: z.string().trim().max(2000).default(""),
  mode: z.enum(["in_person", "online", "hybrid"]), venue: z.string().trim().max(300).default(""), meetingUrl: z.union([z.literal(""), z.url().startsWith("https://")]).default(""),
  startsAt: z.iso.datetime({offset: true}), endsAt: z.iso.datetime({offset: true}), capacity: z.number().int().min(1).max(500),
};
function eventRules(input: {startsAt: string; endsAt: string; mode: string; venue: string; meetingUrl: string}, context: z.RefinementCtx) {
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) context.addIssue({code: "custom", path: ["endsAt"], message: "End must follow start"});
  if (input.mode !== "online" && !input.venue) context.addIssue({code: "custom", path: ["venue"], message: "A venue is required"});
  if (input.mode !== "in_person" && !input.meetingUrl) context.addIssue({code: "custom", path: ["meetingUrl"], message: "An HTTPS meeting link is required"});
}
export const createEventSchema = z.object({...eventFields, track: trackSchema}).strict().superRefine(eventRules);
export const updateEventSchema = z.object({...eventFields, version: z.number().int().nonnegative(), cancelled: z.boolean().default(false)}).strict().superRefine(eventRules);
export const assignEventSchema = z.object({applicationId: z.string().regex(/^[0-9a-f]{24}$/), applicationVersion: z.number().int().nonnegative(), eventVersion: z.number().int().nonnegative(), startsAt: z.iso.datetime({offset: true}), endsAt: z.iso.datetime({offset: true})}).strict().refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt), {message: "End must follow start"});
export const invitationRsvpSchema = z.object({version: z.number().int().nonnegative(), rsvp: z.enum(["confirmed", "declined"])}).strict();
export const invitationOutcomeSchema = z.object({version: z.number().int().nonnegative(), attendance: z.enum(["present", "absent", "late", "excused"]), outcome: z.string().trim().min(2).max(2000)}).strict();
export const admissionEventSchema = z.object({...eventFields, id: z.string(), track: trackSchema, status: z.enum(["scheduled", "cancelled"]), version: z.number().int()});
export const eventPageSchema = z.object({items: z.array(admissionEventSchema), nextCursor: z.string().nullable()});
export const eventInvitationSchema = z.object({id: z.string(), applicationId: z.string(), event: admissionEventSchema, startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), version: z.number().int(), status: z.enum(["active", "cancelled"]), rsvp: z.enum(["pending", "confirmed", "declined"]), attendance: z.enum(["unrecorded", "present", "absent", "late", "excused"]), outcome: z.string()});
export const invitationPageSchema = z.object({items: z.array(eventInvitationSchema), nextCursor: z.string().nullable()});

export const admissionTermsVersion = "admission-offer-2026-10-v1";
export const admissionTermsText = "Acceptance is conditional on verified payment of the stated one-time track fee before the offer deadline. Academy: NGN 50,000 total tuition/assessment fee. Established-model track: NGN 30,000 total assessment/onboarding fee. No additional application fee is due. Payment does not guarantee modelling work or earnings. Membership activation follows payment verification and a separate invitation. Consult the published application, privacy and refund policies before payment.";
export const admissionDecisionSchema = z.object({version: z.number().int().nonnegative(), decision: z.enum(["accept", "reject", "waitlist", "renew"]), reason: z.string().trim().min(10).max(2000), deadlineDays: z.number().int().min(1).max(90).default(14)}).strict();
export const admissionOfferSchema = z.object({id: z.string(), applicationId: z.string(), track: trackSchema, amountKobo: z.number().int().positive(), currency: z.literal("NGN"), termsVersion: z.string(), termsText: z.string(), expiresAt: z.iso.datetime(), issuedAt: z.iso.datetime(), revision: z.number().int(), status: z.enum(["issued", "expired", "replaced", "paid"]), active: z.boolean(), eligibleForCheckout: z.boolean()});
export const applicationOffersSchema = z.object({items: z.array(admissionOfferSchema), defaultDeadlineDays: z.literal(14)});

export const checkoutRequestSchema = z.object({termsVersion: z.string().min(1).max(100), acceptsTerms: z.literal(true)}).strict();
export const checkoutCapabilitiesSchema = z.object({available: z.boolean(), testMode: z.literal(true)});
export const paymentStatusSchema = z.object({reference: z.string(), amountKobo: z.number().int(), currency: z.literal("NGN"), state: z.enum(["initializing", "initialized", "initialization_unknown", "successful", "failed"]), checkoutUrl: z.url().nullable(), message: z.string()});

export const paymentSummarySchema = z.object({reference: z.string(), amountKobo: z.number().int(), currency: z.literal("NGN"), state: z.string(), reviewReason: z.string(), refundedKobo: z.number().int(), createdAt: z.iso.datetime(), verifiedAt: z.iso.datetime().nullable(), applicationId: z.string()});
export const paymentPageSchema = z.object({items: z.array(paymentSummarySchema), nextCursor: z.string().nullable()});
export const paymentReviewQuerySchema = pageQuerySchema.extend({review: z.enum(["all", "anomalies", "unresolved", "successful"]).default("all")});
export const paymentReceiptSchema = z.object({number: z.string(), amountKobo: z.number().int(), currency: z.literal("NGN"), paidAt: z.iso.datetime(), termsVersion: z.string()});
export const paymentRefundSchema = z.object({providerRefundId: z.string(), amountKobo: z.number().int(), status: z.string(), updatedAt: z.iso.datetime(), internalNote: z.string().optional()});
export const paymentDetailSchema = paymentSummarySchema.extend({receipt: paymentReceiptSchema.nullable(), refunds: z.array(paymentRefundSchema)});
export const refundRecordSchema = z.object({providerRefundId: z.string().regex(/^[1-9][0-9]{0,30}$/), note: z.string().trim().min(10).max(1000)}).strict();
