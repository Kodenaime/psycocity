import { useLoaderData } from "react-router";
import { loadPublicCopy } from "../lib/public-copy.server";
export async function loader(){return loadPublicCopy();}
export function headers(){return {"Cache-Control":"no-store"};}
import { ButtonLink } from "../components/ui";
export function meta() { return [{ title: "The academy — Psycocity" }, { name: "description", content: "Hybrid modelling training for emerging talent aged 16 and above. Learn about the Psycocity academy admissions journey." }]; }
export default function Academy() {
 const copy=useLoaderData<typeof loader>();
  return <main id="main" className="page wrap"><p className="eyebrow">THE PSYCOCITY ACADEMY</p><h1>Potential,<br /><em>with direction.</em></h1><p className="lede">{copy.academyDescription}</p><div className="editorial-panel"><p className="eyebrow">IN PERSON. ONLINE. IN YOUR ELEMENT.</p><h2>A hybrid approach<br />to learning.</h2><p>{copy.academyDelivery}</p></div><div className="prose-section"><h2>Begin with the essentials.</h2><p>Open to applicants aged 16 and above. For applicants aged 16–17, guardian verification and consent are required before submission. Professional photographs are not required to apply.</p><p>The single tuition and assessment fee is <strong>₦50,000</strong>, payable only after acceptance. Academy completion does not automatically confer agency representation, which is available only from age 18 following review.</p><ButtonLink to="/apply?track=academy">Choose your academy path</ButtonLink></div></main>;
}
