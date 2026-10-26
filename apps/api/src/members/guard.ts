import { createApplicationModels } from "../applications/models.js";
import { createPaymentModel } from "../payments/models.js";
import type { ClientSession } from "mongoose";
import type { Identity, IdentityService } from "../identity/service.js";
import { createMembershipService } from "./service.js";
export function createMemberGuard(identity: IdentityService) {
  const service = createMembershipService(identity, null, "http://localhost");
  return async (actor: Pick<Identity, "userId" | "roles">, type: "student" | "model", session?: ClientSession) => {
    const member = await service.models.Member.findOne({userId: actor.userId, type, status: "active"}).session(session ?? null);
    if (!member || !actor.roles.includes(type)) return null;
    const entitlement = await service.models.Entitlement.findOne({_id: member.entitlementId, status: "activated", ownerId: actor.userId}).session(session ?? null);
    if (!entitlement) return null;
    const eligible = await service.eligible(entitlement.paymentId, session); if (!eligible) return null;
    if (session) {
      await service.models.Member.updateOne({_id: member._id}, {$set: {updatedAt: new Date()}}, {session});
      await createApplicationModels(identity.models.User.db).Application.updateOne({_id: eligible.application._id}, {$inc: {eligibilityRevision: 1}}, {session});
      await createPaymentModel(identity.models.User.db).updateOne({_id: entitlement.paymentId}, {$inc: {membershipRevision: 1}}, {session});
    }
    return {member, entitlement};
  };
}
