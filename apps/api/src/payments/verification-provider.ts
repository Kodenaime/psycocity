import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "@psycocity/validation";
export const verifiedTransactionSchema = z.object({id: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9][0-9]{0,30}$/)]).transform(String), reference: z.string().max(100), status: z.string().max(40), amount: z.number().int().nonnegative().safe(), currency: z.string().max(5), domain: z.literal("test"), paid_at: z.iso.datetime({offset: true}).nullable(), customer: z.object({email: z.email().transform(value => value.toLowerCase())}), metadata: z.object({applicationId: z.string(), offerId: z.string()})});
export type VerifiedTransaction = z.infer<typeof verifiedTransactionSchema>;
export const verifiedRefundSchema = z.object({id: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9][0-9]{0,30}$/)]).transform(String), amount: z.number().int().positive().safe(), currency: z.literal("NGN"), status: z.enum(["pending", "processing", "processed", "failed"]), transaction: z.union([z.object({id: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9][0-9]{0,30}$/)]).transform(String)}), z.number().int().positive().safe(), z.string().regex(/^[1-9][0-9]{0,30}$/)]).transform(value => typeof value === "object" ? value.id : String(value))});
export type VerifiedRefund = z.infer<typeof verifiedRefundSchema>;
export type VerificationProvider = {verify: (reference: string) => Promise<VerifiedTransaction>; verifyRefund?: (id: string) => Promise<VerifiedRefund>; validSignature: (raw: Buffer, signature: string) => boolean};
export function webhookVerifier(key: string) {
  return (raw: Buffer, signature: string) => /^[a-f0-9]{128}$/i.test(signature) && timingSafeEqual(createHmac("sha512", key).update(raw).digest(), Buffer.from(signature, "hex"));
}
export function createVerificationProvider(env: Record<string, string | undefined>, mode: string): VerificationProvider | null {
  const key = env.PAYSTACK_SECRET_KEY; if (!key) return null;
  if (mode === "production" || !/^sk_test_[A-Za-z0-9]+$/.test(key)) throw new Error("Verification currently requires a test secret outside production");
  return {validSignature: webhookVerifier(key), async verifyRefund(id) {
    const response = await fetch(`https://api.paystack.co/refund/${encodeURIComponent(id)}`, {headers: {Authorization: `Bearer ${key}`}, redirect: "error", signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error("Provider refund verification unavailable");
    return z.object({status: z.literal(true), data: verifiedRefundSchema}).parse(await response.json()).data;
  }, async verify(reference) {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {headers: {Authorization: `Bearer ${key}`}, redirect: "error", signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error("Provider verification unavailable");
    return z.object({status: z.literal(true), data: verifiedTransactionSchema}).parse(await response.json()).data;
  }};
}
