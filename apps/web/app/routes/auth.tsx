import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authCapabilitiesSchema, emailRequestSchema, loginSchema, loginResponseSchema, messageSchema, registerSchema, resetPasswordSchema, tokenSchema } from "@psycocity/validation";
import { Field } from "../components/field";
import { Button, Notice } from "../components/ui";
import { apiGet, apiPost } from "../lib/api";
export function meta() { return [{ title: "Applicant access — Psycocity" }, { name: "robots", content: "noindex" }]; }
const modes = {
  "/admin/login": { heading: "Staff access.", description: "Sign in, then verify with your authenticator. Staff access is invitation-only.", action: "Sign in", endpoint: "login", schema: loginSchema },
  "/applicant/register": { heading: "Your next chapter.", description: "Create your applicant account. Application submission is free; member activation is separate.", action: "Create applicant account", endpoint: "register", schema: registerSchema },
  "/applicant/login": { heading: "Welcome back.", description: "Sign in to your applicant account.", action: "Sign in", endpoint: "login", schema: loginSchema },
  "/applicant/forgot-password": { heading: "A fresh start.", description: "Request a private password reset link.", action: "Send reset link", endpoint: "forgot-password", schema: emailRequestSchema },
  "/applicant/reset-password": { heading: "Choose a new password.", description: "This private link can be used once.", action: "Update password", endpoint: "reset-password", schema: resetPasswordSchema },
  "/applicant/verify-email": { heading: "Make it official.", description: "Confirm your email using the private link you received.", action: "Verify email", endpoint: "verify-email", schema: tokenSchema },
  "/applicant/resend-verification": { heading: "Check your inbox.", description: "Request a replacement verification link. Older links will no longer work.", action: "Send verification link", endpoint: "resend-verification", schema: emailRequestSchema },
};
export default function Auth() {
  const { pathname } = useLocation();
  const mode = modes[pathname as keyof typeof modes];
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const capabilities = useQuery({ queryKey: ["auth", "capabilities"], queryFn: ({ signal }) => apiGet("/auth/capabilities", authCapabilitiesSchema, signal) });
  const mutation = useMutation({ mutationFn: (body: unknown) => apiPost(`/auth/${mode.endpoint}`, body, mode.endpoint === "login" ? loginResponseSchema : messageSchema), onSuccess: async data => {
    if (mode.endpoint === "login") { client.removeQueries({ queryKey: ["auth", "me"] }); await navigate("mfaRequired" in data && data.mfaRequired ? "/admin/mfa" : "/applicant/dashboard"); }
    if (mode.endpoint === "reset-password" || mode.endpoint === "verify-email") await navigate(pathname, { replace: true });
  } });
  const isToken = mode.endpoint === "verify-email" || mode.endpoint === "reset-password";
  const needsMail = ["register", "forgot-password", "resend-verification"].includes(mode.endpoint);
  const unavailable = needsMail && (!capabilities.data?.registrationAvailable || capabilities.isError);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (isToken) fields.token = params.get("token") ?? "";
    const parsed = mode.schema.safeParse(fields);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] ??= issue.message;
      setErrors(nextErrors); return;
    }
    setErrors({}); mutation.mutate(parsed.data);
  }
  return <main id="main" className="page wrap auth-page"><p className="eyebrow">{pathname.startsWith("/admin") ? "STAFF ACCESS" : "APPLICANT ACCESS"}</p><h1>{mode.heading}</h1><p className="lede">{mode.description}</p>
    {capabilities.data?.testMode && <p className="test-banner">Development environment — use sample details only.</p>}
    {needsMail && capabilities.isPending ? <Notice>Checking account availability…</Notice> : unavailable ? <Notice>Account registration and email requests are not available yet.</Notice> : mutation.isSuccess && mode.endpoint !== "login" ? <Notice>{mutation.data.message}</Notice> : <form className="auth-form" onSubmit={submit} noValidate>
      {["register", "forgot-password", "resend-verification"].includes(mode.endpoint) && <Field label="Email address" name="email" type="email" autoComplete="email" required error={errors.email} />}
      {mode.endpoint === "login" && <Field label="Email or username" name="identifier" autoComplete="username" required error={errors.identifier} />}
      {["register", "login", "reset-password"].includes(mode.endpoint) && <Field label={mode.endpoint === "reset-password" ? "New password" : "Password"} name="password" type="password" autoComplete={mode.endpoint === "login" ? "current-password" : "new-password"} required hint={mode.endpoint === "login" ? undefined : "Use 12–128 characters. A unique passphrase works well."} error={errors.password} />}
      {errors.token && <Notice error>This private link is invalid or missing. Request a new link.</Notice>}
      {mutation.isError && <Notice error>{mutation.error instanceof Error ? mutation.error.message : "Please try again"}</Notice>}
      <Button type="submit" disabled={mutation.isPending || capabilities.isPending}>{mutation.isPending ? "Please wait…" : mode.action}</Button>
    </form>}
    <nav className="account-links" aria-label="Account options"><Link to="/applicant/login">Sign in</Link>{!pathname.startsWith("/admin") && <Link to="/applicant/register">Create an account</Link>}<Link to="/applicant/forgot-password">Forgot password?</Link><Link to="/applicant/resend-verification">Resend verification</Link></nav>
  </main>;
}
