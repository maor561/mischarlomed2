/**
 * דף נייר (סקיצה 04): מחיר, שיא/שפל, ההחזקה שלך, ההיסטוריה שלך עם הנייר, דיבידנדים,
 * ונתוני חברה רק בתיק חי (D19). במכונת זמן הכול נחתך ביום הסימולציה.
 */
import { addDays, round2, todayIL } from "./engine/money";
import { loadLedger, loadOrders, loadPortfolio, UserError } from "./engine/service";
import { replay } from "./engine/state";
import { dividends, getHistory, getInstrument, getQuote, priceOn, USD_ILS } from "./market";
import { getInfo, sectorHe } from "./market/info";

export async function stockPage(id: number, symbolIn: string) {
  const p = await loadPortfolio(id);
  const meta = await getInstrument(symbolIn);
  if (!meta) throw new UserError("נייר לא נמצא");
  const live = p.mode === "live";
  const end = live ? todayIL() : p.simDate;
  if (meta.firstTrade && meta.firstTrade > end) throw new UserError(`${meta.symbol} עוד לא נסחרה ב-${end}`);

  const year = await getHistory(meta.symbol, { from: addDays(end, -365), to: end, asTraded: true });
  const last = year.at(-1);
  let price = last?.close ?? 0;
  let dayPct: number | null = null;
  if (live) {
    const q = await getQuote(meta.symbol);
    price = q.price;
    dayPct = q.prevClose ? round2((q.price / q.prevClose - 1) * 100) : null;
  } else if (last && last.d === end && year.length > 1) {
    dayPct = round2((last.close / year[year.length - 2].close - 1) * 100);
  }
  const closes = year.map((b) => b.close);

  const info = await getInfo(meta.symbol, meta.kind, live).catch(() => null);
  const divs = await dividends(meta.symbol, addDays(end, -365), end);

  // ההחזקה וההיסטוריה שלך עם הנייר
  const ledger = await loadLedger(id);
  const s = replay(ledger.filter((e) => e.d <= end));
  const pos = s.positions.get(meta.symbol);
  const fx = live ? (await getQuote(USD_ILS)).price : (await priceOn(USD_ILS, end))?.close ?? 1;
  const orders = new Map((await loadOrders(id, false)).map((o) => [o.id, o]));
  const mine = ledger
    .filter((e) => e.symbol === meta.symbol && ["buy", "sell", "dividend", "split"].includes(e.kind))
    .reverse()
    .slice(0, 20)
    .map((e) => ({ d: e.d, kind: e.kind, qty: e.qty, price: e.price, why: e.orderId ? orders.get(e.orderId)?.why ?? null : null, meta: e.meta }));
  let holding = null;
  if (pos) {
    const costCcy = pos.lots.reduce((a, l) => a + l.costCcy, 0);
    const costIls = pos.lots.reduce((a, l) => a + l.costIls, 0);
    const valueIls = pos.qty * price * (pos.currency === "USD" ? fx : 1);
    holding = { qty: pos.qty, avgCost: round2(costCcy / pos.qty), valueIls: round2(valueIls), pnlIls: round2(valueIls - costIls), pnlPct: costIls ? round2(((valueIls - costIls) / costIls) * 100) : 0 };
  }

  return {
    symbol: meta.symbol,
    name: meta.name,
    exchange: meta.exchange,
    currency: meta.currency,
    kind: meta.kind,
    live,
    asOf: end,
    price: round2(price),
    dayPct,
    high52: closes.length ? round2(Math.max(...closes)) : null,
    low52: closes.length ? round2(Math.min(...closes)) : null,
    sector: meta.kind === "EQUITY" ? sectorHe(info?.sector ?? null) : null,
    fundamentals: live ? info?.fundamentals ?? null : null,
    dividends: divs.map((d) => ({ d: d.d, amount: round2(d.value * 10000) / 10000 })),
    holding,
    history: mine,
  };
}

export type StockPage = Awaited<ReturnType<typeof stockPage>>;
