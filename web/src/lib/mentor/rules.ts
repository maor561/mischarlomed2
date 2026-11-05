/**
 * המנטור (D21–D23): כללים שקופים, בלי AI.
 * מודול טהור (בלי מסד נתונים ובלי רשת), כדי שאפשר יהיה להחליף אותו בעתיד ב-Claude
 * מאחורי אותו ממשק: מקבל OrderFacts ומחזיר הערות.
 */

export type ReasonTag = "fomo" | "panic" | "tip" | "dip" | "long" | "plan" | "fundamental";
export type NoteLevel = "bad" | "warn" | "info" | "good";
export type MentorNote = { id: string; level: NoteLevel; icon: string; title: string; body: string };

export const TAG_INFO: Record<ReasonTag | "other", { label: string; cls: string }> = {
  fomo: { label: "פחד לפספס", cls: "bg-down-soft text-down" },
  panic: { label: "פחד / פאניקה", cls: "bg-warn-soft text-warn" },
  tip: { label: "טיפ מאחרים", cls: "bg-warn-soft text-warn" },
  dip: { label: "קנייה בירידה", cls: "bg-brand-soft text-brand" },
  long: { label: "טווח ארוך", cls: "bg-up-soft text-up" },
  plan: { label: "לפי תוכנית", cls: "bg-up-soft text-up" },
  fundamental: { label: "ניתוח חברה", cls: "bg-up-soft text-up" },
  other: { label: "אחר", cls: "bg-bg text-muted" },
};

/** מילות מפתח לכל סוג נימוק. הסדר במערך TAG_PRIORITY קובע את "הסוג הראשי" */
export const KEYWORDS: Record<ReasonTag, string[]> = {
  fomo: ["כולם", "לפספס", "עלתה", "עולה", "טסה", "טס ", "חמה", "חם ", "טרנד", "באזז", "רקטה", "לירח", "מזנקת", "זינוק", "קפצה"],
  panic: ["פחד", "מפחד", "קורס", "קריסה", "נופל", "לפני שיירד", "לפני שתרד", "להציל", "ייגמר רע", "פאניקה", "לברוח", "לצאת מהר", "לא יכול לראות"],
  tip: ["שמעתי", "חבר", "המליץ", "המלצה", "טלגרם", "יוטיוב", "טיקטוק", "פורום", "קבוצה", "אמרו", "ראיתי ב"],
  dip: ["ירדה", "ירד ", "זול", "הנחה", "ירידה", "תיקון", "שפל", "מבצע", "הזדמנות", "בירידה"],
  long: ["טווח ארוך", "לטווח", "שנים", "פנסיה", "חיסכון", "מדד", "פיזור", "להחזיק", "לא לגעת", "עשור", "לאורך זמן"],
  plan: ["יעד", "מטרה", "הגעתי", "תכננתי", "סטופ", "תוכנית", "איזון", "הוראת קבע", "כמו שהחלטתי"],
  fundamental: ["רווח", "מכפיל", "דוח", "דו\"ח", "הכנסות", "צמיחה", "דיבידנד", "מאזן", "תזרים", "מוצר", "הנהלה", "תחרות"],
};
export const TAG_PRIORITY: ReasonTag[] = ["panic", "fomo", "tip", "dip", "fundamental", "plan", "long"];

export function classifyReason(text: string | null | undefined): ReasonTag[] {
  const t = ` ${(text ?? "").replace(/\s+/g, " ")} `;
  return TAG_PRIORITY.filter((tag) => KEYWORDS[tag].some((k) => t.includes(k)));
}
export const primaryTag = (tags: ReasonTag[]): ReasonTag | "other" => tags[0] ?? "other";

/** כל מה שהמנטור צריך לדעת על פקודה. ערכים כספיים בשקלים */
export type OrderFacts = {
  side: "buy" | "sell";
  symbol: string;
  kind: string; // EQUITY / ETF / INDEX
  why: string;
  exitPlan: string | null;
  grossIls: number; // שווי העסקה
  feeIls: number;
  totalIls: number; // שווי התיק לפני הפקודה
  positionIls: number; // שווי ההחזקה הנוכחית בנייר
  cashIls: number; // מזומן לפני הפקודה (בשקלים)
  positionPnlPct: number | null; // רווח/הפסד בהחזקה, במכירה
  daysSinceLastBuy: number | null;
  marketFromPeak: number | null; // המדד מתחת לשיא השנתי, באחוזים
  benchLabel: string;
};

const ORDER: Record<NoteLevel, number> = { bad: 0, warn: 1, info: 2, good: 3 };
const pct = (x: number) => `${Math.round(x)}%`;

