import { useQuery } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatBHD } from "@/lib/format";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

function weekdayLabel(dateStr: string, lang: "en" | "ar"): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(lang === "ar" ? "ar-BH" : "en-GB", {
    weekday: "short",
    day: "numeric",
  });
}

export default function Reports() {
  const stats = useQuery(api.dashboard.todayStats);
  const allOrders = useQuery(api.orders.listOrders);
  const dailySales = useQuery(api.reports.getDailySales);
  const topProducts = useQuery(api.reports.getProductPerformance);
  const { t, lang } = useI18n();

  const totalRevenue = (allOrders ?? []).reduce((s, o) => s + o.total, 0);

  const dailyData = (dailySales ?? []).map((d) => ({
    ...d,
    label: weekdayLabel(d.date, lang),
  }));

  const productData = (topProducts ?? []).map((p) => ({
    name: lang === "ar" && p.nameAr ? p.nameAr : p.name,
    qty: p.qty,
    revenue: p.revenue,
  }));

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
          <p className="text-xs text-muted-foreground">{t("reports.totalRevenue")}</p>
          <p className="mt-1.5 text-xl font-semibold font-mono">{formatBHD(totalRevenue, lang)}</p>
        </div>
      </div>

      {/* Daily sales — last 7 days */}
      <div className="mt-6 rounded-md border border-border p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-xs font-medium text-muted-foreground">{t("reports.dailySales")}</p>
          <p className="text-[10px] text-muted-foreground">{t("reports.last7Days")}</p>
        </div>
        <div className="h-48 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
                formatter={(value) => [formatBHD(Number(value), lang), t("reports.revenue")]}
              />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[2, 2, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Product performance — last 30 days */}
      <div className="mt-6 rounded-md border border-border p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-xs font-medium text-muted-foreground">{t("reports.productPerformance")}</p>
          <p className="text-[10px] text-muted-foreground">{t("reports.last30Days")}</p>
        </div>
        {productData.length > 0 ? (
          <>
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productData}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                    }}
                    formatter={(value) => [formatBHD(Number(value), lang), t("reports.revenue")]}
                  />
                  <Bar dataKey="revenue" fill="var(--gold)" radius={[0, 2, 2, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1">
              {productData.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <span className="truncate">{p.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {p.qty} {t("reports.units")}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
        )}
      </div>

      {/* Today's top items (existing) */}
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