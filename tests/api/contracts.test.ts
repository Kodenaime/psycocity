import request from "supertest";
import { describe, expect, it } from "vitest";
import { apiErrorSchema } from "@psycocity/validation";
import { createApp } from "../../apps/api/src/app.js";

describe("API contract boundary", () => {
  it("rejects unsupported input with a safe typed error and consistent request ID", async () => {
    const response = await request(createApp()).get("/api/v1/health?unexpected=private-value").set("X-Request-ID", "integration-request-01");
    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.requestId).toBe("integration-request-01");
    expect(response.headers["x-request-id"]).toBe(body.error.requestId);
    expect(response.text).not.toContain("private-value");
  });
  it("replaces malformed correlation IDs instead of reflecting arbitrary input", async () => {
    const response = await request(createApp()).get("/api/unknown").set("X-Request-ID", "bad id");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(apiErrorSchema.parse(response.body).error.requestId).toBe(response.headers["x-request-id"]);
  });
});
