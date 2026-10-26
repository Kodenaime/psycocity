import { ButtonLink } from "../components/ui";
export function meta() { return [{ title: "Questions — Psycocity" }]; }
const answers = [
  ["Who can apply?", "Academy applicants must be 16 or older; established models must be 18 or older. Academy applicants aged 16–17 need verified guardian consent."],
  ["When do I pay?", "Apply and complete assessment first. Only accepted applicants are asked to pay: ₦50,000 for academy tuition and assessment, or ₦30,000 for established-model assessment and onboarding. Payments use Paystack in Nigerian naira."],
  ["Do I need professional photographs?", "Academy applicants do not need a professional shoot. Prepare recent, clear headshot, profile, full-body front and full-body side photos in simple clothing and natural light. Never submit nude images."],
  ["Is training online or in person?", "The academy is hybrid. The final curriculum, timetable, duration and venue will be disclosed before enrolment."],
  ["Does acceptance guarantee modelling work?", "No. Admission and payment do not guarantee client bookings or earnings. Public agency representation and academy completion are separately reviewed."],
  ["How do member accounts work?", "Applicant access is separate from the member platform. Following acceptance and verified payment, you receive a single-use invitation to activate the appropriate membership."],
];
export default function FAQ() { return <main id="main" className="page wrap"><p className="eyebrow">A LITTLE CLARITY</p><h1>Before you<br /><em>take the next step.</em></h1><div className="faq-list">{answers.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><ButtonLink to="/join">Find your path</ButtonLink></main>; }
