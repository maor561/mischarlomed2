/**
 * שכבת מסד נתונים דקה: SQL ישיר, בלי ORM.
 * - יש DATABASE_URL  → Neon (ענן / Vercel)
 * - אין DATABASE_URL → PGlite (Postgres מקומי בקובץ, לפיתוח בלי הרשמה)
 * אותו SQL בשני המקרים.
 */

type Row = Record<string, unknown>;
type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;
export type Stmt = { text: string; params: unknown[] };
type TxFn = (stmts: Stmt[]) => Promise<void>;
let txFn: TxFn | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS instruments (
  symbol        TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  exchange      TEXT NOT NULL,
  currency      TEXT NOT NULL,          -- USD / ILS (אגורות כבר מומרות לשקלים)
  kind          TEXT NOT NULL,          -- EQUITY / ETF / CURRENCY / INDEX
  timezone      TEXT,
  first_trade   DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- נרות יומיים כפי שהספק מחזיר: מחירים מותאמים לפיצולים בלבד (לא לדיבידנד)
CREATE TABLE IF NOT EXISTS price_bars (
  symbol  TEXT NOT NULL,
  d       DATE NOT NULL,
  open    DOUBLE PRECISION,
  high    DOUBLE PRECISION,
  low     DOUBLE PRECISION,
  close   DOUBLE PRECISION NOT NULL,
  volume  DOUBLE PRECISION,
  PRIMARY KEY (symbol, d)
);

-- פיצולים ודיבידנדים. split: value = יחס (4 עבור 4:1). div: סכום למניה (מותאם לפיצולים)
CREATE TABLE IF NOT EXISTS corporate_events (
  symbol  TEXT NOT NULL,
  d       DATE NOT NULL,
  kind    TEXT NOT NULL,
  value   DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (symbol, d, kind)
);

CREATE TABLE IF NOT EXISTS history_sync (
  symbol      TEXT PRIMARY KEY,
  last_bar    DATE,
  synced_at   TIMESTAMPTZ NOT NULL
);

-- ===== חבילה 2: מנוע מסחר =====
CREATE TABLE IF NOT EXISTS portfolios (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  mode              TEXT NOT NULL,          -- live / time
  start_date        DATE NOT NULL,
  sim_date          DATE NOT NULL,
  processed_through DATE NOT NULL,
  initial_capital   DOUBLE PRECISION NOT NULL,
  fees              JSONB NOT NULL,
  deposit           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY,       -- מזהה מ-orders_seq, כדי שאפשר לקבוע אותו לפני השמירה
  portfolio_id   INTEGER NOT NULL,
  created_d      DATE NOT NULL,
  active_from    DATE NOT NULL,
  live_today     BOOLEAN NOT NULL DEFAULT false,
  side           TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  currency       TEXT NOT NULL,
  qty            INTEGER,
  budget         DOUBLE PRECISION,
  type           TEXT NOT NULL,
  price          DOUBLE PRECISION,
  validity       TEXT NOT NULL,
  expires_d      DATE,
  status         TEXT NOT NULL,
  reason         TEXT,
  filled_d       DATE,
  fill_price     DOUBLE PRECISION,
  fill_qty       INTEGER,
  reserved       DOUBLE PRECISION NOT NULL DEFAULT 0,
  why            TEXT,
  exit_plan      TEXT,
  source         TEXT NOT NULL DEFAULT 'user',
  splits_applied JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS orders_seq;
CREATE INDEX IF NOT EXISTS orders_pf ON orders (portfolio_id, status);

-- יומן התנועות: מקור האמת של מזומן, החזקות ומס
CREATE TABLE IF NOT EXISTS ledger (
  id           SERIAL PRIMARY KEY,
  portfolio_id INTEGER NOT NULL,
  d            DATE NOT NULL,
  kind         TEXT NOT NULL,
  symbol       TEXT,
  qty          DOUBLE PRECISION NOT NULL DEFAULT 0,
  price        DOUBLE PRECISION,
  cash_ils     DOUBLE PRECISION NOT NULL DEFAULT 0,
  cash_usd     DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee          DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax          DOUBLE PRECISION NOT NULL DEFAULT 0,
  fx_rate      DOUBLE PRECISION,
  order_id     INTEGER,
  meta         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_pf ON ledger (portfolio_id, id);

-- ===== חבילה 3: מכונת זמן =====
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS blind BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS period_name TEXT;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS benchmark TEXT NOT NULL DEFAULT 'SPY';
-- מדד תשואה משוקלל זמן (בלי השפעת ההפקדות), לזיהוי ירידה מהשיא
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS nav DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS nav_peak DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS last_value DOUBLE PRECISION;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS dd_alerted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS last_market_stop DATE;

-- ===== חבילה 5: יומן ומנטור =====
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mentor JSONB;
-- בדיקה חוזרת של עסקה (D24): אחת לכל פקודה
CREATE TABLE IF NOT EXISTS journal_reviews (
  order_id     INTEGER PRIMARY KEY,
  portfolio_id INTEGER NOT NULL,
  d            DATE NOT NULL,
  rating       TEXT NOT NULL,
  lesson       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journal_notes (
  id           SERIAL PRIMARY KEY,
  portfolio_id INTEGER NOT NULL,
  d            DATE NOT NULL,
  text         TEXT NOT NULL,
  context      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== חבילה 6: התקדמות בשיעורים (משתמש יחיד) =====
CREATE TABLE IF NOT EXISTS lesson_progress (
  n            INTEGER PRIMARY KEY,
  quiz_done    BOOLEAN NOT NULL DEFAULT false,
  mission_done BOOLEAN NOT NULL DEFAULT false,
  note         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== חבילה 4: מידע על נייר (סקטור ונתוני חברה), מטמון ל-12 שעות =====
CREATE TABLE IF NOT EXISTS instrument_info (
  symbol     TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  sector     TEXT,
  data       JSONB,
  fetched_at TIMESTAMPTZ NOT NULL
);
`;

let queryFn: Promise<QueryFn> | null = null;

async function init(): Promise<QueryFn> {
  const url = process.env.DATABASE_URL;
  let q: QueryFn;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    q = async (text, params = []) => (await sql.query(text, params)) as Row[];
    txFn = async (stmts) => {
      await sql.transaction(stmts.map((s) => sql.query(s.text, s.params)));
    };
    // Neon HTTP מריץ פקודה אחת בכל קריאה
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await q(stmt);
    }
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const g = globalThis as unknown as { __pglite?: InstanceType<typeof PGlite> };
    if (!g.__pglite) {
      // PGlite (wasm) נכשל בנתיבים עם עברית, ולכן ברירת המחדל היא תיקייה בבית המשתמש
      const { homedir } = await import("node:os");
      const dir = process.env.PGLITE_DIR ?? `${homedir()}/.stock-sim/pglite`;
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true });
      g.__pglite = new PGlite(dir);
    }
    const db = g.__pglite;
    try {
      await db.exec(SCHEMA);
    } catch (e) {
      g.__pglite = undefined; // לא להיתקע עם מופע שבור
      throw e;
    }
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows;
    txFn = async (stmts) => {
      await db.transaction(async (t) => {
        for (const s of stmts) await t.query(s.text, s.params);
      });
    };
  }
  return q;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  queryFn ??= init().catch((e) => {
    queryFn = null;
    throw e;
  });
  const q = await queryFn;
  return (await q(text, params)) as T[];
}

/** כמה פקודות כטרנזקציה אחת: או שכולן נשמרות, או אף אחת */
export async function tx(stmts: Stmt[]): Promise<void> {
  if (!stmts.length) return;
  await query("SELECT 1"); // מוודא אתחול
  await txFn!(stmts);
}
