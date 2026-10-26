import { apiErrorSchema, type z } from "@psycocity/validation";
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string, public details?: { path: string; message: string }[]) { super(message); }
}
async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(response.status, parsed.success ? parsed.data.error.code : "UNAVAILABLE", parsed.success ? parsed.data.error.message : "The request could not be completed", parsed.success ? parsed.data.error.requestId : undefined, parsed.success ? parsed.data.error.details : undefined);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(502, "INVALID_RESPONSE", "The service returned an unexpected response");
  return parsed.data;
}
export async function apiGet<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  return parseResponse(await fetch(`/api/v1${path}`, { signal, credentials: "same-origin", headers: { Accept: "application/json" } }), schema);
}
async function apiMutation<T>(method: "POST" | "PATCH", path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const csrf = typeof document === "undefined" ? undefined : document.cookie.split("; ").find(value => value.startsWith("psycocity_csrf="))?.split("=")[1];
  return parseResponse(await fetch(`/api/v1${path}`, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "Psycocity", ...(csrf ? { "X-CSRF-Token": csrf } : {}) }, body: JSON.stringify(body) }), schema);
}

export const apiPost = <T,>(path: string, body: unknown, schema: z.ZodType<T>) => apiMutation("POST", path, body, schema);
export const apiPatch = <T,>(path: string, body: unknown, schema: z.ZodType<T>) => apiMutation("PATCH", path, body, schema);

export async function uploadPhoto(grant: { uploadUrl: string; uploadToken: string }, file: File) {
  if (!/^\/api\/v1\/(?:media|member\/portfolio)\/uploads\/[0-9a-f]{24}$/.test(grant.uploadUrl)) throw new ApiError(502, "INVALID_RESPONSE", "Invalid upload destination");
  const csrf = document.cookie.split("; ").find(value => value.startsWith("psycocity_csrf="))?.split("=")[1];
  const response = await fetch(grant.uploadUrl, { method: "PUT", redirect: "error", credentials: "same-origin", headers: { "Content-Type": file.type, "X-Requested-With": "Psycocity", "X-Upload-Token": grant.uploadToken, ...(csrf ? { "X-CSRF-Token": csrf } : {}) }, body: file });
  const { messageSchema } = await import("@psycocity/validation");
  return parseResponse(response, messageSchema);
}
