// Service worker מינימלי (חבילה 7).
// לא שומרים נתונים במטמון: מחירים ותיקים חייבים להיות עדכניים, וכל הבקשות מוגנות בסיסמה.
// רק כשאין רשת, ניווט לדף מחזיר מסך "אין חיבור" במקום שגיאה של הדפדפן.
const OFFLINE = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>אין חיבור</title><body style="font-family:system-ui,sans-serif;background:#f4f6fa;color:#1b2333;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center;padding:24px"><div style="font-size:48px">📡</div><h1 style="font-size:20px">אין חיבור לאינטרנט</h1>
<p style="color:#6b7488">הסימולטור צריך רשת כדי להביא מחירים. נסה שוב כשהחיבור יחזור.</p>
<button onclick="location.reload()" style="padding:10px 18px;border:0;border-radius:8px;background:#2753d6;color:#fff;font:inherit">נסה שוב</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
