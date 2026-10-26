import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { guardianRequestSchema, guardianStatusSchema, messageSchema } from "@psycocity/validation";
import { apiGet, apiPost } from "../lib/api";
import { Field } from "./field";
import { Button, Notice } from "./ui";
import { ApplicationPhotos } from "./application-photos";
export function ApplicationPhotoStep({ applicationId, dirty, allowedSlots, guardianEditable = true }: { applicationId: string; dirty: boolean; allowedSlots?: string[]; guardianEditable?: boolean }) {
  const client = useQueryClient(); const [error, setError] = useState("");
  const query = useQuery({ queryKey: ["guardian", applicationId], queryFn: ({ signal }) => apiGet(`/applications/${applicationId}/guardian`, guardianStatusSchema, signal), refetchInterval: query => query.state.data?.required ? 3000 : false, refetchOnWindowFocus: true });
  const send = useMutation({ mutationFn: (data: unknown) => apiPost(`/applications/${applicationId}/guardian/request`, data, messageSchema), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["guardian", applicationId] }); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const input = guardianRequestSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!input.success) { setError("Provide the guardian’s name, separate email address and relationship."); return; }
    setError(""); send.mutate(input.data);
  }
  if (dirty) return <Notice>Save your latest changes before requesting consent or uploading photos.</Notice>;
  if (query.isPending) return <Notice>Checking photo and consent requirements…</Notice>;
  if (query.isError) return <Notice error>{query.error.message}</Notice>;
  return <div>{query.data.required && <section className="guardian-panel"><h3>Guardian consent</h3><p>Academy applicants aged 16–17 need consent from an adult parent or legal guardian. We will send a private decision link to their separate email. Email verification records their declaration; it does not independently prove legal guardianship.</p><p><strong>Current status:</strong> {query.data.status.replaceAll("_", " ")}</p>{query.data.status !== "consented" && guardianEditable && <form className="auth-form" onSubmit={submit} noValidate><Field label="Guardian’s full name" name="guardianName" defaultValue={query.data.guardianName} required /><Field label="Guardian’s email address" name="email" type="email" defaultValue={query.data.guardianEmail} required /><div className="field"><label htmlFor="guardian-relationship">Relationship</label><select id="guardian-relationship" name="relationship" defaultValue={query.data.relationship ?? ""}><option value="">Select a relationship</option><option value="parent">Parent</option><option value="legal_guardian">Legal guardian</option></select></div><Button disabled={send.isPending}>Send guardian request</Button></form>}{send.isSuccess && <Notice>{send.data.message}</Notice>}{(error || send.isError) && <Notice error>{error || send.error?.message}</Notice>}</section>}
    {query.data.canUpload ? <ApplicationPhotos applicationId={applicationId} allowedSlots={allowedSlots} /> : <Notice>Photo collection is paused. Complete eligible saved personal details and any required guardian consent. A withdrawn consent hold requires agency review or fresh valid guardian consent.</Notice>}
  </div>;
}
