import { useI18n } from "@/lib/i18n";

/**
 * Lightweight skeleton for the public QR menu while the catalog loads —
 * mirrors the real item-card layout so the swap causes no layout shift.
 */
export function MenuShimmer() {
  const { t } = useI18n();
  return (
    <div className="space-y-4 p-4" role="status" aria-live="polite" aria-label={t("common.loading")}>
      {/* Category bar shimmer */}
      <div className="flex gap-2">
        <div className="h-8 w-24 animate-pulse rounded-sm bg-[var(--border)]" />
        <div className="h-8 w-16 animate-pulse rounded-sm bg-[var(--border)]" />
        <div className="h-8 w-20 animate-pulse rounded-sm bg-[var(--border)]" />
      </div>
      {/* Item cards */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3"
        >
          <div className="h-20 w-20 flex-shrink-0 animate-pulse rounded-lg bg-[var(--border)]" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--border)]" />
            <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
          </div>
        </div>
      ))}
    </div>
  );
}