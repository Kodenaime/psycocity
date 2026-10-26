import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from "react-router";
import "./styles.css";
import { QueryProvider } from "./lib/query";

export function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

export default function App() { return <QueryProvider><Outlet /></QueryProvider>; }

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return <main className="page wrap"><h1>{missing ? "Page not found" : "Something went wrong"}</h1><p>Please return to the <a href="/">home page</a>.</p></main>;
}
