/** Format BHD currency with 3 decimal places. */
export function formatBHD(amount: number, lang: "en" | "ar" = "en"): string {
  const locale = lang === "ar" ? "ar-BH" : "en-BH";
  try {
    return new Intl.NumberFormat(locale, {
      style: "decimal",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount) + (lang === "ar" ? " د.ب" : " BHD");
  } catch {
    return `${amount.toFixed(3)} BHD`;
  }
}

/** Format a timestamp for display. */
export function formatTime(ts: number, lang: "en" | "ar" = "en"): string {
  try {
    return new Date(ts).toLocaleString(lang === "ar" ? "ar-BH" : "en-BH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

/** Format a date for display. */
export function formatDate(ts: number, lang: "en" | "ar" = "en"): string {
  try {
    return new Date(ts).toLocaleDateString(lang === "ar" ? "ar-BH" : "en-BH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

/** Format a short date (today / yesterday / date). */
export function formatRelativeDate(ts: number, lang: "en" | "ar" = "en"): string {
  const now = Date.now();
  const diff = now - ts;
  const day = 86400000;
  if (diff < day) return lang === "ar" ? "اليوم" : "Today";
  if (diff < 2 * day) return lang === "ar" ? "أمس" : "Yesterday";
  return formatDate(ts, lang);
}

/** Compute SLA percentage (0-100) from creation time. Target = 12 minutes. */
export function computeSLA(createdAt: number, targetMs = 12 * 60 * 1000): number {
  const elapsed = Date.now() - createdAt;
  return Math.min(100, Math.round((elapsed / targetMs) * 100));
}

/** Get SLA color class. */
export function slaColor(pct: number): string {
  if (pct < 75) return "border-l-green-500";
  if (pct < 100) return "border-l-amber-500";
  return "border-l-red-500";
}