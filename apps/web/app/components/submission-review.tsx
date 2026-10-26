import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applicationSchema, submissionRequirementsSchema } from "@psycocity/validation";
import { apiGet, apiPost, ApiError } from "../lib/api";
import { Button, Notice } from "./ui";
export function SubmissionReview({ applicationId, version, dirty, onIssue }: { applicationId: string; version: number; dirty: boolean; onIssue: (path: string) => void }) {
  const client = useQueryClient(); const [accuracy, setAccuracy] = useState(false); const [terms, setTerms] = useState(false); const [privacy, setPrivacy] = useState(false);
  const query = useQuery({ queryKey: ["application-requirements", applicationId], queryFn: ({ signal }) => apiGet(`/applications/${applicationId}/requirements`, submissionRequirementsSchema, signal), refetchOnMount: "always" });
  const submit = useMutation({ mutationFn: () => apiPost(`/applications/${applicationId}/submit`, { version, declarations: { accuracy, termsAccepted: terms, privacyAccepted: privacy, termsVersion: query.data?.termsVersion, privacyVersion: query.data?.privacyVersion } }, applicationSchema), onSuccess: async data => {
    client.setQueryData(["applications", applicationId], data); await client.invalidateQueries({ queryKey: ["applications", "list"] });
  } });
  const errors = submit.error instanceof ApiError ? submit.error.details : undefined;
  return <section className="submission-panel"><h3>Before you submit</h3><p>Your application is assessed before payment. There is no payment due to submit and no guarantee of admission or work.</p>
    {dirty && <Notice>Save your changes before reviewing the final requirements.</Notice>}
    {query.isPending ? <Notice>Checking the final requirements…</Notice> : query.isError ? <Notice error>Could not check requirements. Please try again.</Notice> : query.data.issues.length > 0 ? <div><h4>Complete these requirements</h4><ul className="requirement-list">{query.data.issues.map((issue, index) => <li key={`${issue.path}-${index}`}><button type="button" onClick={() => onIssue(issue.path)}>{issue.path.replace(/^answers\./, "").replaceAll(".", " — ")}: {issue.message}</button></li>)}</ul></div> : <Notice>Your saved application meets the submission requirements.</Notice>}
    <fieldset className="consent-checks"><legend>Your declarations</legend><label><input type="checkbox" checked={accuracy} onChange={event => setAccuracy(event.target.checked)} />I confirm my details and photographs are accurate and current.</label><label><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} />I have read and accept the application terms.</label><label><input type="checkbox" checked={privacy} onChange={event => setPrivacy(event.target.checked)} />I have read the privacy notice and agree to processing for this application.</label></fieldset>
    <p className="fine-print"><Link className="text-link" to="/terms" target="_blank" rel="noreferrer">Application terms</Link> · <Link className="text-link" to="/privacy" target="_blank" rel="noreferrer">Privacy notice</Link>. Unpublished draft policies are for test workflows only.</p>
    <Button disabled={dirty || !query.data?.canSubmit || !accuracy || !terms || !privacy || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit application — no payment"}</Button>
    {submit.isError && <Notice error>{submit.error.message}</Notice>}{errors && <ul className="requirement-list">{errors.map((issue, index) => <li key={index}><button onClick={() => onIssue(issue.path)}>{issue.message}</button></li>)}</ul>}
  </section>;
}
