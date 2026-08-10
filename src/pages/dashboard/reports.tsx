import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/lib/i18n";
import { formatBHD, formatDate } from "@/lib/format";
import { BarChart3 } from "lucide-react";

export default function Reports() {
  const stats = useQuery(api.dashboard.todayStats);
  const allOrders = useQuery(api.orders.listOrders);
  const { t, lang } = useI18n();

  const totalRevenue = (allOrders ?? []).reduce((s, o) => s + o.total, 0);
  const totalPaid = (allOrders ?? []).filter((o) => o.paymentStatus === "paid")
    .reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t("nav.reports")}</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-border p-4">
          <p className="text-xs text-muted-foreground">{t("dashboard.todayRevenue")}</p>
          <p className="mt-1.5 text-xl font-semibold font-mono">
            {stats ? formatBHD(stats.revenue, lang) : "—"}
          </p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-xs text-muted-foreground">{t("reports.today")} {t("dashboard.todayOrders")}</p>
          <p className="mt-1.5 text-xl font-semibold font-mono">{stats?.orderCount ?? "—"}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-xs text-muted-foreground">{t("reports.today")} {t("dashboard.paidOrders")}</p>
          <p className="mt-1.5 text-xl font-semibold font-mono">{stats?.paidCount ?? "—"}</p>
        </div>
        <div className="rounded-md border border-border p-4">
          <p className="text-xs text-muted-foreground">Total revenue (all time)</p>
          <p className="mt-1.5 text-xl font-semibold font-mono">{formatBHD(totalRevenue, lang)}</p>
        </div>
      </div>

      {stats && stats.topItems.length > 0 && (
        <div className="mt-6 rounded-md border border-border p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">{t("dashboard.topItems")}</p>
          <div className="space-y-2">
            {stats.topItems.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="truncate">{item.name}</span>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground">{item.qty}×</span>
                  <span className="font-mono text-xs">{formatBHD(item.revenue, lang)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}