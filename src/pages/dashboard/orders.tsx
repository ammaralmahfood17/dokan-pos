import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useI18n } from "@/lib/i18n";
import { formatBHD, formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, CheckCircle, XCircle } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  preparing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  delivered: "text-muted-foreground border",
  cancelled: "text-destructive border",
};

export default function Orders() {
  const orders = useQuery(api.orders.listOrders);
  const updateStatus = useMutation(api.orders.updateOrderStatus);
  const payOrder = useMutation(api.orders.payOrder);
  const { t, lang } = useI18n();
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const filtered = (orders ?? []).filter((o) =>
    filterStatus ? o.status === filterStatus : true,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.orders")}</h1>
        <div className="flex gap-1">
          {[null, "pending", "preparing", "ready", "delivered", "cancelled"].map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`rounded-sm px-2 py-1 text-[10px] font-medium transition-colors
                ${filterStatus === s ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {s ? t(`order.status.${s}`) : lang === "ar" ? "الكل" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((o) => (
          <div
            key={o._id}
            className="flex items-center justify-between rounded-md border border-border bg-card p-4 transition-colors hover:bg-card"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0 text-center min-w-[56px]">
                <p className="font-mono text-xs font-semibold">{o.orderNumber}</p>
                <p className="text-[10px] text-muted-foreground">{formatTime(o._creationTime, lang)}</p>
              </div>

              <Badge className={STATUS_BADGE[o.status] ?? ""}>
                {t(`order.status.${o.status}`)}
              </Badge>

              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {t(`order.type.${o.orderType}`)}
                  {o.tableName && <> · {t("menu.table")} {o.tableName}</>}
                </p>
                <p className="text-xs truncate mt-0.5">
                  {o.items.slice(0, 3).map((i: any) =>
                    `${i.quantity}× ${i.productName}`
                  ).join(", ")}
                  {o.items.length > 3 && ` +${o.items.length - 3} more`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <p className="font-mono text-sm font-semibold">{formatBHD(o.total, lang)}</p>

              {o.status === "pending" && (
                <Button size="sm" className="min-h-9 gap-1"
                  onClick={() => updateStatus({ orderId: o._id, status: "preparing" })}>
                  <CheckCircle className="size-3.5" />
                  {t("kds.bump")}
                </Button>
              )}

              {o.paymentStatus === "pending" && (
                <Button size="sm" variant="outline" className="min-h-9 gap-1"
                  onClick={() => payOrder({ orderId: o._id })}>
                  {t("pos.payNow")}
                </Button>
              )}

              <Button size="sm" variant="ghost" className="min-h-9"
                onClick={() => setSelectedOrder(o)}>
                <Printer className="size-3.5" />
              </Button>

              {(o.status === "pending" || o.status === "preparing") && (
                <Button size="sm" variant="ghost" className="min-h-9 text-destructive"
                  onClick={() => updateStatus({ orderId: o._id, status: "cancelled" })}>
                  <XCircle className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
        )}
      </div>

      {/* Receipt modal */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("common.print")}</DialogTitle></DialogHeader>
          {selectedOrder && <ReceiptPreview order={selectedOrder} lang={lang} t={t} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptPreview({ order, lang, t }: any) {
  return (
    <div className="receipt-print mx-auto" style={{ width: 302, fontSize: 9, fontFamily: "'Courier New', monospace" }}>
      <div className="receipt-header">
        <p style={{ fontWeight: 700, fontSize: 12 }}>Dokan</p>
        <p>{t("receipt.thankYou")}</p>
        <p className="receipt-divider" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      </div>
      <p>{order.orderNumber} · {formatTime(order._creationTime, lang)}</p>
      <p>{t(`order.type.${order.orderType}`)}</p>
      <div className="receipt-divider" />
      {order.items.map((item: any) => (
        <div key={item._id} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{item.quantity}× {item.productName}</span>
          <span className="font-mono">{(item.unitPrice * item.quantity).toFixed(3)}</span>
        </div>
      ))}
      <div className="receipt-divider" />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{t("pos.subtotal")}</span>
        <span className="font-mono">{order.subtotal.toFixed(3)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{t("pos.vat")} (10%)</span>
        <span className="font-mono">{order.vatAmount.toFixed(3)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>{t("pos.total")}</span>
        <span className="font-mono">{order.total.toFixed(3)} BHD</span>
      </div>
      <div className="receipt-divider" />
      <div className="receipt-footer">
        <p>{t("receipt.thankYou")}</p>
        <p>شكراً لزيارتكم</p>
      </div>
    </div>
  );
}