import { useLocation } from "react-router";
import { ButtonLink } from "../components/ui";
const pages: Record<string, { title: string; eyebrow: string; text: string }> = {
  "/models": { title: "A considered collection of talent.", eyebrow: "OUR MODELS", text: "Our roster is being curated. Approved Psycocity model portfolios will be presented here." },
  "/apply": { title: "Your next chapter starts here.", eyebrow: "APPLICATIONS", text: "Online applications are not open yet. Explore the eligibility and admissions process while we prepare to welcome you." },
  "/contact": { title: "Let’s start a conversation.", eyebrow: "CONTACT", text: "Our enquiry service is being prepared. Official agency contact details will be published here before applications open." },
  "/booking": { title: "Bring your vision to life.", eyebrow: "BOOKING ENQUIRIES", text: "Our booking enquiry service will open with the model catalogue. No bookings or reservations are currently accepted here." },
  "/applicant/login": { title: "Your application, in one place.", eyebrow: "APPLICANT PORTAL", text: "Applicant access is being prepared. Creating an applicant account will be separate from invitation-only member activation." },
  "/member/login": { title: "Welcome to your next chapter.", eyebrow: "MEMBER PORTAL", text: "Member access will be available by invitation after acceptance and confirmed payment. Public member registration is not open." },
  "/admin/login": { title: "Staff access", eyebrow: "PSYCOCITY", text: "Staff sign-in is not available yet. Administrator accounts will be invitation-only." },
};
export function meta() { return [{ title: "Psycocity — Information" }]; }
export default function Information() {
  const { pathname } = useLocation();
  const page = pages[pathname];
  return <main id="main" className="page wrap"><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="lede">{page.text}</p><ButtonLink to="/join" secondary>Explore joining Psycocity</ButtonLink></main>;
}
