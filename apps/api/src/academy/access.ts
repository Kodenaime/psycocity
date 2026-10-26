import type { ClientSession } from "mongoose";
import { lagosDate } from "@psycocity/validation";
import type { Identity, IdentityService } from "../identity/service.js";
import { createMemberGuard } from "../members/guard.js";
import { createAcademyModels } from "./models.js";
export function createAcademyAccess(identity: IdentityService) {
  const {Cohort,Enrolment} = createAcademyModels(identity.models.User.db); const guard = createMemberGuard(identity);
  return async (actor: Pick<Identity,"userId"|"roles">, cohortId: string, session?: ClientSession, recordsOnly = false) => {
    const proof = await guard(actor,"student",session); if (!proof || !/^[0-9a-f]{24}$/.test(cohortId)) return null;
    const cohort = await Cohort.findOne({_id:cohortId,status:"active"}).session(session ?? null); const enrolment = await Enrolment.findOne({cohortId,memberId:proof.member._id,status:{$in:["active","completed"]}}).session(session ?? null);
    if (!cohort || !enrolment || !recordsOnly && !cohort.archiveAccess && (cohort.endsOn < lagosDate() || enrolment.status === "completed")) return null;
    if (session) {await Cohort.updateOne({_id:cohort._id},{$inc:{rosterRevision:1}},{session}); await Enrolment.updateOne({_id:enrolment._id},{$inc:{accessRevision:1}},{session});}
    return {...proof,cohort,enrolment};
  };
}
