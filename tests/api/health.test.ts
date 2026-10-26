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
