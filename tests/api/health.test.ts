import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/app.js";

describe("real Express API", () => {
  it("returns process liveness as JSON without advertising framework details", async () => {
    const response = await request(createApp()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({ status: "ok", service: "psycocity-api" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
  it.each(["/api/unknown", "/api/v1/unknown"])("returns JSON 404 for %s", async (url) => {
    const response = await request(createApp()).get(url);
    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "API route not found", requestId: response.headers["x-request-id"] } });
  });
  it("does not report a successful health result for an unsupported method", async () => {
    const response = await request(createApp()).post("/api/v1/health");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "API route not found", requestId: response.headers["x-request-id"] } });
  });
});

it("sets restrictive framing, referrer and browser capability headers",async()=>{const response=await request(createApp()).get("/api/v1/health");expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");expect(response.headers["content-security-policy"]).toContain("object-src 'none'");expect(response.headers["permissions-policy"]).toContain("camera=()");expect(response.headers["referrer-policy"]).toBe("no-referrer");expect(response.headers["x-content-type-options"]).toBe("nosniff");});

it("accepts forwarded client IPs only from configured proxy peers",async()=>{for(const [trustProxy,expected]of [[false,false],[["127.0.0.1","::1"],true]] as const){const app=createApp({trustProxy:trustProxy===false?false:[...trustProxy]});app.get("/peer",(req,res)=>res.json({ip:req.ip}));const response=await request(app).get("/peer").set("X-Forwarded-For","203.0.113.4");expect(response.body.ip==="203.0.113.4").toBe(expected);}});
