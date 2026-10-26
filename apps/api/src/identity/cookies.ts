import { serialize } from "cookie";
import type { Response } from "express";
import { sessionCookieName } from "./service.js";
export function setSessionCookies(response: Response, session: { token: string; csrfToken: string; expiresAt: Date }, secure: boolean) {
  const options = { secure, sameSite: "lax" as const, path: "/", expires: session.expiresAt };
  response.set("Set-Cookie", [serialize(sessionCookieName, session.token, { ...options, httpOnly: true }), serialize("psycocity_csrf", session.csrfToken, options)]);
}
export function clearSessionCookies(response: Response, secure: boolean) {
  const options = { secure, sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.set("Set-Cookie", [serialize(sessionCookieName, "", { ...options, httpOnly: true }), serialize("psycocity_csrf", "", options)]);
}
