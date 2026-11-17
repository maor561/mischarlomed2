"use client";

/** מקלדת מספרים לסכום (סקיצה 07). value הוא מחרוזת כדי לאפשר "12." בזמן הקלדה */
export function pressKey(value: string, key: string, maxDecimals = 2): string {
  if (key === "⌫") return value.length > 1 ? value.slice(0, -1) : "0";
  if (key === ".") return maxDecimals > 0 && !value.includes(".") ? value + "." : value;
  const [, dec] = value.split(".");
  if (dec != null && dec.length >= maxDecimals) return value;
  const next = value === "0" ? key : value + key;
  return next.replace(".", "").length > 9 ? value : next;
}

export default function Keypad({ value, onChange, maxDecimals = 2 }: { value: string; onChange: (v: string) => void; maxDecimals?: number }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-1.5" dir="ltr">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className="bg-soft rounded-[14px] py-2.5 text-lg font-semibold active:bg-line disabled:opacity-30"
          disabled={k === "." && maxDecimals === 0}
          onClick={() => onChange(pressKey(value, k, maxDecimals))}
          aria-label={k === "⌫" ? "מחיקה" : k}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
