export function readAuthConfig(env: Record<string, string | undefined>, mode: string) {
  const originValue = env.APP_ORIGIN ?? "http://localhost:5173";
  let origin: URL;
  try { origin = new URL(originValue); } catch { throw new Error("APP_ORIGIN must be an absolute origin"); }
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("APP_ORIGIN must be an HTTP(S) origin without credentials, path or query");
  if (mode === "production" && env.APP_ORIGIN && origin.protocol !== "https:") throw new Error("APP_ORIGIN requires HTTPS in production");
  if (env.SERVE_WEB && !["true", "false"].includes(env.SERVE_WEB)) throw new Error("SERVE_WEB must be true or false");
  if (env.POLICIES_APPROVED && !["true", "false"].includes(env.POLICIES_APPROVED)) throw new Error("POLICIES_APPROVED must be true or false");
  const approved = env.POLICIES_APPROVED === "true" || (mode !== "production" && env.POLICIES_APPROVED !== "false");
  return { origin: origin.origin, production: mode === "production", serveWeb: env.SERVE_WEB === "true" || (mode === "production" && env.SERVE_WEB !== "false"), registrationEnabled: approved && (mode !== "production" || Boolean(env.APP_ORIGIN)) };
}
export type AuthConfig = ReturnType<typeof readAuthConfig>;
