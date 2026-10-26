import { Schema,type Connection } from "mongoose";
import { initialPublicCopy } from "@psycocity/validation";
const schema=new Schema({_id:{type:String,default:"public"},draft:{type:Schema.Types.Mixed,required:true},published:{type:Schema.Types.Mixed,required:true},version:{type:Number,default:0},publishedAt:Date},{timestamps:true,strict:"throw",versionKey:false});
export function createContentModel(connection:Connection){return connection.models.PublicContent as ReturnType<typeof build>??build();function build(){return connection.model("PublicContent",schema);}}
export async function initializeContent(connection:Connection){await createContentModel(connection).updateOne({_id:"public"},{$setOnInsert:{draft:initialPublicCopy,published:initialPublicCopy,version:0}},{upsert:true});}
