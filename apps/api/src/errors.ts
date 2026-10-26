import type { ErrorRequestHandler } from "express";
import { sendError } from "./http.js";

export const safeErrorHandler: ErrorRequestHandler = (_error, request, response, _next) => {
  if (response.headersSent) {
    console.error("Request failed after response headers were sent");
    response.destroy();
    return;
  }
  if (typeof _error === "object" && _error !== null && "type" in _error && _error.type === "entity.too.large") {
    sendError(response, 413, "INVALID_REQUEST", "The request body is too large"); return;
  }
  if (_error instanceof SyntaxError) {
    sendError(response, 400, "INVALID_REQUEST", "The request body could not be read");
    return;
  }
  // The response and log contain no driver errors, URI, stack or credentials.
  console.error("Request failed unexpectedly");
  if (request.path.startsWith("/api")) {
    sendError(response, 500, "INTERNAL_ERROR", "Internal server error");
  } else {
    response.status(500).type("text/plain").send("Internal server error");
  }
};
