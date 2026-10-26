import { redirect } from "react-router";
export function loader({ request }: { request: Request }) {
  const track = new URL(request.url).searchParams.get("track");
  return redirect(`/applicant/register${track === "academy" || track === "established" ? `?track=${track}` : ""}`);
}
