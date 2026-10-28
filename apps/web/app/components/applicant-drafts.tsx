import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { applicationEligibilitySchema, applicationPageSchema, applicationSchema } from "@psycocity/validation";
import { apiGet, apiPost } from "../lib/api";
import { ArrowIcon, Button, Notice } from "./ui";
export function ApplicantDrafts() {
  const navigate = useNavigate(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["applications", "list"], queryFn: ({ signal }) => apiGet("/applications", applicationPageSchema, signal) });
  const eligibility=useQuery({queryKey:["applications","eligibility"],queryFn:({signal})=>apiGet("/applications/eligibility",applicationEligibilitySchema,signal)});
  const create = useMutation({ mutationFn: (track: "academy" | "established") => apiPost("/applications", { track }, applicationSchema), onSuccess: async data => {
    await client.invalidateQueries({ queryKey: ["applications", "list"] }); await navigate(`/applicant/application/${data.id}`);
  } });
  return <section className="draft-section"><h2>You’re ready for the first step.</h2><p>Start or resume a private draft. No payment is collected at this stage.</p>{eligibility.data?.availableAt&&<Notice>You can apply again from {new Date(eligibility.data.availableAt).toLocaleString("en-NG",{timeZone:"Africa/Lagos"})} WAT. No payment is due for a rejection.</Notice>}<div className="actions"><Button disabled={create.isPending||!eligibility.data?.canApply} onClick={() => create.mutate("academy")}>Start academy draft</Button><Button className="button-secondary" disabled={create.isPending||!eligibility.data?.canApply} onClick={() => create.mutate("established")}>Start agency draft</Button></div>{create.isError && <Notice error>{create.error.message}</Notice>}{query.isPending ? <Notice>Loading your applications…</Notice> : query.isError ? <Notice error>Could not load your applications.</Notice> : query.data.items.length ? <ul className="draft-list">{query.data.items.map(item => <li key={item.id}><div><strong>{item.track === "academy" ? "Academy" : "Agency representation"}</strong><p>{item.status.replaceAll("_", " ")} · saved {new Date(item.updatedAt).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" })}</p></div><Link to={`/applicant/application/${item.id}`}>Open application <ArrowIcon /></Link></li>)}</ul> : <p className="fine-print">You have no applications yet.</p>}</section>;
}
