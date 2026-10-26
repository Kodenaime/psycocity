import { ageOn } from "@psycocity/validation";
import { createApplicationModels } from "../applications/models.js";
import { createPaymentModel } from "../payments/models.js";
import type { ClientSession } from "mongoose";
import type { Identity, IdentityService } from "../identity/service.js";
import { createMembershipService } from "./service.js";
export function createMemberGuard(identity: IdentityService) {
  const service = createMembershipService(identity, null, "http://localhost");
  return async (actor: Pick<Identity, "userId" | "roles">, type: "student" | "model", session?: ClientSession, memberId?: string) => {
    const member = await service.models.Member.findOne({...(memberId?{_id:memberId}:{}),userId: actor.userId, ...(type === "model" ? {$or:[{type:"model"},{type:"student",representationApprovedAt:{$ne:null}}]} : {type}), status: "active"}).sort({type:1}).session(session ?? null);
    if (!member || !actor.roles.includes(type)) return null;
    const entitlement = await service.models.Entitlement.findOne({_id: member.entitlementId, status: "activated", ownerId: actor.userId}).session(session ?? null);
    if (!entitlement) return null;
    const eligible = await service.eligible(entitlement.paymentId, session); if (!eligible || type === "model" && (eligible.type !== "model" && !member.representationApprovedAt || ageOn(eligible.application.submittedSnapshot.answers.personal.birthDate) < 18)) return null;
    if (session) {
      await service.models.Member.updateOne({_id: member._id}, {$set: {updatedAt: new Date()}}, {session});
      await createApplicationModels(identity.models.User.db).Application.updateOne({_id: eligible.application._id}, {$inc: {eligibilityRevision: 1}}, {session});
      await createPaymentModel(identity.models.User.db).updateOne({_id: entitlement.paymentId}, {$inc: {membershipRevision: 1}}, {session});
    }
    return {member, entitlement};
  };
}

export function createMemberResolver(identity: IdentityService) {
  const service = createMembershipService(identity, null, "http://localhost"); const guard = createMemberGuard(identity);
  return async (id: string, type: "student" | "model", session?: ClientSession) => {const member = await service.models.Member.findOne({_id:id,type,status:"active"}).session(session ?? null); if (!member) return null; const user = await identity.models.User.findOne({_id:member.userId,status:"active"}).session(session ?? null); if (!user) return null; const proof = await guard({userId:String(user._id),roles:user.roles},type,session,String(member._id)); return proof ? {...proof,user} : null;};
}
