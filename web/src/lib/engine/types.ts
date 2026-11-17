/** טיפוסי מנוע המסחר. כל הסכומים בשקלים או בדולרים, מעוגלים לאגורה או לסנט. */

export type Ccy = "ILS" | "USD";

export type FeeProfile = {
  kind: "bank" | "online" | "app" | "custom";
  usPct: number; // עמלת קנייה/מכירה בארה"ב, באחוזים
  usMin: number; // מינימום בדולרים
  ilPct: number; // עמלת קנייה/מכירה בת"א, באחוזים
  ilMin: number; // מינימום בשקלים
  custodyPctYear: number; // דמי משמרת לשנה, באחוזים משווי ההחזקות
  fxPct: number; // עמלת המרת מט"ח, באחוזים
  /** תמחור "אפליקציה" (D31) לעסקאות בדולרים: חינם עד מכסה חודשית, ואחר כך לפי מניה. כשקיים, הוא גובר על usPct/usMin */
  app?: AppPricing;
};

export type AppPricing = {
  freeActions: number; // פעולות חינם בחודש
  freeShares: number; // מניות חינם בחודש (המוקדם מביניהם)
  perShare: number; // $ למניה או לחלק ממנה, אחרי המכסה
  min: number; // מינימום $ לעסקה בתשלום
  maxPct: number; // תקרה: אחוז משווי העסקה
};

/** שימוש במכסה בחודש מסוים (לפי חודש הסימולציה) */
export type MonthUsage = { actions: number; shares: number };

/** מספרים טיפוסיים להמחשה (D10). כל ערך ניתן לעריכה בתיק */
export const FEE_PRESETS: Record<"bank" | "online" | "app", FeeProfile> = {
  bank: { kind: "bank", usPct: 0.2, usMin: 15, ilPct: 0.2, ilMin: 25, custodyPctYear: 0.15, fxPct: 0.5 },
  online: { kind: "online", usPct: 0.08, usMin: 2.5, ilPct: 0.08, ilMin: 7, custodyPctYear: 0, fxPct: 0.2 },
  // לפי תעריפון שפורסם לאפליקציות השקעה: 10 פעולות או 1,000 מניות בחודש חינם, ואז $0.01 למניה, מינימום $1.5, תקרה 1.8%.
  // עמלת ההמרה לא פורסמה: 0.5% היא הנחה שאפשר לערוך. בת"א משתמשים בתעריף אונליין
  app: { kind: "app", usPct: 0, usMin: 0, ilPct: 0.08, ilMin: 7, custodyPctYear: 0, fxPct: 0.5, app: { freeActions: 10, freeShares: 1000, perShare: 0.01, min: 1.5, maxPct: 1.8 } },
};

/** קלט ישן של אשף התיק. מומר לתוכנית השקעה קבועה (D31) */
export type MonthlyDeposit = { amount: number; day: number; autoBuy: string | null };

export type PlanFreq = "daily" | "weekly" | "monthly";
/**
 * תוכנית השקעה קבועה (D31): כל יום מסחר / שבוע / חודש, סכום בשקלים שמתחלק בין ניירות לפי אחוזים.
 * source=deposit: כסף חדש נכנס לתיק (כמו הפקדה). source=cash: מהמזומן שכבר בתיק.
 * day: בחודשית יום בחודש (1–31), בשבועית יום בשבוע (0=ראשון … 6=שבת). ביומית לא בשימוש (ימים ב'–ו').
 */
export type Plan = {
  id: number;
  name: string;
  amount: number;
  freq: PlanFreq;
  day: number;
  items: { symbol: string; pct: number }[];
  source: "deposit" | "cash";
  status: "active" | "paused";
  /** התוכנית רצה רק בימים שאחרי התאריך הזה */
  startD: string;
  /** הומרה מ"הפקדה חודשית" ישנה: מכבדים גם את מפתח ההפקדה הישן */
  migrated?: boolean;
};

