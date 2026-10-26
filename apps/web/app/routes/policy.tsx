import { useLocation } from "react-router";
const titles: Record<string, string> = { "/privacy": "Privacy notice", "/terms": "Terms of use", "/refund-policy": "Refund policy" };
export function meta() { return [{ title: "Policies — Psycocity" }, { name: "robots", content: "noindex" }]; }
export default function Policy() {
  const { pathname } = useLocation();
  return <main id="main" className="page wrap"><p className="eyebrow">POLICY PREPARATION</p><h1>{titles[pathname]}</h1><p className="notice">This policy is not yet published or approved. This page is informational and does not constitute the final policy.</p><div className="prose-section"><p>Final terms, privacy and retention information, safeguarding contacts, and cancellation/refund rules must be published before Psycocity collects live applications or payments.</p><p>For now, no application or payment is accepted through this website. Fee collection will follow acceptance, with applicable terms shown before checkout.</p></div></main>;
}
