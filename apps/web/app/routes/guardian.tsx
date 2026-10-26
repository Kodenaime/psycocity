import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { guardianDecisionSchema, guardianPreviewSchema, messageSchema } from "@psycocity/validation";
import { apiPost } from "../lib/api";
import { Field } from "../components/field";
import { Button, Notice } from "../components/ui";
export function meta() { return [{ title: "Guardian decision — Psycocity" }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }]; }
export default function Guardian() {
  const [params] = useSearchParams(); const token = params.get("token") ?? "";
  const { pathname } = useLocation(); const navigate = useNavigate();
  const purpose = pathname.endsWith("withdraw") ? "withdraw" : "consent";
  const [error, setError] = useState("");
  const preview = useMutation({ mutationFn: (body: { token: string; purpose: string }) => apiPost("/guardian/preview", body, guardianPreviewSchema) });
  const load = preview.mutate;
  useEffect(() => { if (token) load({ token, purpose }); }, [token, purpose, load]);
  const decision = useMutation({ mutationFn: ({ action, body }: { action: string; body: unknown }) => apiPost(`/guardian/${action}`, body, messageSchema), onSuccess: async () => { await navigate(pathname, { replace: true }); } });
  function consent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const parsed = guardianDecisionSchema.safeParse({ token, guardianName: fields.get("guardianName"), relationship: fields.get("relationship"), adult: fields.get("adult") === "on", agrees: fields.get("agrees") === "on", policyVersion: preview.data?.policyVersion });
    if (!parsed.success) { setError("Enter your name and relationship, and confirm both declarations before consenting."); return; }
    setError(""); decision.mutate({ action: "consent", body: parsed.data });
  }
  return <main id="main" className="page wrap auth-page"><p className="eyebrow">PRIVATE GUARDIAN DECISION</p><h1>{purpose === "consent" ? "A considered decision." : "Your consent. Your choice."}</h1>
    {decision.isSuccess ? <Notice>{decision.data.message}</Notice> : !token ? <Notice error>This private link is missing. Open the link from your guardian email.</Notice> : preview.isPending ? <Notice>Loading the consent request…</Notice> : preview.isError ? <Notice error>{preview.error.message}</Notice> : preview.data && <section className="prose-section"><h2>{preview.data.applicantName}</h2><p>This request concerns academy admission assessment for a 16–17-year-old applicant, including their application information and photographs. It does not grant you access to their account or automatically admit them.</p><p>Read the <Link className="text-link" to="/privacy" target="_blank" rel="noreferrer">privacy notice</Link> before deciding. Consent version: {preview.data.policyVersion}.</p>
      {purpose === "withdraw" ? <div><p>Withdrawing will pause further processing and flag the application for agency review. It does not erase records that must be retained or automatically refund payments.</p><Button disabled={decision.isPending} onClick={() => decision.mutate({ action: "withdraw", body: { token } })}>Withdraw consent</Button></div> : <form onSubmit={consent} noValidate><Field label="Your full name" name="guardianName" defaultValue={preview.data.guardianName} required /><div className="field"><label htmlFor="confirmed-relationship">Your relationship to the applicant</label><select id="confirmed-relationship" name="relationship" defaultValue={preview.data.relationship}><option value="parent">Parent</option><option value="legal_guardian">Legal guardian</option></select></div><fieldset className="consent-checks"><legend>Your declarations</legend><label><input type="checkbox" name="adult" />I am at least 18 and authorized to act as this applicant’s parent or legal guardian.</label><label><input type="checkbox" name="agrees" />I have read the privacy information and consent to this application information and photographs being processed for admission assessment.</label></fieldset><div className="actions"><Button type="submit" disabled={decision.isPending}>Record my consent</Button><Button type="button" className="button-secondary" disabled={decision.isPending} onClick={() => decision.mutate({ action: "decline", body: { token } })}>Decline consent</Button></div></form>}
    </section>}
    {(error || decision.isError) && <Notice error>{error || decision.error?.message}</Notice>}
  </main>;
}
