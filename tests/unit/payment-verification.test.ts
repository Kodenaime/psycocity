import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVerificationProvider, verifiedTransactionSchema, webhookVerifier } from "../../apps/api/src/payments/verification-provider.js";
afterEach(() => {vi.unstubAllGlobals();});
const fixture = {id: 123, reference: "psyc_fixture", status: "success", amount: 5_000_000, currency: "NGN", domain: "test", paid_at: new Date().toISOString(), customer: {email: "Fixture@example.test"}, metadata: {applicationId: "application", offerId: "offer"}};
describe("Paystack verification boundaries", () => {
  it("compares SHA512 signatures over exact raw bytes and rejects altered/malformed signatures", () => {
    const key = "synthetic-signing-fixture"; const body = Buffer.from('{ "event": "charge.success" }'); const signature = createHmac("sha512", key).update(body).digest("hex"); const verify = webhookVerifier(key);
    expect(verify(body, signature)).toBe(true); expect(verify(Buffer.from('{"event":"charge.success"}'), signature)).toBe(false);
    expect(verify(body, "" )).toBe(false); expect(verify(body, "x".repeat(128))).toBe(false); expect(verify(body, "a".repeat(128))).toBe(false);
  });
  it("uses server-to-server test verification and excludes live-domain or malformed responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({status: true, data: fixture}))); vi.stubGlobal("fetch", fetch);
    const provider = createVerificationProvider({PAYSTACK_SECRET_KEY: "sk_test_synthetic"}, "test")!; const result = await provider.verify("psyc_fixture"); expect(result.id).toBe("123"); expect(result.customer.email).toBe("fixture@example.test"); expect(fetch.mock.calls[0]![0]).toBe("https://api.paystack.co/transaction/verify/psyc_fixture");
    expect(verifiedTransactionSchema.safeParse({...fixture, domain: "live"}).success).toBe(false);
    expect(createVerificationProvider({}, "test")).toBeNull(); expect(() => createVerificationProvider({PAYSTACK_SECRET_KEY: "sk_test_synthetic"}, "production")).toThrow();
  });
});
