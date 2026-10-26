import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../apps/api/src/app.js";
import { safeErrorHandler } from "../../apps/api/src/errors.js";

describe("database readiness and safe errors", () => {
  it("fails closed without an installed database probe, while liveness stays healthy", async () => {
    const app = createApp();
    const response = await request(app).get("/api/v1/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "not_ready" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });
  it("returns ready only after the connected probe succeeds", async () => {
    const response = await request(createApp({ isDatabaseReady: async () => true })).get("/api/v1/ready");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready" });
  });
  it("does not disclose a throwing database probe's error", async () => {
    const response = await request(createApp({ isDatabaseReady: async () => { throw new Error("mongodb://private:credential@host/db"); } })).get("/api/v1/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "not_ready" });
    expect(response.text).not.toContain("credential");
  });
  it("closes a partial response without forwarding a secret-bearing error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = express();
      app.get("/api/partial", async (_request, response) => {
        response.write("partial");
        throw new Error("mongodb://private:credential@host/db");
      });
      app.use(safeErrorHandler);
      await expect(request(app).get("/api/partial")).rejects.toThrow();
      expect(log).toHaveBeenCalledWith("Request failed after response headers were sent");
      expect(JSON.stringify(log.mock.calls)).not.toContain("credential");
    } finally { log.mockRestore(); }
  });
  it("sanitizes unexpected async API errors instead of exposing a stack or URI", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = express();
      app.get("/api/error", async () => { throw new Error("mongodb://private:credential@host/db"); });
      app.use(safeErrorHandler);
      const response = await request(app).get("/api/error");
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId: response.headers["x-request-id"] } });
      expect(log).toHaveBeenCalledWith("Request failed unexpectedly");
      expect(JSON.stringify(log.mock.calls)).not.toContain("credential");
    } finally { log.mockRestore(); }
  });
});
