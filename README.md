# מסחר־לומד · סימולטור שוק ההון

סימולטור השקעות ללימוד: נתוני שוק אמיתיים (ארה"ב, ת"א, דולר-שקל) וכסף וירטואלי.

- `web/`: האפליקציה (Next.js 16, Neon/PGlite, Yahoo Finance)
- `docs/`: תדריך הפרויקט, יומן החלטות, סטטוס וסקיצות

הרצה מקומית: `cd web && npm install && npm run dev`. צריך `web/.env.local` לפי `web/.env.example`.
בדיקות: `npm run verify:data`, `npm run verify:engine`.
