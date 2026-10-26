import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { apiErrorSchema, type ErrorCode } from "@psycocity/validation";

export const requestContext: RequestHandler = (request, response, next) => {
  const supplied = request.get("X-Request-ID");
  response.set("X-Request-ID", supplied && /^[a-zA-Z0-9_-]{8,64}$/.test(supplied) ? supplied : randomUUID());
  next();
};
export function sendError(response: Response, status: number, code: ErrorCode, message: string, details?: { path: string; message: string }[]) {
  let requestId = response.getHeader("X-Request-ID");
  if (typeof requestId !== "string") { requestId = randomUUID(); response.set("X-Request-ID", requestId); }
  return response.status(status).json(apiErrorSchema.parse({ error: { code, message, requestId, ...(details ? { details } : {}) } }));
}
