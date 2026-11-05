import { ImageResponse } from "next/og";

/** אייקון האפליקציה: גרף עולה על רקע כחול. maskable = עם שוליים בטוחים לחיתוך עגול */
export function appIcon(size: number, maskable = false) {
  const pad = maskable ? size * 0.2 : size * 0.12;
  const w = size - pad * 2;
  const pts = [
    [0, 0.78],
    [0.28, 0.52],
    [0.5, 0.64],
    [1, 0.15],
  ]
    .map(([x, y]) => `${pad + x * w},${pad + y * w}`)
    .join(" ");
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", background: "#2753d6", borderRadius: maskable ? 0 : size * 0.22 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polyline points={pts} fill="none" stroke="#ffffff" strokeWidth={size * 0.09} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={pad + w} cy={pad + 0.15 * w} r={size * 0.075} fill="#7ee2a8" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
