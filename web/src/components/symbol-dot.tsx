/** "לוגו" של נייר: עיגול צבעוני עם האות הראשונה. לא הלוגו האמיתי של החברה (סקיצה 07) */
export default function SymbolDot({ symbol, size = 38 }: { symbol: string; size?: number }) {
  const hue = [...symbol].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;
  return (
    <span
      className="inline-grid place-items-center rounded-[12px] text-white font-extrabold shrink-0"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 50%)`, fontSize: size * 0.4 }}
      aria-hidden
    >
      {symbol.replace(/^\^/, "")[0]}
    </span>
  );
}
