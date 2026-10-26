import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { messageSchema, staffActivationSchema } from "@psycocity/validation";
import { apiPost } from "../lib/api";
import { Field } from "../components/field";
import { Button, Notice } from "../components/ui";
export function meta() { return [{ title: "Staff invitation — Psycocity" }, { name: "robots", content: "noindex" }]; }
export default function StaffActivate() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const [error, setError] = useState("");
  const mutation = useMutation({ mutationFn: (body: unknown) => apiPost("/staff/activate", body, messageSchema), onSuccess: async () => { await navigate("/admin/mfa", { replace: true }); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const input = staffActivationSchema.safeParse({ token: params.get("token"), password: new FormData(event.currentTarget).get("password") });
    if (!input.success) { setError("Use a valid invitation and a password of 12–128 characters"); return; }
    setError(""); mutation.mutate(input.data);
  }
  return <main id="main" className="page wrap auth-page"><p className="eyebrow">PRIVATE STAFF INVITATION</p><h1>Welcome to the team.</h1><p className="lede">For an existing account, enter its current password. New staff choose a strong password. This invitation cannot reset an existing account’s password. Authenticator verification follows activation.</p><form className="auth-form" onSubmit={submit} noValidate><Field label="Account password" name="password" type="password" required autoComplete="current-password" /><Button disabled={mutation.isPending}>Accept staff invitation</Button></form>{(error || mutation.isError) && <Notice error>{error || mutation.error?.message}</Notice>}</main>;
}
