import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/lib/i18n";
import { formatTime, computeSLA, slaColor } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Bell } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

export default function KDS() {
  const orders = useQuery(api.orders.listOrders);
  const updateStatus = useMutation(api.orders.updateOrderStatus);
  const { t, lang } = useI18n();
  const [now, setNow] = useState(Date.now());

  // Update SLA timers every 30s
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // New-order sound
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (!orders) return;
    const pending = orders.filter((o) => o.status === "pending").length;
    if (pending > prevCountRef.current && prevCountRef.current > 0) {
      // Play notification sound
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch {
        // audio not supported
      }
    }
    prevCountRef.current = pending;
  }, [orders]);

  const pendingOrders = (orders ?? [])
    .filter((o) => o.status === "pending" || o.status === "preparing")
    .sort((a, b) => a._creationTime - b._creationTime);

  const handleBump = async (orderId: Id<"orders">, currentStatus: string) => {
    const next = currentStatus === "pending" ? "preparing" : "ready";
    await updateStatus({ orderId, status: next });
  };

  // Group by status
  const preparing = pendingOrders.filter((o) => o.status === "preparing");
  const waiting = pendingOrders.filter((o) => o.status === "pending");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.kds")}</h1>
          <p className="text-xs text-muted-foreground">
            {pendingOrders.length} {t("order.status.pending")}
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Bell className="size-3" />
          {t("kds.newOrder")}
        </Badge>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Waiting */}
        <div>
          <h2 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {t("order.status.pending")} · {waiting.length}
          </h2>
          <div className="space-y-3">
            {waiting.map((o) => {
              const pct = computeSLA(o._creationTime);
              return (
                <div
                  key={o._id}
                  className={`rounded-md border-l-4 border bg-card p-4 shadow-sm ${slaColor(pct)}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{o.orderNumber}</span>
                        {o.tableId && <span className="text-xs text-muted-foreground">{t("menu.table")} {o.tableId}</span>}
                        <Badge variant="outline" className="text-[10px]">{t(`order.type.${o.orderType}`)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatTime(o._creationTime, lang)}</p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="mt-3 space-y-1">
                    {o.items.map((item: any) => (
                      <div key={item._id} className="flex justify-between text-xs">
                        <span>
                          {item.quantity}× {lang === "ar" && item.productNameAr ? item.productNameAr : item.productName}
                        </span>
                        {item.addons?.length > 0 && (
                          <span className="text-muted-foreground">
                            +{item.addons.map((a: any) => a.addonName).join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className={`font-mono text-xs ${pct >= 100 ? "text-red-600 sla-critical" : pct >= 75 ? "text-amber-600" : "text-green-600"}`}>
                      {pct}% · {t("kds.sla")}
                    </span>
                    <Button
                      size="sm"
                      className="gap-1.5 min-h-[40px]"
                      onClick={() => handleBump(o._id, o.status)}
                    >
                      <CheckCircle className="size-3.5" />
                      {t("kds.bump")}
                    </Button>
                  </div>
                </div>
              );
            })}
            {waiting.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">All clear</p>
            )}
          </div>
        </div>

        {/* Preparing */}
        <div>
          <h2 className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">
            {t("kds.preparing")} · {preparing.length}
          </h2>
          <div className="space-y-3">
            {preparing.map((o) => {
              const pct = computeSLA(o._creationTime);
              return (
                <div
                  key={o._id}
                  className={`rounded-md border-l-4 border bg-card p-4 shadow-sm ${slaColor(pct)}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{o.orderNumber}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(o._creationTime, lang)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 min-h-[40px]"
                      onClick={() => handleBump(o._id, o.status)}
                    >
                      {t("kds.ready")}
                    </Button>
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {o.items.map((item: any) => (
                      <p key={item._id} className="text-xs">
                        {item.quantity}× {item.productName}
                      </p>
                    ))}
                  </div>
                  <span className={`mt-2 inline-block font-mono text-xs ${pct >= 100 ? "text-red-600 sla-critical" : "text-muted-foreground"}`}>
                    {pct}% SLA
                  </span>
                </div>
              );
            })}
            {preparing.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">Nothing in progress</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}