/** הערות המנטור על פקודה. לא חוסם אף פעם (D22) */
export function mentorOnOrder(f: OrderFacts): { tags: ReasonTag[]; notes: MentorNote[] } {
  const tags = classifyReason(f.why);
  const notes: MentorNote[] = [];
  const add = (n: MentorNote) => notes.push(n);
  const buy = f.side === "buy";

  // ---- סוג הנימוק ----
  if (buy && tags.includes("fomo")) {
    add({ id: "fomo", level: "bad", icon: "🔥", title: "זה נשמע כמו FOMO", body: "\"כולם קונים\" או \"עלתה\" הן סיבות שקשורות למחיר ולא לחברה. מניות שעלו בגלל התלהבות נוטות להיות תנודתיות במיוחד. מה אתה יודע על החברה עצמה?" });
  }
  if (tags.includes("tip")) {
    add({ id: "tip", level: "warn", icon: "📣", title: "טיפ ממישהו אחר", body: "כשקונים בגלל המלצה, קשה לדעת מתי למכור, כי ההחלטה לא שלך. מה הייתה הסיבה שלו, ואתה מסכים איתה?" });
  }
  if (!buy && tags.includes("panic")) {
    add({ id: "panic-words", level: "warn", icon: "😨", title: "מכירה מתוך פחד", body: "הנימוק שכתבת מדבר על פחד, לא על החברה. האם משהו השתנה בסיבה שבגללה קנית, או רק המחיר?" });
  }
  if (buy && tags.includes("long") && f.kind !== "EQUITY") {
    add({ id: "long-etf", level: "good", icon: "✅", title: "טווח ארוך + פיזור", body: "קרן רחבה לטווח ארוך היא הגישה שעובדת לרוב האנשים לאורך זמן. השאלה החשובה: האם תחזיק בה גם כשהיא תרד 30%?" });
  } else if (tags.includes("fundamental")) {
    add({ id: "fundamental", level: "good", icon: "🔎", title: "נימוק על החברה עצמה", body: "נימוק שמבוסס על הרווחים או העסק של החברה הוא בסיס טוב. בבדיקה החוזרת תראה אם ההנחה שלך התממשה." });
  }
  if (!tags.length && f.why.trim().length < 20) {
    add({ id: "vague", level: "info", icon: "✍️", title: "הנימוק כללי מאוד", body: "נימוק קצר קשה לבדוק אחר כך. נסה לכתוב משפט אחד: למה דווקא הנייר הזה, ולמה עכשיו?" });
  }

  // ---- מה הפקודה עושה לתיק ----
  if (buy && f.kind === "EQUITY" && f.totalIls > 0) {
    const after = (f.positionIls + f.grossIls) / f.totalIls;
    if (after > 0.25) {
      add({
        id: "concentration", level: after > 0.4 ? "bad" : "warn", icon: "⚖️",
        title: `אחרי הקנייה: ${pct(after * 100)} מהתיק במניה אחת`,
        body: `ירידה של 20% במניה תוריד ${pct(after * 20)} מכל התיק. הרבה משקיעים מגבילים מניה בודדת ל-10%–25%.`,
      });
    }
  }
  if (!buy && (f.positionPnlPct ?? 0) < 0 && (f.marketFromPeak ?? 0) <= -15) {
    add({ id: "panic-sell", level: "warn", icon: "📉", title: `מכירה בהפסד, כשהשוק ${pct(Math.abs(f.marketFromPeak!))} מתחת לשיא`, body: "מכירות בשפל הן הטעות הכי יקרה של משקיעים מתחילים. אם הסיבה שקנית עדיין נכונה, ירידה בכל השוק היא לא סיבה למכור." });
  }
  if (!buy && f.daysSinceLastBuy != null && f.daysSinceLastBuy < 7) {
    add({ id: "overtrading", level: "warn", icon: "🔁", title: `מכירה ${f.daysSinceLastBuy === 0 ? "באותו יום" : `${f.daysSinceLastBuy} ימים`} אחרי קנייה`, body: "קנייה ומכירה מהירות עולות בעמלות ובמס, ולרוב לא מספיקות כדי שהנימוק יתממש. מה השתנה מאז שקנית?" });
  }
  if (f.grossIls > 0 && f.feeIls / f.grossIls > 0.01) {
    add({ id: "fee", level: "warn", icon: "💸", title: `העמלה היא ${(f.feeIls / f.grossIls * 100).toFixed(1)}% מהעסקה`, body: "בעסקה קטנה עמלת המינימום אוכלת הרבה. כדאי לרכז קניות לעסקה אחת גדולה יותר." });
  }
  if (buy && !f.exitPlan?.trim()) {
    add({ id: "no-exit", level: "info", icon: "🚪", title: "אין תוכנית יציאה", body: "מה יגרום לך למכור? מחיר יעד, ירידה מסוימת, או זמן? כשמחליטים מראש, קל יותר לא להחליט מפחד." });
  }
  if (buy && f.totalIls > 0 && (f.cashIls - f.grossIls - f.feeIls) / f.totalIls < 0.03) {
    add({ id: "all-in", level: "info", icon: "🪙", title: "כמעט כל הכסף מושקע", body: "אחרי הקנייה כמעט לא יישאר מזומן. זה בסדר לטווח ארוך, אבל לא תוכל לנצל ירידה כדי לקנות עוד." });
  }

  notes.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return { tags, notes };
}
