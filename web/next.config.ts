import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ב-C:\cluade יש package-lock נוסף; קובעים שהשורש הוא תיקיית web
  outputFileTracingRoot: import.meta.dirname,
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite טוען קובץ wasm בזמן ריצה, ולכן לא מאגדים אותו
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
