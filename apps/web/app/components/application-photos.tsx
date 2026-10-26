import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mediaPageSchema, messageSchema, photoSlots, uploadGrantSchema } from "@psycocity/validation";
import { apiGet, apiPost, uploadPhoto } from "../lib/api";
import { Button, Notice } from "./ui";
const labels = { headshot: "Headshot", profile: "Side profile", full_body_front: "Full-body front", full_body_side: "Full-body side", portfolio: "Portfolio (optional)" };
export function ApplicationPhotos({ applicationId, allowedSlots }: { applicationId: string; allowedSlots?: string[] }) {
  const client = useQueryClient(); const [localError, setLocalError] = useState("");
  const query = useQuery({ queryKey: ["media", applicationId], queryFn: ({ signal }) => apiGet(`/media/application/${applicationId}`, mediaPageSchema, signal) });
  const upload = useMutation({ mutationFn: async ({ slot, file }: { slot: typeof photoSlots[number]; file: File }) => {
    const grant = await apiPost("/media/uploads", { applicationId, slot }, uploadGrantSchema);
    if (file.size > grant.maxBytes) throw new Error("Choose an image no larger than 10 MB");
    await uploadPhoto(grant, file);
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["media", applicationId] }); await client.invalidateQueries({ queryKey: ["application-requirements", applicationId] }); } });
  const remove = useMutation({ mutationFn: (id: string) => apiPost(`/media/${id}/remove`, {}, messageSchema), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["media", applicationId] }); await client.invalidateQueries({ queryKey: ["application-requirements", applicationId] }); } });
  return <section><p>Use recent, clear photos in simple clothing, with natural light and no heavy filters. Professional shoots are not required for academy applicants. Never upload nude images.</p><p className="fine-print">Four views are required. JPEG, PNG or WebP, 200 × 200 pixels minimum, up to 10 MB each. Add up to ten optional portfolio images. Photos remain private to you and authorized agency staff.</p>
    {query.isPending ? <Notice>Loading private photographs…</Notice> : query.isError ? <Notice error>Could not load your photos. Please try again.</Notice> : <div className="photo-grid">{photoSlots.map(slot => <section className="photo-card" key={slot}><h3>{labels[slot]}</h3>{query.data.items.filter(item => item.slot === slot).map(item => <figure key={item.id}><img src={item.previewUrl} width={item.width} height={item.height} loading="lazy" alt={`Your ${labels[slot].toLowerCase()} application photo`} /><Button className="button-secondary" disabled={remove.isPending || Boolean(allowedSlots && !allowedSlots.includes(slot))} onClick={() => remove.mutate(item.id)} aria-label={`Remove ${labels[slot]} photo`}>Remove</Button></figure>)}<label className="upload-label" htmlFor={`photo-${slot}`}>{slot === "portfolio" ? "Add portfolio image" : `Upload ${labels[slot].toLowerCase()}`}</label><input id={`photo-${slot}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={upload.isPending || Boolean(allowedSlots && !allowedSlots.includes(slot))} onChange={event => {
      const input = event.currentTarget; const file = input.files?.[0]; if (!file) return;
      setLocalError("");
      if (file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setLocalError("Choose a JPEG, PNG or WebP image no larger than 10 MB"); input.value = ""; return; }
      upload.mutate({ slot, file }, { onSettled: () => { input.value = ""; } });
    }} /></section>)}</div>}
    {upload.isPending && <Notice>Uploading and checking your photograph…</Notice>}
    {upload.isSuccess && !upload.isPending && <Notice>Photograph saved privately.</Notice>}
    {(localError || upload.isError || remove.isError) && <Notice error>{localError || (upload.error ?? remove.error)?.message}</Notice>}
  </section>;
}
