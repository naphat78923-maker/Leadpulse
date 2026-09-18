import type { MetadataRoute } from "next";

// Without this, iOS/Android treat the home-screen bookmark as a plain browser
// shortcut: it opens with browser chrome and uses a page screenshot as its icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeadPulse — VG Saveur",
    short_name: "LeadPulse",
    description:
      "B2B butter sales CRM. Four connected databases: Contacts, Companies, Deal Pipeline, Meetings.",
    start_url: "/",
    display: "standalone",
    // Both match --color-clay-canvas so the splash and status bar blend with the app.
    background_color: "#fdf6e9",
    theme_color: "#fdf6e9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
