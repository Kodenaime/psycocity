import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutProvider, safeCheckoutUrl } from "../../apps/api/src/payments/provider.js";
afterEach(() => {vi.unstubAllGlobals();});
const input = {email: "synthetic@example.test", amount: 5_000_000, reference: "psyc_synthetic", callbackUrl: "https://example.test/callback", applicationId: "application-fixture", offerId: "offer-fixture"};
describe("Paystack test adapter boundary", () => {
  it("stays disabled without configuration and rejects production and live keys", () => {
    expect(createCheckoutProvider({}, "development")).toBeNull();
    expect(() => createCheckoutProvider({PAYSTACK_SECRET_KEY: "sk_test_synthetic"}, "production")).toThrow();
    expect(() => createCheckoutProvider({PAYSTACK_SECRET_KEY: "sk_live_synthetic"}, "development")).toThrow();
  });
  it("sends server-owned NGN fields and validates the exact returned reference", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({status: true, data: {reference: input.reference, authorization_url: "https://checkout.paystack.com/synthetic"}})));
    vi.stubGlobal("fetch", mock); const provider = createCheckoutProvider({PAYSTACK_SECRET_KEY: "sk_test_synthetic"}, "test")!;
    expect(await provider.initialize(input)).toBe("https://checkout.paystack.com/synthetic");
    const [url, options] = mock.mock.calls[0] as [string, RequestInit]; expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(JSON.parse(String(options.body))).toMatchObject({amount: 5_000_000, currency: "NGN", reference: input.reference, metadata: {applicationId: input.applicationId, offerId: input.offerId}});
    mock.mockResolvedValue(new Response(JSON.stringify({status: true, data: {reference: "different-reference", authorization_url: "https://checkout.paystack.com/synthetic"}})));
    await expect(provider.initialize(input)).rejects.toThrow("reference mismatch");
  });
  it.each(["http://checkout.paystack.com/x", "https://checkout.paystack.com.evil.test/x", "https://example.test/", "https://user:pass@checkout.paystack.com/x"])("rejects unsafe checkout destination %s", url => {expect(() => safeCheckoutUrl(url)).toThrow();});
});
