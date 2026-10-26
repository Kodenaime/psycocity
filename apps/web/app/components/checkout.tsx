import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { checkoutCapabilitiesSchema, paymentStatusSchema } from "@psycocity/validation";
import { apiGet, apiPost } from "../lib/api";
import { Button, Notice } from "./ui";
export function Checkout({offerId, termsVersion}: {offerId: string; termsVersion: string}) {
  const [acceptsTerms, setAcceptsTerms] = useState(false); const navigate = useNavigate();
  const capabilities = useQuery({queryKey: ["payments", "capabilities"], queryFn: ({signal}) => apiGet("/payments/capabilities", checkoutCapabilitiesSchema, signal)});
  const checkout = useMutation({mutationFn: () => apiPost(`/payments/offers/${offerId}/checkout`, {termsVersion, acceptsTerms}, paymentStatusSchema), onSuccess: data => {
    if (data.checkoutUrl) {const destination = new URL(data.checkoutUrl); if (destination.protocol === "https:" && destination.hostname === "checkout.paystack.com" && !destination.username && !destination.password && !destination.port) {window.location.assign(destination.href); return;}}
    void navigate(`/applicant/payment-return?reference=${encodeURIComponent(data.reference)}`);
  }});
  if (capabilities.isPending) return <Notice>Checking checkout availability…</Notice>;
  if (capabilities.isError) return <Notice error>Could not check payment availability. Refresh before proceeding.</Notice>;
  if (!capabilities.data.available) return <Notice>Online checkout is not available yet. Your offer remains recorded; membership has not been activated.</Notice>;
  return <div><Notice>Paystack test checkout. Use test payment details only. No membership is granted by returning from checkout.</Notice><label><input type="checkbox" checked={acceptsTerms} onChange={event => setAcceptsTerms(event.target.checked)} />I accept this offer’s fee, terms and applicable refund policy.</label><div className="actions"><Button disabled={!acceptsTerms || checkout.isPending} onClick={() => checkout.mutate()}>Continue to Paystack test checkout</Button></div>{checkout.isError && <Notice error>{checkout.error.message}</Notice>}</div>;
}
