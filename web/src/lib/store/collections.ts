/**
 * חנות האוספים (D31, חבילה 12): 8 אוספים לפי נושא. כל נייר נבדק שיש לו נתונים ב-Yahoo (scripts/verify-store.ts).
 * במכונת זמן מוצגים לקנייה רק ניירות שכבר נסחרו ביום הסימולציה.
 * כל אוסף מסביר מה הוא, מה הסיכון, ואיזה שיעור קשור, כי המטרה היא ללמוד ולא רק לקנות.
 */
export type Collection = {
  id: string;
  emoji: string;
  title: string;
  /** צבע הכרטיס (טוקן CSS) */
  color: string;
  blurb: string;
  /** מה חשוב לדעת לפני שקונים */
  risk: string;
  /** אוסף נושאי = ריכוז בתחום אחד */
  concentrated: boolean;
  lesson: number;
  symbols: string[];
};

export const COLLECTIONS: Collection[] = [
  {
    id: "broad", emoji: "🌍", title: "מדדים רחבים", color: "var(--c-blue)", concentrated: false, lesson: 2,
    blurb: "קרנות סל שמחזיקות מאות או אלפי חברות בבת אחת: כל השוק האמריקאי, 100 הגדולות בנאסד\"ק, או כל העולם.",
    risk: "הדרך הפשוטה לפיזור רחב. עדיין יורדות בשוק דובי, לפעמים ב-30% ויותר.",
    symbols: ["VOO", "VTI", "QQQ", "DIA", "IWM", "VXUS", "VT"],
  },
  {
    id: "ai", emoji: "🤖", title: "בינה מלאכותית", color: "var(--c-purple)", concentrated: true, lesson: 6,
    blurb: "חברות שבונות את השבבים, הענן והתוכנה של עולם ה-AI.",
    risk: "אוסף נושאי: כולן תלויות באותה מגמה, ולכן עולות ויורדות יחד. תנודתי מאוד.",
    symbols: ["NVDA", "MSFT", "GOOGL", "AMD", "META", "AVGO", "TSM", "PLTR"],
  },
  {
    id: "green", emoji: "🌱", title: "אנרגיה ירוקה", color: "var(--c-green)", concentrated: true, lesson: 6,
    blurb: "שמש, רוח, רכב חשמלי וחברות חשמל שמשקיעות באנרגיה מתחדשת.",
    risk: "תחום שתלוי בריבית ובמדיניות ממשלות. היו בו עליות חדות ונפילות של 60% ויותר.",
    symbols: ["ICLN", "TAN", "ENPH", "FSLR", "NEE", "TSLA"],
  },
  {
    id: "health", emoji: "💊", title: "בריאות ותרופות", color: "var(--c-pink)", concentrated: true, lesson: 6,
    blurb: "חברות תרופות, ביטוח בריאות וציוד רפואי. אנשים צריכים תרופות גם במיתון.",
    risk: "נחשב תחום יציב יחסית, אבל חברה בודדת יכולה לצנוח על כישלון של תרופה אחת.",
    symbols: ["JNJ", "PFE", "LLY", "UNH", "MRK", "ABBV", "XLV"],
  },
  {
    id: "brands", emoji: "🛒", title: "מותגים שאתה מכיר", color: "var(--c-yellow)", concentrated: false, lesson: 1,
    blurb: "החברות שמאחורי המוצרים שבכיס, במקרר ובטלוויזיה.",
    risk: "להכיר את המוצר זה לא להכיר את המניה: גם חברה מצוינת יכולה להיות יקרה מדי.",
    symbols: ["AAPL", "AMZN", "KO", "NKE", "MCD", "DIS", "SBUX", "NFLX"],
  },
  {
    id: "israel", emoji: "🇮🇱", title: "ישראל", color: "var(--c-blue)", concentrated: true, lesson: 19,
    blurb: "חברות ישראליות שנסחרות בניו יורק ובתל אביב, וקרן סל על כל השוק הישראלי.",
    risk: "ישראל היא בערך 0.2% משוק המניות העולמי. תיק שכולו ישראל הוא ריכוז גבוה בכלכלה אחת.",
    symbols: ["EIS", "TEVA", "CHKP", "NICE", "WIX", "ESLT", "LUMI.TA", "POLI.TA"],
  },
  {
    id: "dividends", emoji: "💵", title: "דיבידנדים", color: "var(--c-green)", concentrated: false, lesson: 15,
    blurb: "חברות וקרנות שמחלקות חלק מהרווח במזומן, בדרך כלל כל רבעון.",
    risk: "דיבידנד הוא לא כסף חינם: המחיר יורד ביום החלוקה, ומשלמים עליו 25% מס.",
    symbols: ["SCHD", "VYM", "KO", "PG", "JNJ", "PEP", "O", "XOM"],
  },
  {
    id: "bonds", emoji: "🏦", title: "אג\"ח", color: "var(--c-gray)", concentrated: false, lesson: 17,
    blurb: "קרנות של אגרות חוב: הלוואות לממשלות ולחברות שמשלמות ריבית.",
    risk: "פחות תנודתי ממניות, אבל לא בלי סיכון: כשהריבית עולה, אג\"ח ארוכות יורדות (ב-2022 TLT ירדה בכ-30%).",
    symbols: ["BND", "AGG", "SHY", "IEF", "TLT", "LQD", "TIP"],
  },
];

