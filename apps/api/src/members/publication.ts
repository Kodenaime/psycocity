import type { ClientSession } from "mongoose";
import { ageOn, completeProfessionalSchema, publicModelSchema } from "@psycocity/validation";
import type { IdentityService } from "../identity/service.js";
import { createMemberGuard } from "./guard.js";
import { createMemberModels } from "./models.js";
import { createProfileModels } from "./profiles-models.js";
import { createApplicationModels } from "../applications/models.js";
import { createMediaModel } from "../media/models.js";
export function createPublicationReader(identity: IdentityService) {
  const connection = identity.models.User.db; const {Draft, Revision} = createProfileModels(connection); const {Member} = createMemberModels(connection); const guard = createMemberGuard(identity); const Media = createMediaModel(connection);
  async function proof(memberId: string, session?: ClientSession) {
    const member = await Member.findOne({_id: memberId, type: "model", status: "active"}).session(session ?? null); if (!member) return null;
    const user = await identity.models.User.findOne({_id: member.userId, status: "active", roles: "model"}).session(session ?? null); if (!user) return null;
    const result = await guard({userId: String(user._id), roles: user.roles}, "model", session); return result ? {...result, user} : null;
  }
  async function read(memberId: string, preview = false) {
    const member = await proof(memberId); if (!member) return null;
    const draft = await Draft.findOne({memberId, ...(preview ? {} : {visible: true}), publishedRevisionId: {$ne: null}}).lean(); if (!draft?.publishedRevisionId) return null;
    const revision = await Revision.findOne({_id: draft.publishedRevisionId, memberId, status: "approved"}).lean(); if (!revision) return null;
    const data = completeProfessionalSchema.safeParse(revision.data); if (!data.success) return null;
    const application = await createApplicationModels(connection).Application.findById(member.entitlement.applicationId).select("submittedSnapshot").lean(); const age = ageOn(application!.submittedSnapshot.answers.personal.birthDate); if (age < 18) return null;
    const assets = await Media.find({_id: {$in: revision.photos.map(photo => photo.id)}, memberId, retainedForSubmission: true, status: "ready"}).lean(); if (assets.length !== revision.photos.length) return null;
    return publicModelSchema.parse({id: memberId, ...data.data, age, photos: revision.photos.map(photo => {const asset = assets.find(value => String(value._id) === photo.id)!; return {id: photo.id, url: `/api/v1/models/${memberId}/photos/${photo.id}`, alt: photo.alt, credit: photo.credit, width: asset.width, height: asset.height};}), coverId: revision.coverId});
  }
  return {proof, read};
}
