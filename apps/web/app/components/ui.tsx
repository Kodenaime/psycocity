import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

export function ArrowIcon() { return <svg className="arrow-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 19 19 5M5 5h14v14" /></svg>; }

export function ButtonLink({ to, children, secondary = false }: { to: string; children: ReactNode; secondary?: boolean }) {
  return <Link className={`button${secondary ? " button-secondary" : ""}`} to={to}>{children}<ArrowIcon /></Link>;
}
export function Button({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props}>{children}</button>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={`notice${error ? " notice-error" : ""}`} role={error ? "alert" : "status"}>{children}</p>;
}
