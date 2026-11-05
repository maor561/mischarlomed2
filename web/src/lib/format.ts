export const SYM: Record<string, string> = { ILS: "₪", USD: "$" };

export function money(n: number | null | undefined, ccy: string = "ILS", digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 ? "−" : ""}${SYM[ccy] ?? ccy + " "}${s}`;
}

export function signed(n: number, ccy = "ILS", digits = 2): string {
  return (n > 0 ? "+" : "") + money(n, ccy, digits);
}

export const pct = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;

/** במסע עיוור השרת מחזיר "@ימים מההתחלה" במקום תאריך */
export function blindLabel(d: string): string {
  const n = Number(d.slice(1));
  return `שנה ${Math.floor(n / 365) + 1} · יום ${(n % 365) + 1}`;
}

export const isBlindDate = (d: string | null | undefined) => !!d && d.startsWith("@");

export function dateHe(d: string | null | undefined): string {
  if (!d) return "—";
  if (d.startsWith("@")) return blindLabel(d);
  const [y, m, day] = d.split("-");
  return `${Number(day)}.${Number(m)}.${y}`;
}

export const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "");

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? res.statusText);
  return j as T;
}
