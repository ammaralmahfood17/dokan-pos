import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@/lib/react-query";
import { api } from "@/lib/api";
import { usePosCatalog, useWorkspace } from "@/hooks/use-workspace";
import { useOnline } from "@/hooks/use-online";
import { useStaff } from "@/hooks/use-staff";
import { useI18n } from "@/lib/i18n";
import { formatBHD } from "@/lib/format";
import { addToQueue } from "@/lib/offline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Minus, Trash2, Search, Utensils, Package, Bike,
  Banknote, CreditCard, QrCode, Percent, Loader2,
} from "lucide-react";
import type { Addon, CartAddonArg, Id, Product, TableWithStatus } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────
interface CartItem {
  productId?: Id<"products">;
  name: string;
  nameAr?: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  addons: { addonId?: Id<"addons">; name: string; nameAr?: string; price: number }[];
}

// ─── Component ───────────────────────────────────────────
export default function POS() {
  const catalog = usePosCatalog();
  const workspace = useWorkspace();
  const createOrder = useMutation(api.orders.createOrder);
  const tablesWithStatus = useQuery(api.operations.tablesWithStatus);
  const online = useOnline();
  const { staffId } = useStaff();
  const { t, lang } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway" | "delivery">("dine-in");
  const [selectedTable, setSelectedTable] = useState<Id<"tables"> | undefined>(undefined);
  const [pendingTable, setPendingTable] = useState<TableWithStatus | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "benefitpay" | "card">("cash");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [showAddon, setShowAddon] = useState<Product | null>(null);
  const [addonSelections, setAddonSelections] = useState<Addon[]>([]);

  const categories = catalog?.categories ?? [];
  const allProducts = catalog?.products ?? [];
  const addonsByProduct = catalog?.addonsByProduct ?? {};

  const filtered = allProducts.filter((p) => {
    const matchCat = !activeCategory || p.categoryId === activeCategory;
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.nameAr.includes(search);
    return matchCat && matchSearch;
  });

  // Add to cart
  const addToCart = useCallback((product: Product, selectedAddons: CartAddonArg[] = []) => {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === product._id && JSON.stringify(i.addons) === JSON.stringify(selectedAddons),
      );
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          nameAr: product.nameAr,
          unitPrice: product.price,
          quantity: 1,
          addons: selectedAddons,
        },
      ];
    });
  }, []);

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      if (delta <= 0 && next[idx].quantity <= 1) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity + delta) };
      }
      return next;
    });
  };

  const subtotal = cart.reduce((s, i) => {
    const addonTotal = i.addons.reduce((a, a2) => a + a2.price, 0);
    return s + (i.unitPrice + addonTotal) * i.quantity;
  }, 0);
  // Use the workspace VAT rate so what's shown matches what createOrder stores
  // (the backend computes totals from the project's vat_rate, not a hardcoded 10%).
  const vatRate = workspace?.project?.vatRate ?? 0.1;
  const vat = Math.max(0, (subtotal - discount) * vatRate);
  const total = Math.max(0, subtotal - discount + vat);

  const selectedTableName = tablesWithStatus?.find((tb) => tb._id === selectedTable)?.name;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    const items = cart.map((i) => ({
      productId: i.productId,
      name: i.name,
      nameAr: i.nameAr,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      notes: i.notes,
      addons: i.addons.length > 0 ? i.addons : undefined,
    }));

    const payload = {
      orderType,
      paymentMethod,
      paymentStatus: (paymentMethod === "cash" ? "paid" : "pending") as "paid" | "pending",
      staffId: staffId,
      tableId: orderType === "dine-in" ? selectedTable : undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      discountAmount: discount || 0,
      items,
    };

    if (!online) {
      addToQueue(payload);
      toast(t("pos.orderPlaced"));
      setCart([]);
      setShowPayment(false);
      setDiscount(0);
      setCustomerName("");
      setCustomerPhone("");
      setSubmitting(false);
      return;
    }

    try {
      await createOrder(payload);
      toast(
        selectedTableName
          ? `${t("pos.orderPlaced")} — ${t("menu.table")} ${selectedTableName}`
          : t("pos.orderPlaced"),
      );
      setCart([]);
      setShowPayment(false);
      setDiscount(0);
      setCustomerName("");
      setCustomerPhone("");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Layout ──────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-5rem)] -mx-4 sm:-mx-6">
      {/* Left: Products */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Category tabs */}
        <div className="flex items-center gap-1 border-b border-border px-4 py-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors
              ${!activeCategory ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
          >
            {lang === "ar" ? "الكل" : "All"}
          </button>
          {categories.map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => setActiveCategory(c._id)}
              className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors
                ${activeCategory === c._id ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
            >
              {lang === "ar" ? c.nameAr : c.name}
            </button>
          ))}
        </div>

        {/* Table selector — dine-in only */}
        {orderType === "dine-in" && (
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2 overflow-x-auto shrink-0">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("menu.table")}
            </span>
            <button
              type="button"
              onClick={() => setSelectedTable(undefined)}
              className={`shrink-0 rounded-sm px-2.5 py-1.5 text-[10px] font-medium transition-colors border
                ${!selectedTable
                  ? "bg-foreground text-background border-foreground"
                  : "border-dashed border-border text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              {t("pos.noTable")}
            </button>
            {(tablesWithStatus ?? []).map((tb) => {
              const isSelected = selectedTable === tb._id;
              return (
                <button
                  key={tb._id}
                  type="button"
                  onClick={() => {
                    if (tb.occupied) {
                      setPendingTable(tb);
                    } else {
                      setSelectedTable(tb._id);
                    }
                  }}
                  title={tb.occupied ? `${tb.name} — ${t("pos.occupied")}: ${tb.activeOrders.join(", ")}` : tb.name}
                  className={`shrink-0 flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-medium transition-colors border
                    ${isSelected
                      ? "bg-foreground text-background border-foreground"
                      : tb.occupied
                        ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                >
                  <span className={`size-1.5 rounded-full ${tb.occupied ? "bg-amber-500" : "bg-emerald-500"}`} />
                  {tb.name}
                  {tb.occupied && (
                    <span className="font-mono text-[9px] opacity-80">
                      · {formatBHD(tb.activeTotal, lang)}
                    </span>
                  )}
                  {tb.occupied && tb.activeOrders.length > 1 && (
                    <span className="font-mono text-[8px] opacity-70">×{tb.activeOrders.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="relative border-b border-border px-4 py-2 shrink-0">
          <Search className="absolute start-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search") + "..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-8 h-8 text-xs"
          />
        </div>

        {/* Product grid */}
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => {
                  const addons = addonsByProduct[p._id] ?? [];
                  if (addons.length > 0) {
                    setShowAddon(p);
                    setAddonSelections([]);
                  } else {
                    addToCart(p);
                  }
                }}
                className="group flex flex-col items-start rounded-md border border-border p-3 text-start transition-all hover:border-foreground/30 hover:bg-card active:scale-[0.98]"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-medium leading-tight line-clamp-2">
                    {lang === "ar" && p.nameAr ? p.nameAr : p.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatBHD(p.price, lang)}
                  </span>
                </div>
                {(addonsByProduct[p._id]?.length ?? 0) > 0 && (
                  <span className="mt-1.5 text-[10px] text-muted-foreground">
                    + {t("products.addons")}
                  </span>
                )}
                {p.allergens.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {p.allergens.map((a) => (
                      <Badge key={a} variant="outline" className="h-4 px-1 text-[8px]">
                        {a === "dairy" ? "🥛" : a === "gluten" ? "🌾" : a === "nuts" ? "🥜" : a === "eggs" ? "🥚" : a === "spicy" ? "🌶️" : a[0]}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                {t("common.noResults")}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Cart */}
      <div className="flex w-80 flex-col border-s border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("pos.cart")}
            {selectedTableName && (
              <span className="ms-2 text-[10px] font-semibold text-foreground">
                · {t("menu.table")} {selectedTableName}
              </span>
            )}
          </p>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          {cart.length === 0 ? (
            <p className="pt-8 text-center text-xs text-muted-foreground">{t("pos.emptyCart")}</p>
          ) : (
            <div className="space-y-3">
              {cart.map((item, idx) => (
                <div key={idx} className="rounded-sm border border-border/60 bg-background p-2.5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      {item.addons.length > 0 && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                          {item.addons.map((a) => a.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px]">
                      {formatBHD((item.unitPrice + item.addons.reduce((s, a) => s + a.price, 0)) * item.quantity, lang)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQty(idx, -1)}
                      className="flex size-6 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-secondary"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="min-w-[20px] text-center font-mono text-xs">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(idx, 1)}
                      className="flex size-6 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-secondary"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      className="ms-auto flex size-6 items-center justify-center rounded-sm text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Totals + actions */}
        <div className="border-t border-border p-4 space-y-3">
          {/* Order type selector */}
          <div className="flex gap-1.5" role="radiogroup">
            {[
              { value: "dine-in" as const, icon: Utensils, label: "order.type.dine-in" },
              { value: "takeaway" as const, icon: Package, label: "order.type.takeaway" },
              { value: "delivery" as const, icon: Bike, label: "order.type.delivery" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={orderType === opt.value}
                onClick={() => {
                  setOrderType(opt.value);
                  if (opt.value !== "dine-in") setSelectedTable(undefined);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 text-[10px] font-medium transition-colors
                  ${orderType === opt.value ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-secondary"}`}
              >
                <opt.icon className="size-3.5" />
                <span>{t(opt.label)}</span>
              </button>
            ))}
          </div>

          {/* Discount */}
          <div className="flex items-center gap-2">
            <Percent className="size-3 text-muted-foreground" />
            <Input
              type="number"
              step="0.001"
              min={0}
              placeholder="0.000"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="h-7 text-xs font-mono"
            />
            <span className="text-[10px] text-muted-foreground">discount</span>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>{t("pos.subtotal")}</span>
              <span className="font-mono">{formatBHD(subtotal, lang)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t("pos.discount")}</span>
                <span className="font-mono">-{formatBHD(discount, lang)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>{t("pos.vat")} ({Math.round(vatRate * 100)}%)</span>
              <span className="font-mono">{formatBHD(vat, lang)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between text-sm font-semibold">
              <span>{t("pos.total")}</span>
              <span className="font-mono">{formatBHD(total, lang)}</span>
            </div>
          </div>

          {/* Customer info */}
          <div className="space-y-1.5">
            <Input
              placeholder={t("pos.customerName")}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              placeholder={t("pos.customerPhone")}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-7 text-xs"
            />
          </div>

          {/* Action buttons */}
          <div className="space-y-1.5">
            <Button
              className="w-full min-h-11"
              disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}
            >
              {t("pos.confirmOrder")} · {formatBHD(total, lang)}
            </Button>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setCart([]);
                setDiscount(0);
                setCustomerName("");
                setCustomerPhone("");
              }}
              disabled={cart.length === 0}
            >
              <Trash2 className="size-3.5" />
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </div>

      {/* Occupied-table confirm dialog */}
      <Dialog open={!!pendingTable} onOpenChange={() => setPendingTable(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingTable?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("pos.tableInUse")
              .replace("{name}", pendingTable?.name ?? "")
              .replace("{orders}", pendingTable?.activeOrders?.join(", ") ?? "")}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingTable(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (pendingTable) setSelectedTable(pendingTable._id);
                setPendingTable(null);
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Addon modal */}
      {showAddon && (
        <Dialog open={!!showAddon} onOpenChange={() => setShowAddon(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{lang === "ar" && showAddon.nameAr ? showAddon.nameAr : showAddon.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {(addonsByProduct[showAddon._id] ?? []).map((a: Addon) => (
                <label
                  key={a._id}
                  className="flex cursor-pointer items-center justify-between rounded-sm border border-border p-3 text-sm transition-colors hover:bg-secondary"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addonSelections.some((s) => s._id === a._id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAddonSelections((prev) => [...prev, a]);
                        } else {
                          setAddonSelections((prev) => prev.filter((s) => s._id !== a._id));
                        }
                      }}
                      className="size-3.5 accent-foreground"
                    />
                    <span>{lang === "ar" ? a.nameAr : a.name}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{formatBHD(a.price, lang)}</span>
                </label>
              ))}
            </div>
            <Button
              onClick={() => {
                addToCart(showAddon, addonSelections.map((a) => ({
                  addonId: a._id,
                  name: a.name,
                  nameAr: a.nameAr,
                  price: a.price,
                })));
                setShowAddon(null);
              }}
              className="w-full mt-2"
            >
              {t("pos.addToCart")} ({addonSelections.length})
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment modal */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pos.payNow")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {[
                { value: "cash" as const, icon: Banknote, label: "order.payment.cash" },
                { value: "benefitpay" as const, icon: QrCode, label: "order.payment.benefitpay" },
                { value: "card" as const, icon: CreditCard, label: "order.payment.card" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-sm border p-3 text-xs transition-colors
                    ${paymentMethod === opt.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-secondary"}`}
                >
                  <opt.icon className="size-5" />
                  {t(opt.label)}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Input
                placeholder={t("pos.customerName")}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Input
                placeholder={t("pos.customerPhone")}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t("pos.total")}</p>
              <p className="text-2xl font-bold font-mono">{formatBHD(total, lang)}</p>
            </div>

            <Button className="w-full min-h-11" onClick={handleConfirm} disabled={submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : paymentMethod === "cash" ? (
                t("pos.payNow")
              ) : (
                t("pos.confirmOrder")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}