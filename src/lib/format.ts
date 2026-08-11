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

/**
 * SLA color classes for KDS cards:
 *  - < 75%: green   (on track)
 *  - 75–100%: gold/amber (getting close)
 *  - ≥ 100%: red + pulse (computeSLA caps at 100, so ≥ 100 is the breach bucket)
 */
export function slaColor(pct: number): string {
  if (pct < 75) return "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30";
  if (pct < 100) return "border-gold bg-amber-50/60 dark:bg-amber-950/30";
  return "border-red-500 bg-red-50/60 dark:bg-red-950/30";
}