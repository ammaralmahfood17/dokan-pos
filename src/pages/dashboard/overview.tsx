import { api } from "@/lib/api";
import { useQuery } from "@/lib/react-query";
import { useI18n } from "@/lib/i18n";
import { formatBHD } from "@/lib/format";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShoppingCart } from "lucide-react";

export default function Overview() {
  const stats = useQuery(api.dashboard.todayStats);
  const orders = useQuery(api.orders.listOrders);
  const { t, lang } = useI18n();

  const recent = (orders ?? []).slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.dashboard")}</h1>
        <div className="flex gap-2">
          <Link to="/dashboard/pos">
            <Button size="sm" variant="outline" className="gap-2">
              <ShoppingCart className="size-4" />
              {t("nav.pos")}
            </Button>
          </Link>
          <Link to="/dashboard/kds">
            <Button size="sm" variant="outline" className="gap-2">
              <ArrowRight className="size-4" />
              {t("nav.kds")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("dashboard.todayRevenue"), value: stats ? formatBHD(stats.revenue, lang) : "—" },
          { label: t("dashboard.todayOrders"), value: stats ? String(stats.orderCount) : "—" },
          { label: t("dashboard.paidOrders"), value: stats ? String(stats.paidCount) : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-border p-4 transition-colors hover:bg-card">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1.5 text-xl font-semibold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown + Top items */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {stats && (
          <>
            <div className="rounded-md border border-border p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">{t("dashboard.statusBreakdown")}</p>
              <div className="space-y-2">
                {Object.entries(stats.statusCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{status}</span>
                    <span className="font-mono text-xs">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-border p-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">{t("dashboard.topItems")}</p>
              {stats.topItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="space-y-2">
                  {stats.topItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <span className="truncate">{item.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.qty}×
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Recent orders */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t("dashboard.recentOrders")}</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.noOrders")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 text-start font-medium">{t("order.status.pending")}</th>
                  <th className="pb-2 text-start font-medium">{t("pos.total")}</th>
                  <th className="pb-2 text-start font-medium">{t("order.type.dine-in")}</th>
                  <th className="pb-2 text-start font-medium">Items</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o._id} className="border-b border-border/60">
                    <td className="py-2.5 text-sm">{o.orderNumber}</td>
                    <td className="py-2.5 font-mono text-xs">{formatBHD(o.total, lang)}</td>
                    <td className="py-2.5 text-xs capitalize text-muted-foreground">
                      {t(`order.type.${o.orderType}`)}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {o.items.length} {o.items.length === 1 ? "item" : "items"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}