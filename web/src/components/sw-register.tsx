"use client";

import { useEffect } from "react";

/** רושם את ה-service worker (רק בפרודקשן, כדי לא להפריע לפיתוח) */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
