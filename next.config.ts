import type { NextConfig } from "next";

// Pages folded into This week / Pipeline / Accounts. Redirect old bookmarks and
// home-screen links instead of 404ing. Temporary (307) so browsers don't cache them.
const RETIRED_PAGES: [source: string, destination: string][] = [
  ["/activity", "/"],
  ["/retention", "/"],
  ["/signals", "/"],
  ["/prospects", "/deals"],
  ["/contacts", "/companies"],
  ["/meetings", "/companies"],
];

const nextConfig: NextConfig = {
  async redirects() {
    return RETIRED_PAGES.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
};

export default nextConfig;
