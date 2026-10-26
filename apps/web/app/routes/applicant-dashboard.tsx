import { PaymentHistory } from "../components/payment-records";
import { ApplicantAppointments } from "../components/admission-events";
import { ApplicantDrafts } from "../components/applicant-drafts";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currentUserSchema, messageSchema } from "@psycocity/validation";
import { apiGet, apiPost, ApiError } from "../lib/api";
import { Button, ButtonLink, Notice } from "../components/ui";
export function meta() { return [{ title: "Your application — Psycocity" }, { name: "robots", content: "noindex" }]; }
export default function ApplicantDashboard() {
  const navigate = useNavigate(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["auth", "me"], queryFn: ({ signal }) => apiGet("/auth/me", currentUserSchema, signal) });
  const logout = useMutation({ mutationFn: () => apiPost("/auth/logout", {}, messageSchema), onSuccess: async () => { client.clear(); await navigate("/applicant/login", { replace: true }); } });
  useEffect(() => { if (query.data?.user.mfaRequired) void navigate("/admin/mfa", { replace: true }); }, [query.data, navigate]);
  useEffect(() => { if (query.isError && query.error instanceof ApiError && query.error.status === 401) void navigate("/applicant/login", { replace: true }); }, [query.isError, query.error, navigate]);
  if (query.isPending) return <main id="main" className="page wrap"><Notice>Loading your account…</Notice></main>;
  if (query.isError) return <main id="main" className="page wrap"><Notice error>We could not load your account.</Notice><Button onClick={() => void query.refetch()}>Try again</Button></main>;
  return <main id="main" className="page wrap"><p className="eyebrow">YOUR APPLICANT ACCOUNT</p><h1>Your next chapter.</h1><p>{query.data.user.email}</p>{!query.data.user.verified ? <div><Notice>Please verify your email before starting an application.</Notice><ButtonLink to="/applicant/resend-verification" secondary>Request verification</ButtonLink></div> : query.data.user.roles.includes("applicant") ? <><ApplicantDrafts /><ApplicantAppointments /><PaymentHistory /></> : <Notice>This account does not have applicant access. Use its assigned portal or contact the agency.</Notice>}<div className="actions"><Button disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button><ButtonLink to="/join" secondary>Explore the tracks</ButtonLink></div>{logout.isError && <Notice error>Could not sign out. Please try again.</Notice>}</main>;
}
