"use client";

import { useSyncExternalStore } from "react";

/**
 * מצב "מתקדם" (D32): כבוי כברירת מחדל. כשהוא דלוק, חלון הקנייה מציג לימיט, סטופ ותוקף,
 * ו"עוד" מציג קופות נפרדות והמרה ידנית. ההעדפה נשמרת בדפדפן (נוחות אישית בלבד).
 */
const KEY = "stock-sim:advanced";
const EVENT = "stock-sim:advanced-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdvanced(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useAdvanced(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
