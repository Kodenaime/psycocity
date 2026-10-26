import { useQuery } from "@tanstack/react-query";
import { healthSchema } from "@psycocity/validation";
import { Button, Notice } from "../components/ui";
import { apiGet } from "../lib/api";
export function meta() { return [{ title: "Service status — Psycocity" }, { name: "robots", content: "noindex" }]; }
export default function Status() {
  const query = useQuery({ queryKey: ["system", "health"], queryFn: ({ signal }) => apiGet("/health", healthSchema, signal) });
  const status = query.isFetching || query.isPending ? "Checking API connection…" : query.isError ? "API unavailable. Please try again later." : "API connected";
  return <main id="main" className="page wrap"><p className="eyebrow">SERVICE STATUS</p><h1>Connection check</h1><Notice>{status}</Notice><Button disabled={query.isFetching} onClick={() => void query.refetch()}>Check again</Button></main>;
}
