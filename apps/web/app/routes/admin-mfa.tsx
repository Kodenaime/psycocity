import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { mfaEnrollmentSchema, mfaInfoSchema, mfaResultSchema, messageSchema } from "@psycocity/validation";
import { ApiError, apiGet, apiPost } from "../lib/api";
import { Field } from "../components/field";
import { Button, Notice } from "../components/ui";
export function meta() { return [{ title: "Staff security — Psycocity" }, { name: "robots", content: "noindex" }]; }
export default function AdminMfa() {
  const navigate = useNavigate(); const client = useQueryClient();
  const [qr, setQr] = useState(""); const [method, setMethod] = useState<"totp" | "recovery">("totp"); const [codes, setCodes] = useState<string[]>([]); const [stored, setStored] = useState(false);
  const query = useQuery({ queryKey: ["admin", "mfa"], queryFn: ({ signal }) => apiGet("/admin/mfa/info", mfaInfoSchema, signal), refetchOnMount: "always" });
  const enroll = useMutation({ mutationFn: () => apiPost("/admin/mfa/enrollment", {}, mfaEnrollmentSchema) });
  const verify = useMutation({ mutationFn: (code: string) => apiPost("/admin/mfa/verify", { method, code }, mfaResultSchema), onSuccess: async data => {
    client.removeQueries({ queryKey: ["auth", "me"] }); client.removeQueries({ queryKey: ["admin", "overview"] });
    if (data.recoveryCodes) setCodes(data.recoveryCodes); else await navigate("/admin", { replace: true });
  } });
  const logout = useMutation({ mutationFn: () => apiPost("/auth/logout", {}, messageSchema), onSuccess: async () => { client.clear(); await navigate("/admin/login", { replace: true }); } });
  const uri = enroll.data?.uri;
  useEffect(() => { let active = true; if (uri) void QRCode.toDataURL(uri, { width: 240, margin: 1 }).then(value => { if (active) setQr(value); }).catch(() => { if (active) setQr(""); }); return () => { active = false; }; }, [uri]);
  useEffect(() => { if (query.isError && query.error instanceof ApiError && query.error.status === 401) void navigate("/admin/login", { replace: true }); }, [query.isError, query.error, navigate]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); verify.mutate(String(new FormData(event.currentTarget).get("code") ?? "").trim()); }
  return <main id="main" className="page wrap auth-page"><p className="eyebrow">STAFF SECURITY</p><h1>{codes.length ? "Keep these safe." : "One more layer."}</h1>
    {codes.length ? <section><h2>Save your recovery codes</h2><p>These codes are shown once. Store them securely outside this browser. Each can replace one authenticator verification.</p><ul className="recovery-grid">{codes.map(code => <li key={code}><code data-testid="mfa-recovery-code">{code.match(/.{1,4}/g)!.join("-")}</code></li>)}</ul><label className="check-row"><input type="checkbox" checked={stored} onChange={event => setStored(event.target.checked)} />I have stored my recovery codes securely.</label><Button disabled={!stored} onClick={() => void navigate("/admin", { replace: true })}>Continue to administration</Button></section> : query.isPending ? <Notice>Checking your staff session…</Notice> : query.isError ? <Notice error>{query.error.message}</Notice> : <section><p>{query.data.email}</p>{!query.data.enabled ? <div><p>Set up an authenticator app before accessing administration. The setup key and QR code are private; do not share or screenshot them.</p>{!enroll.data ? <Button disabled={enroll.isPending} onClick={() => enroll.mutate()}>Set up authenticator</Button> : <div className="mfa-setup">{qr && <img src={qr} width={240} height={240} alt="Private authenticator setup QR code" />}<p>Or enter this setup key manually:</p><code data-testid="mfa-setup-key">{enroll.data.secret}</code></div>}</div> : <p>Enter a fresh authenticator code, or use one of your single-use recovery codes.</p>}
    {(query.data.enabled || enroll.data) && <form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="security-method">Verification method</label><select id="security-method" value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="totp">Authenticator</option>{query.data.enabled && <option value="recovery">Recovery code</option>}</select></div><Field label={method === "totp" ? "Authenticator code" : "Recovery code"} name="code" autoComplete="one-time-code" inputMode={method === "totp" ? "numeric" : "text"} required /><Button disabled={verify.isPending}>Verify code</Button></form>}
    {(enroll.isError || verify.isError) && <Notice error>{(enroll.error ?? verify.error)?.message}</Notice>}</section>}
  <div className="account-links"><Button className="button-secondary" disabled={logout.isPending} onClick={() => logout.mutate()}>Use another account</Button></div>
  </main>;
}
