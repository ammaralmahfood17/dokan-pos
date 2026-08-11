import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import { formatTime, computeSLA, slaColor } from "@/lib/format";
import { useKDSSound } from "@/hooks/use-kds-sound";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Bell, Volume2, VolumeX, Receipt } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/lib/api";

const MUTE_KEY = "dokan-kds-muted";

export default function KDS() {
  const orders = useQuery(api.orders.listOrders);
  const updateStatus = useMutation(api.orders.updateOrderStatus);
  const { t, lang } = useI18n();
  const [, setNow] = useState(0);
  const { playNewOrder } = useKDSSound();

  // Sound preference — persisted, so the mute survives reloads.
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  // Update SLA timers every 30s (A11y: never every second)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // New-order sound + waiter-call subscription
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (!orders) return;
    const pending = orders.filter((o) => o.status === "pending").length;
    if (pending > prevCountRef.current && prevCountRef.current > 0 && !muted) {
      playNewOrder();
    }
    prevCountRef.current = pending;
  }, [orders, muted, playNewOrder]);

  // Customer "Call Waiter" — toast staff the moment it lands via Realtime.
  useEffect(() => {
    const channel = supabase
      .channel("waiter-calls-kds")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "waiter_calls" },
        async (payload) => {
          const row = payload.new as { table_id?: string; type?: string } | null;
          const tableId = row?.table_id;
          const type = row?.type === "bill" ? "bill" : "assistance";
          let label = "";
          if (tableId) {
            const { data } = await supabase
              .from("tables")
              .select("name")
              .eq("id", tableId)
              .maybeSingle();
            label = data?.name ?? tableId.slice(0, 8);
          }
          toast(
            type === "bill"
              ? `${t("menu.bill")} — ${label}`
              : `${t("kds.waiterCall")} — ${label}`,
            {
              icon: type === "bill" ? <Receipt className="size-4 text-gold" /> : <Bell className="size-4 text-gold" />,
              duration: 8000,
            },
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [t]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 min-h-[40px]"
            onClick={toggleMute}
            aria-label={muted ? t("kds.unmute") : t("kds.mute")}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            {muted ? t("kds.unmute") : t("kds.mute")}
          </Button>
          <Badge variant="outline" className="gap-2">
            <Bell className="size-3" />
            {t("kds.newOrder")}
          </Badge>
        </div>
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
                  className={`rounded-md border bg-card p-4 shadow-sm ${slaColor(pct)} ${pct >= 100 ? "sla-critical" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{o.orderNumber}</span>
                        {o.tableName && <span className="text-xs text-muted-foreground">{t("menu.table")} {o.tableName}</span>}
                        <Badge variant="outline" className="text-[10px]">{t(`order.type.${o.orderType}`)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatTime(o._creationTime, lang)}</p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="mt-3 space-y-1">
                    {o.items.map((item) => (
                      <div key={item._id} className="flex justify-between text-xs">
                        <span>
                          {item.quantity}× {lang === "ar" && item.productNameAr ? item.productNameAr : item.productName}
                        </span>
                        {item.addons && item.addons.length > 0 && (
                          <span className="text-muted-foreground">
                            +{item.addons.map((a) => a.addonName).join(", ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span
                      aria-live="polite"
                      className={`font-mono text-xs ${pct >= 100 ? "text-red-600" : pct >= 75 ? "text-amber-600" : "text-emerald-600"}`}
                    >
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
                  className={`rounded-md border bg-card p-4 shadow-sm ${slaColor(pct)} ${pct >= 100 ? "sla-critical" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{o.orderNumber}</span>
                        {o.tableName && <span className="text-xs text-muted-foreground">{t("menu.table")} {o.tableName}</span>}
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
                    {o.items.map((item) => (
                      <p key={item._id} className="text-xs">
                        {item.quantity}× {item.productName}
                      </p>
                    ))}
                  </div>
                  <span className={`mt-2 inline-block font-mono text-xs ${pct >= 100 ? "text-red-600" : "text-muted-foreground"}`}>
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