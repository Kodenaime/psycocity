import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { paymentStatusSchema } from "@psycocity/validation";
import { apiGet } from "../lib/api";
import { Notice } from "../components/ui";
export function meta() {return [{title: "Payment status — Psycocity"}, {name: "robots", content: "noindex"}];}
export default function PaymentReturn() {
  const [params] = useSearchParams(); const reference = params.get("reference") ?? ""; const valid = /^psyc_[0-9a-f]{40}$/.test(reference);
  const query = useQuery({queryKey: ["payment", reference], enabled: valid, queryFn: ({signal}) => apiGet(`/payments/${reference}`, paymentStatusSchema, signal), refetchInterval: query => query.state.data && !["successful", "failed"].includes(query.state.data.state) ? 5000 : false});
  return <main id="main" className="page wrap"><p className="eyebrow">YOUR PRIVATE PAYMENT</p><h1>Payment status.</h1>{!valid ? <Notice error>A valid payment reference is required.</Notice> : query.isPending ? <Notice>Checking the server’s payment record…</Notice> : query.isError ? <Notice error>{query.error.message} Sign in to the applicant account that started this payment.</Notice> : <><p>Reference: {query.data.reference}</p><Notice>{query.data.message}</Notice><p>Status: {query.data.state.replaceAll("_", " ")}. Amount: {new Intl.NumberFormat("en-NG", {style: "currency", currency: query.data.currency}).format(query.data.amountKobo / 100)}.</p>{query.data.checkoutUrl && <a className="button" href={query.data.checkoutUrl}>Resume the same Paystack test checkout</a>}</>}<div className="actions"><Link className="text-link" to="/applicant/dashboard">Back to applicant account</Link><Link className="text-link" to="/applicant/login">Applicant sign-in</Link></div></main>;
}
