/** טיפוסי מנוע המסחר. כל הסכומים בשקלים או בדולרים, מעוגלים לאגורה או לסנט. */

export type Ccy = "ILS" | "USD";

export type FeeProfile = {
  kind: "bank" | "online" | "custom";
  usPct: number; // עמלת קנייה/מכירה בארה"ב, באחוזים
  usMin: number; // מינימום בדולרים
  ilPct: number; // עמלת קנייה/מכירה בת"א, באחוזים
  ilMin: number; // מינימום בשקלים
  custodyPctYear: number; // דמי משמרת לשנה, באחוזים משווי ההחזקות
  fxPct: number; // עמלת המרת מט"ח, באחוזים
};

/** מספרים טיפוסיים להמחשה (D10). כל ערך ניתן לעריכה בתיק */
export const FEE_PRESETS: Record<"bank" | "online", FeeProfile> = {
  bank: { kind: "bank", usPct: 0.2, usMin: 15, ilPct: 0.2, ilMin: 25, custodyPctYear: 0.15, fxPct: 0.5 },
  online: { kind: "online", usPct: 0.08, usMin: 2.5, ilPct: 0.08, ilMin: 7, custodyPctYear: 0, fxPct: 0.2 },
};

export type MonthlyDeposit = { amount: number; day: number; autoBuy: string | null };

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
  deposit: MonthlyDeposit | null;
  createdAt: string;
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
};

export type LedgerKind = "deposit" | "fx" | "buy" | "sell" | "dividend" | "split" | "custody";

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
