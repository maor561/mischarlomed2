import type { MetadataRoute } from "next";

/** התקנה כאפליקציה (חבילה 7): מסך בית בטלפון, בלי שורת כתובת */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "מסחר־לומד · סימולטור שוק ההון",
    short_name: "מסחר־לומד",
    description: "סימולטור השקעות ללימוד: נתוני שוק אמיתיים, כסף וירטואלי",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fa",
    theme_color: "#2753d6",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
