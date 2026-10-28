import { serialize, parse } from "cookie";
import type { Response } from "express";
import type { ClientSession } from "mongoose";
import { hashToken, newToken, type IdentityService } from "./service.js";
export const deviceCookie="psycocity_staff_device";
export const staffTrustMs=7*24*60*60_000;
export function createTrustedDevices(identity:IdentityService){const {TrustedDevice,User}=identity.models;return{
 async check(userId:string,token:string|undefined){if(!token||!/^[0-9a-f]{64}$/.test(token))return null;const user=await User.findOne({_id:userId,status:"active",roles:"admin",staffStatus:{$ne:"deactivated"},mfaEnabledAt:{$ne:null}}).lean();if(!user)return null;return TrustedDevice.findOne({userId,tokenHash:hashToken(token),credentialsVersion:user.credentialsVersion,expiresAt:{$gt:new Date()},revokedAt:null}).lean();},
 async issue(userId:string,session:ClientSession){const user=await User.findById(userId).session(session);if(!user?.mfaEnabledAt)return null;const token=newToken();const expiresAt=new Date(Date.now()+staffTrustMs);await TrustedDevice.create([{userId,tokenHash:hashToken(token),credentialsVersion:user.credentialsVersion,mfaVerifiedAt:new Date(),expiresAt}],{session});return{token,expiresAt};}
};}
export function setTrustedDevice(response:Response,device:{token:string;expiresAt:Date}|null,secure:boolean){if(device)response.append("Set-Cookie",serialize(deviceCookie,device.token,{httpOnly:true,secure,sameSite:"lax",path:"/",expires:device.expiresAt}));}
export function readTrustedDevice(cookie:string|undefined){return parse(cookie??"")[deviceCookie];}