export type Portfolio = {
  id: number;
  name: string;
  mode: "live" | "time";
  startDate: string;
  /** במכונת זמן: היום שבו "נמצאים" (אחרי הסגירה). בחי: היום */
  simDate: string;
  /** היום האחרון שעובד במלואו (אירועים, תוקף פקודות) */
  processedThrough: string;
  initialCapital: number;
  fees: FeeProfile;
  /** ישן. אחרי ההמרה תמיד null; התוכניות ב-plans */
  deposit: MonthlyDeposit | null;
  plans: Plan[];
  createdAt: string;
  /** מכונת זמן: תאריך סיום המסע (null = עד היום) */
  endDate: string | null;
  /** מצב עיוור: התאריכים מוסתרים עד סוף המסע */
  blind: boolean;
  /** שם התקופה, לחשיפה בסוף מסע עיוור */
  periodName: string | null;
  benchmark: Benchmark;
  nav: number;
  navPeak: number;
  lastValue: number | null;
  ddAlerted: boolean;
  /** העצירה האחרונה בגלל תנועת שוק, כדי לא לעצור כל יום בתוך משבר */
  lastMarketStop: string | null;
};

export type Benchmark = "SPY" | "TA125";
/** מדד ההשוואה (נכס לקנייה וירטואלית) ומדד השוק (לזיהוי ימים חריגים) */
export const BENCH: Record<Benchmark, { asset: string; index: string; label: string }> = {
  SPY: { asset: "SPY", index: "^GSPC", label: "S&P 500" },
  TA125: { asset: "^TA125.TA", index: "^TA125.TA", label: "ת\"א-125" },
};

export type OrderType = "market" | "limit" | "stop";
export type OrderStatus = "pending" | "filled" | "cancelled" | "expired" | "rejected";

export type Order = {
  id: number;
  portfolioId: number;
  createdD: string;
  /** יום המסחר הראשון שבו הפקודה יכולה להתבצע */
  activeFrom: string;
  /** נשלחה בחי כשהבורסה פתוחה: את הנר של אותו יום לא בודקים (כולל מחירים מלפני השליחה) */
  liveToday: boolean;
  side: "buy" | "sell";
  symbol: string;
  currency: Ccy;
  qty: number | null; // null = קנייה לפי סכום (הוראת קבע)
  budget: number | null;
  type: OrderType;
  price: number | null; // מחיר הלימיט או הסטופ
  validity: "day" | "gtc";
  expiresD: string | null;
  status: OrderStatus;
  reason: string | null;
  filledD: string | null;
  fillPrice: number | null;
  fillQty: number | null;
  reserved: number; // כסף ששמור בקופה עבור קנייה ממתינה
  why: string | null;
  exitPlan: string | null;
  source: "user" | "auto";
  splitsApplied: string[];
  /** סוגי הנימוק שהמנטור זיהה, והערות המנטור בזמן השליחה (D21–D22) */
  tags?: string[];
  mentor?: { id: string; level: string; icon: string; title: string; body: string }[];
};

/** plan: סימון ביצוע (או דילוג) של תוכנית קבועה שממומנת מהמזומן. בלי שינוי בקופה */
export type LedgerKind = "deposit" | "fx" | "buy" | "sell" | "dividend" | "split" | "custody" | "plan";

export type LedgerEntry = {
  id?: number;
  portfolioId: number;
  d: string;
  kind: LedgerKind;
  symbol: string | null;
  qty: number; // שינוי בכמות המניות
  price: number | null;
  cashIls: number; // שינוי בקופת השקלים
  cashUsd: number; // שינוי בקופת הדולרים
  fee: number; // בשקלים (שווה ערך)
  tax: number; // בשקלים (שווה ערך). שלילי = החזר מס
  fxRate: number | null;
  orderId: number | null;
  meta: Record<string, unknown>;
};

export type Bar = { d: string; open: number | null; high: number | null; low: number | null; close: number };

/** מקור הנתונים של המנוע. בשירות: נתונים אמיתיים מהמטמון. בבדיקות: נתונים סינתטיים */
export interface Market {
  bar(symbol: string, d: string): Bar | undefined;
  /** סגירה אחרונה עד d כולל, כפי שנסחר */
  closeOn(symbol: string, d: string): number | undefined;
  fx(d: string): number;
  split(symbol: string, d: string): number | undefined;
  dividend(symbol: string, d: string): number | undefined; // למניה, כפי ששולם
  currency(symbol: string): Ccy;
  /** האם יום d הסתיים (במכונת זמן תמיד כן; בחי רק ימים שעברו) */
  isComplete(d: string): boolean;
  /** מחיר חי בבורסה פתוחה (רק במצב חי) */
  live?(symbol: string): { price: number; open: boolean } | undefined;
}
