/**
 * מידע על נייר: סקטור ונתוני חברה (D18, D19).
 * - סקטור: מהחיפוש של Yahoo. עובד בלי הרשאה.
 * - נתוני חברה (מכפיל, שווי שוק, דיבידנד, בטא): מ-quoteSummary. דורש "crumb", קוד גישה זמני
 *   שמקבלים עם עוגייה מ-fc.yahoo.com. אם זה נכשל, מחזירים בלי נתוני חברה, ושאר האתר לא נפגע.
 * הכול נשמר במטמון במסד הנתונים ל-12 שעות.
 */
import { query } from "../db";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TTL_MS = 12 * 3600_000;

export type Fundamentals = {
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  dividendYield: number | null; // באחוזים
  beta: number | null;
  industry: string | null;
};
export type InstrumentInfo = {
  symbol: string;
  kind: string;
  sector: string | null; // null לקרן סל/מדד
  fundamentals: Fundamentals | null;
  fetchedAt: string;
};

const SECTOR_HE: Record<string, string> = {
  Technology: "טכנולוגיה",
  Healthcare: "בריאות",
  "Financial Services": "פיננסים",
  "Consumer Cyclical": "צריכה מחזורית",
  "Consumer Defensive": "צריכה בסיסית",
  "Communication Services": "תקשורת",
  Industrials: "תעשייה",
  Energy: "אנרגיה",
  Utilities: "תשתיות",
  "Real Estate": "נדל\"ן",
  "Basic Materials": "חומרי גלם",
};
export const sectorHe = (s: string | null) => (s ? (SECTOR_HE[s] ?? s) : null);

/* ---------- crumb ---------- */

let session: { cookie: string; crumb: string; at: number } | null = null;

async function getSession(): Promise<{ cookie: string; crumb: string } | null> {
  if (session && Date.now() - session.at < 3600_000) return session;
  try {
    const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", cache: "no-store" });
    const cookie = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return null;
    const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie }, cache: "no-store" });
    const crumb = (await r2.text()).trim();
    if (!r2.ok || !crumb || crumb.includes("<") || crumb.length > 40) return null;
    session = { cookie, crumb, at: Date.now() };
    return session;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchFundamentals(symbol: string): Promise<{ f: Fundamentals; sector: string | null } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getSession();
    if (!s) return null;
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,assetProfile,defaultKeyStatistics&crumb=${encodeURIComponent(s.crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: s.cookie }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      session = null; // קוד הגישה פג, מנסים פעם נוספת
      continue;
    }
    if (!res.ok) return null;
    const j: any = await res.json();
    const r = j?.quoteSummary?.result?.[0];
    if (!r) return null;
    const raw = (x: any) => (typeof x?.raw === "number" ? x.raw : null);
    const dy = raw(r.summaryDetail?.dividendYield) ?? raw(r.summaryDetail?.trailingAnnualDividendYield);
    return {
      sector: r.assetProfile?.sector ?? null,
      f: {
        marketCap: raw(r.summaryDetail?.marketCap),
        trailingPE: raw(r.summaryDetail?.trailingPE),
        forwardPE: raw(r.summaryDetail?.forwardPE) ?? raw(r.defaultKeyStatistics?.forwardPE),
        dividendYield: dy == null ? null : Math.round(dy * 10000) / 100,
        beta: raw(r.summaryDetail?.beta) ?? raw(r.defaultKeyStatistics?.beta),
        industry: r.assetProfile?.industry ?? null,
      },
    };
  }
  return null;
}

async function fetchSectorFromSearch(symbol: string): Promise<{ sector: string | null; kind: string | null }> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=5&newsCount=0`, { headers: { "User-Agent": UA }, cache: "no-store" });
    const j: any = await res.json();
    const hit = (j?.quotes ?? []).find((q: any) => q.symbol === symbol);
    return { sector: hit?.sector ?? null, kind: hit?.quoteType ?? null };
  } catch {
    return { sector: null, kind: null };
  }
}

/* ---------- מטמון ---------- */

type Row = { symbol: string; kind: string; sector: string | null; data: unknown; fetched_at: string };

/**
 * מחזיר סקטור (תמיד) ונתוני חברה (רק אם withFundamentals).
 * נתוני חברה הם של היום, ולכן הקורא אחראי לא להציג אותם במכונת זמן (D19).
 */
export async function getInfo(symbol: string, kind: string, withFundamentals: boolean): Promise<InstrumentInfo> {
  const [row] = await query<Row>(`SELECT symbol,kind,sector,data,fetched_at::text AS fetched_at FROM instrument_info WHERE symbol=$1`, [symbol]);
  const fresh = row && Date.now() - Date.parse(row.fetched_at) < TTL_MS;
  const cachedF = row?.data ? ((typeof row.data === "string" ? JSON.parse(row.data) : row.data) as Fundamentals) : null;
  // סקטור כמעט לא משתנה: אם יש במטמון, מספיק. נתוני חברה: רק אם טריים
  if (row && !withFundamentals) return { symbol, kind: row.kind, sector: row.sector, fundamentals: null, fetchedAt: row.fetched_at };
  if (row && withFundamentals && fresh && (cachedF || kind !== "EQUITY")) {
    return { symbol, kind: row.kind, sector: row.sector, fundamentals: cachedF, fetchedAt: row.fetched_at };
  }

  let sector: string | null = row?.sector ?? null;
  let f: Fundamentals | null = cachedF;
  if (kind === "EQUITY") {
    const full = withFundamentals ? await fetchFundamentals(symbol) : null;
    if (full) {
      f = full.f;
      sector = full.sector ?? sector;
    }
    if (!sector) sector = (await fetchSectorFromSearch(symbol)).sector;
  }
  // לא שומרים "ריק" אם הבקשה לנתוני חברה נכשלה, כדי לנסות שוב בפעם הבאה
  const now = new Date().toISOString();
  if (!withFundamentals || f || kind !== "EQUITY") {
    await query(
      `INSERT INTO instrument_info (symbol,kind,sector,data,fetched_at) VALUES ($1,$2,$3,$4::jsonb,now())
       ON CONFLICT (symbol) DO UPDATE SET kind=$2, sector=$3, data=COALESCE($4::jsonb, instrument_info.data), fetched_at=now()`,
      [symbol, kind, sector, f ? JSON.stringify(f) : null],
    );
  }
  return { symbol, kind, sector, fundamentals: withFundamentals ? f : null, fetchedAt: now };
}