export const collectionById = (id: string) => COLLECTIONS.find((c) => c.id === id);

/** שמות להצגה מיידית, לפני שהנתונים של הנייר נטענו */
export const NAMES: Record<string, string> = {
  VOO: "Vanguard S&P 500 ETF", VTI: "Vanguard Total Stock Market ETF", QQQ: "Invesco QQQ Trust", DIA: "SPDR Dow Jones ETF", IWM: "iShares Russell 2000 ETF",
  VXUS: "Vanguard Total International Stock ETF", VT: "Vanguard Total World Stock ETF",
  NVDA: "NVIDIA", MSFT: "Microsoft", GOOGL: "Alphabet (Google)", AMD: "AMD", META: "Meta Platforms", AVGO: "Broadcom", TSM: "TSMC", PLTR: "Palantir",
  ICLN: "iShares Global Clean Energy ETF", TAN: "Invesco Solar ETF", ENPH: "Enphase Energy", FSLR: "First Solar", NEE: "NextEra Energy", TSLA: "Tesla",
  JNJ: "Johnson & Johnson", PFE: "Pfizer", LLY: "Eli Lilly", UNH: "UnitedHealth", MRK: "Merck", ABBV: "AbbVie", XLV: "Health Care Select Sector SPDR",
  AAPL: "Apple", AMZN: "Amazon", KO: "Coca-Cola", NKE: "Nike", MCD: "McDonald's", DIS: "Disney", SBUX: "Starbucks", NFLX: "Netflix",
  EIS: "iShares MSCI Israel ETF", TEVA: "Teva", CHKP: "Check Point", NICE: "NICE", WIX: "Wix", ESLT: "Elbit Systems", "LUMI.TA": "בנק לאומי", "POLI.TA": "בנק הפועלים",
  SCHD: "Schwab US Dividend Equity ETF", VYM: "Vanguard High Dividend Yield ETF", PG: "Procter & Gamble", PEP: "PepsiCo", O: "Realty Income", XOM: "ExxonMobil",
  BND: "Vanguard Total Bond Market ETF", AGG: "iShares Core US Aggregate Bond", SHY: "iShares 1-3 Year Treasury", IEF: "iShares 7-10 Year Treasury",
  TLT: "iShares 20+ Year Treasury", LQD: "iShares Investment Grade Corporate Bond", TIP: "iShares TIPS Bond",
};
