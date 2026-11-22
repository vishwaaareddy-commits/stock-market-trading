import type { NextConfig } from "next";

// The browser calls the API through this same-origin proxy (/api/v1/*) so the HttpOnly session
// cookie is first-party. Server-side only; never exposed to the browser.
const BACKEND_ORIGIN = (
  process.env.BACKEND_ORIGIN ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ??
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Instant-navigation validation is limited to segments that opt in via `export const instant`.
    // Every page here sits behind the client-side session gate (AppShell), which deliberately does not
    // mount a page until the session is known, so the server prerender only contains the gate and
    // Next reports each page as "dropped from rendering". Most pages are Client Components, which
    // cannot export `instant = false`, so the per-page opt-out is not available. Dev-only; no build effect.
    instantInsights: { validationLevel: "manual-warning" },
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${BACKEND_ORIGIN}/api/v1/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
