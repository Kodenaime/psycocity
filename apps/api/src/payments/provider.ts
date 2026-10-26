import { z } from "@psycocity/validation";
export type CheckoutProvider = {initialize: (input: {email: string; amount: number; reference: string; callbackUrl: string; applicationId: string; offerId: string}) => Promise<string>};
const responseSchema = z.object({status: z.literal(true), data: z.object({authorization_url: z.url(), reference: z.string()})});
export function safeCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com" || url.username || url.password || url.port) throw new Error("Invalid checkout destination");
  return url.href;
}
export function createCheckoutProvider(env: Record<string, string | undefined>, mode: string): CheckoutProvider | null {
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key) return null;
  // Live charging stays unavailable until settlement and launch verification.
  if (mode === "production" || !/^sk_test_[A-Za-z0-9]+$/.test(key)) throw new Error("Checkout currently requires a Paystack test secret in development or test mode");
  return {async initialize(input) {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000), headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"}, body: JSON.stringify({email: input.email, amount: input.amount, currency: "NGN", reference: input.reference, callback_url: input.callbackUrl, metadata: {applicationId: input.applicationId, offerId: input.offerId}})});
    if (!response.ok) throw new Error("Provider initialization unavailable");
    const parsed = responseSchema.parse(await response.json());
    if (parsed.data.reference !== input.reference) throw new Error("Provider reference mismatch");
    return safeCheckoutUrl(parsed.data.authorization_url);
  }};
}
