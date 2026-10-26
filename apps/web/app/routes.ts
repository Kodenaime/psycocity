import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [layout("components/site-layout.tsx", [
  index("routes/home.tsx"),
  route("join", "routes/join.tsx"),
  route("academy", "routes/academy.tsx"),
  route("faq", "routes/faq.tsx"),
  route("status", "routes/status.tsx"),
  route("guardian/consent", "routes/guardian.tsx", { id: "guardian-consent" }),
  route("guardian/withdraw", "routes/guardian.tsx", { id: "guardian-withdraw" }),
  route("admin/login", "routes/auth.tsx", { id: "auth-admin-login" }),
  route("admin/activate", "routes/staff-activate.tsx"),
  route("admin/mfa", "routes/admin-mfa.tsx"),
  ...["admin", "admin/staff", "admin/audit", "admin/applications", "admin/applications/:id", "admin/events"].map(path => route(path, "routes/admin.tsx", { id: path.replaceAll("/", "-") })),
  route("apply", "routes/apply.tsx"),
  route("applicant/payment-return", "routes/payment-return.tsx"),
  route("applicant/dashboard", "routes/applicant-dashboard.tsx"),
  route("applicant/application/:id", "routes/application.tsx"),
  ...["register", "login", "forgot-password", "reset-password", "verify-email", "resend-verification"].map((path) => route(`applicant/${path}`, "routes/auth.tsx", { id: `auth-${path}` })),
  ...["models", "contact", "booking", "member/login"].map((path) => route(path, "routes/information.tsx", { id: path.replaceAll("/", "-") })),
  ...["privacy", "terms", "refund-policy"].map((path) => route(path, "routes/policy.tsx", { id: path })),
])] satisfies RouteConfig;
