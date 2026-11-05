import { dividends, getHistory, getInstrument, getQuote, priceOn, splits, usdIls } from "@/lib/market";

/**
 * GET /api/instrument/AAPL?from=2020-01-01&to=2020-12-31&on=2020-03-09
 * מחזיר פרטי נייר, מחיר חי, נרות "כפי שנסחר", פיצולים, דיבידנדים בטווח,
 * ואם יש on: המחיר ושער הדולר באותו תאריך.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/instrument/[symbol]">) {
  const { symbol } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const on = sp.get("on");
  try {
    const meta = await getInstrument(decodeURIComponent(symbol));
    if (!meta) return Response.json({ error: "נייר לא נמצא" }, { status: 404 });
    const [quote, bars, sp2, divs, at, fx] = await Promise.all([
      getQuote(meta.symbol),
      getHistory(meta.symbol, { from, to, asTraded: true }),
      splits(meta.symbol),
      dividends(meta.symbol, from ?? "1900-01-01", to ?? "2999-12-31"),
      on ? priceOn(meta.symbol, on) : null,
      on ? usdIls(on) : usdIls(),
    ]);
    return Response.json({ meta, quote, bars, splits: sp2, dividends: divs, at, usdIls: fx });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
