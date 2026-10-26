import { randomBytes } from "node:crypto";
import type { IdentityService } from "../identity/service.js";
import type { MailRuntime } from "../identity/auth-service.js";
import { createEnquiryModels } from "./models.js";
export function createEnquiryNotifications(identity: IdentityService, mail: MailRuntime, origin: string) {
  const connection = identity.models.User.db; const {Enquiry} = createEnquiryModels(connection);
  return {async runOnce() {
    if (!mail) return false; const token = randomBytes(24).toString("hex"); const now = new Date();
    const enquiry = await Enquiry.findOneAndUpdate({notificationsQueuedAt: null, nextAttemptAt: {$lte: now}, leaseUntil: {$lte: now}}, {$set: {leaseUntil: new Date(Date.now() + 30_000), leaseToken: token}}, {returnDocument: "after"}); if (!enquiry) return false;
    try {await connection.transaction(async session => {
      const current = await Enquiry.findOne({_id: enquiry._id, leaseToken: token, leaseUntil: {$gt: new Date()}}).session(session); if (!current) return;
      await mail.enqueue({to: current.email, subject: "Your Psycocity enquiry reference", text: `We received your ${current.type} enquiry.\nReference: ${current.reference}\nAn enquiry does not reserve a model, date or booking. The agency will contact you separately.\n${new URL("/contact", origin).href}`}, `enquiry-ack:${current._id}`, session);
      const staff = await identity.models.User.find({roles: "admin", status: "active", staffStatus: {$ne: "deactivated"}, mfaEnabledAt: {$ne: null}}).limit(50).session(session).select("emailNormalized").lean();
      if (!staff.length) return;
      for (const person of staff) await mail.enqueue({to: person.emailNormalized, subject: "New Psycocity enquiry", text: `Reference: ${current.reference}. View the private staff queue:\n${new URL(`/admin/enquiries/${current._id}`, origin).href}`}, `enquiry-staff:${current._id}:${person._id}`, session);
      current.notificationsQueuedAt = new Date(); await current.save({session});
    });} catch { /* Persistence is independent of notification availability. */ }
    finally {await Enquiry.updateOne({_id: enquiry._id, leaseToken: token}, {$set: {leaseUntil: new Date(0), leaseToken: "", nextAttemptAt: new Date(Date.now() + 60_000)}});} return true;
  }};
}
