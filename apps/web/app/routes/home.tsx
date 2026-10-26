import { useLoaderData } from "react-router";
import { loadPublicCopy } from "../lib/public-copy.server";
export async function loader(){return loadPublicCopy();}
export function headers(){return {"Cache-Control":"no-store"};}
import { ButtonLink } from "../components/ui";
export function meta() {
  return [{ title: "Psycocity — Agency & Academy" }, { name: "description", content: "A new stage for individuality. Discover Psycocity, a Nigerian modelling agency and hybrid academy developing the next generation of talent." }];
}
export default function Home() {
  const copy=useLoaderData<typeof loader>();
  return <main id="main">
    <section className="hero wrap" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow">NIGERIA · AGENCY & ACADEMY</p><h1 id="hero-title">{copy.heroFirst}<br /><em>{copy.heroSecond}</em></h1><p className="lede">{copy.heroDescription}</p><div className="actions"><ButtonLink to="/join">Find your path</ButtonLink><ButtonLink to="/models" secondary>Discover our models</ButtonLink></div><p className="hero-caption">BE SEEN. BE YOURSELF.</p></div><figure className="hero-art"><img src="/atelier.svg" alt="Abstract editorial illustration of sculptural fabric in warm gold and charcoal" width="700" height="900" fetchPriority="high" /><figcaption>THE ART OF PRESENCE — PSYCOCITY</figcaption></figure></section>
    <section className="intro wrap" aria-labelledby="intro-title"><p className="eyebrow">01 / THE AGENCY</p><div><h2 id="intro-title">{copy.agencyFirst}<br /><em>{copy.agencySecond}</em></h2><p>{copy.agencyDescription}</p><p>{copy.agencyClosing}</p></div></section>
    <section className="paths wrap" aria-labelledby="paths-title"><div className="section-heading"><p className="eyebrow">02 / YOUR NEXT CHAPTER</p><h2 id="paths-title">Two paths.<br /><em>Your possibility.</em></h2></div><div className="path-grid"><article className="path-card"><p className="eyebrow">LEARN & DEVELOP · 16+</p><h3>The academy</h3><p>Build your confidence, craft and professional foundation through hybrid training.</p><p className="price">₦50,000 <span>Tuition & assessment</span></p><ButtonLink to="/academy" secondary>Explore the academy</ButtonLink></article><article className="path-card dark"><p className="eyebrow">REPRESENTATION · 18+</p><h3>The agency</h3><p>Already finding your stride? Take the next step with a considered approach to representation.</p><p className="price">₦30,000 <span>Assessment & onboarding</span></p><ButtonLink to="/join?track=established">Explore representation</ButtonLink></article></div><p className="fine-print">Apply first. Fees are collected only after acceptance. Admission does not guarantee paid work.</p></section>
    <section className="contact-strip wrap"><p className="eyebrow">LET’S CREATE SOMETHING</p><h2>A different kind<br />of <em>presence.</em></h2><ButtonLink to="/contact" secondary>Start a conversation</ButtonLink></section>
  </main>;
}
