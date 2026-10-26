import { Link, NavLink, Outlet } from "react-router";
import { ArrowIcon } from "./ui";

const links = [{ to: "/models", label: "Our models" }, { to: "/academy", label: "The academy" }, { to: "/join", label: "Join Psycocity" }];
export default function SiteLayout() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header wrap">
      <Link className="wordmark" to="/" aria-label="Psycocity home">PSYCOCITY<span>AGENCY & ACADEMY</span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">{links.map(link => <NavLink key={link.to} to={link.to}>{link.label}</NavLink>)}<Link className="nav-contact" to="/contact">Get in touch <ArrowIcon /></Link></nav>
      <details className="mobile-menu"><summary>Menu</summary><nav aria-label="Mobile navigation">{links.map(link => <Link key={link.to} to={link.to}>{link.label}</Link>)}<Link to="/contact">Get in touch</Link></nav></details>
    </header>
    <Outlet />
    <footer className="site-footer wrap"><div><Link className="wordmark" to="/">PSYCOCITY</Link><p>Individuality, with intention.</p></div><nav aria-label="Footer navigation"><Link to="/faq">Questions</Link><Link to="/contact">Contact</Link><Link to="/applicant/login">Applicant portal</Link><Link to="/member/login">Member portal</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/refund-policy">Refunds</Link></nav><p className="footer-note">© {new Date().getFullYear()} Psycocity. Nigeria.</p></footer>
  </>;
}
