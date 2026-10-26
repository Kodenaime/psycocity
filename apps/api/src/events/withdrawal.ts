import type { ClientSession, Connection, Types } from "mongoose";
import type { MailRuntime } from "../identity/auth-service.js";
import { createAdminModels } from "../admin/models.js";
import { createEventModels } from "./models.js";
export async function cancelWithdrawnAppointments(connection: Connection, applicationId: Types.ObjectId, email: string, origin: string, mail: MailRuntime, session: ClientSession) {
  await createAdminModels(connection).Setting.updateOne({key: "admission-schedule"}, {$inc: {version: 1}}, {upsert: true, session});
  const {Invitation} = createEventModels(connection);
  const invitations = await Invitation.find({applicationId, status: "active", attendance: "unrecorded"}).session(session);
  for (const invitation of invitations) {
    invitation.status = "cancelled"; invitation.version++; await invitation.save({session});
    if (mail) await mail.enqueue({to: email, subject: "Psycocity admission appointment cancelled", text: `Your admission appointment was cancelled because you withdrew the application.\n${new URL("/applicant/dashboard", origin).href}`}, `admission:${invitation._id}:${invitation.eventVersion}:${invitation.version}:withdrawn`, session);
  }
}
