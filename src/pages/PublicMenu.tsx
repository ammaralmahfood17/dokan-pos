import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import type { Addon, Product } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatBHD } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Plus, Minus, Trash2, Bell, CheckCircle, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router";
import { MenuShimmer } from "@/components/menu/MenuShimmer";

type CartItem = {
  productId: string;
  name: string;
  nameAr?: string;
  unitPrice: number;
  quantity: number;
  addons: Addon[];
};

/** Stable per-device id — used to tell "this phone" from "another phone". */
function getDeviceSessionId(): string {
  let id = localStorage.getItem("dokan-session-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("dokan-session-id", id);
  }
  return id;
}

interface SharedCart {
  items: CartItem[];
  fromOther: boolean;
}

function readSharedCart(key: string | null): SharedCart {
  if (!key) return { items: [], fromOther: false };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { items: [], fromOther: false };
    const parsed = JSON.parse(raw) as { sessionId?: string; items?: CartItem[] };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const fromOther =
      Boolean(parsed.sessionId && parsed.sessionId !== getDeviceSessionId() && items.length > 0);
    return { items, fromOther };
  } catch {
    return { items: [], fromOther: false };
  }
}

export default function PublicMenu() {
  const { projectSlug, tableSlug } = useParams<{ projectSlug: string; tableSlug: string }>();
  const menu = useQuery(
    api.public.getPublicMenu,
    projectSlug && tableSlug ? { projectSlug, tableSlug } : "skip",
  );
  const createOrder = useMutation(api.public.createPublicOrder);
  const { t, lang } = useI18n();
  const [placing, setPlacing] = useState(false);
  const [waiterCalling, setWaiterCalling] = useState(false);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showAddon, setShowAddon] = useState<Product | null>(null);
  const [addonSelections, setAddonSelections] = useState<Addon[]>([]);
  const [placed, setPlaced] = useState<{ orderNumber: string } | null>(null);

  // ── Shared table cart (P0.4) ────────────────────────────────────────────
  // One cart per table: keyed `dokan-cart-<project>-<table>` so every phone
  // at the same table sees the same cart. Multi-tab sync via `storage` events.
  const cartKey = projectSlug && tableSlug ? `dokan-cart-${projectSlug}-${tableSlug}` : null;
  const [sharedInit] = useState(() => readSharedCart(cartKey));
  const [cart, setCart] = useState<CartItem[]>(sharedInit.items);
  const [fromOtherSession, setFromOtherSession] = useState(sharedInit.fromOther);

  // Persist on every change.
  useEffect(() => {
    if (!cartKey) return;
    try {
      localStorage.setItem(cartKey, JSON.stringify({ sessionId: getDeviceSessionId(), items: cart }));
    } catch {
      // Quota exceeded — keep the in-memory cart, nothing else to do.
    }
  }, [cart, cartKey]);

  // Another tab/phone at the same table changed the cart → adopt it.
  useEffect(() => {
    if (!cartKey) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== cartKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as { sessionId?: string; items?: CartItem[] };
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        setCart(items);
        setFromOtherSession(
          Boolean(parsed.sessionId && parsed.sessionId !== getDeviceSessionId() && items.length > 0),
        );
      } catch {
        // Malformed write from another tab — ignore.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [cartKey]);

  const project = menu?.project;
  const categories = menu?.categories ?? [];
  const products = menu?.products ?? [];
  const addonsByProduct: Record<string, Addon[]> = menu?.addonsByProduct ?? {};

  const displayLang = (project?.defaultLanguage ?? "en") === "ar" ? "ar" : lang;

  const filtered = products.filter((p) =>
    !activeCategory || p.categoryId === activeCategory,
  );

  const addToCart = (product: Product, selectedAddons: Addon[] = []) => {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === product._id && JSON.stringify(i.addons) === JSON.stringify(selectedAddons),
      );
      if (existing) return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, {
        productId: product._id,
        name: product.name,
        nameAr: product.nameAr,
        unitPrice: product.price,
        quantity: 1,
        addons: selectedAddons,
      }];
    });
  };

  const subtotal = cart.reduce((s, i) => {
    const addonTotal = i.addons.reduce((a, a2) => a + a2.price, 0);
    return s + (i.unitPrice + addonTotal) * i.quantity;
  }, 0);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  /** "Call Waiter" — inserts a waiter_calls row (staff see it via Realtime). */
  const handleCallWaiter = async () => {
    const tableId = menu?.tableId;
    if (!tableId || waiterCalling) return;
    setWaiterCalling(true);
    try {
      await api.waiter.callWaiter({ tableId, type: "assistance" });
      toast(t("menu.waiterCallSent"));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setWaiterCalling(false);
    }
  };

  const handlePlace = async () => {
    if (!projectSlug || !tableSlug || placing) return;
    setPlacing(true);
    try {
      const result = await createOrder({
        projectSlug,
        tableSlug,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        // One key per submission — the server dedupes on it, so a double-tap
        // or network retry can never place the same order twice.
        idempotencyKey: crypto.randomUUID(),
        items: cart.map((i) => ({
          productId: i.productId,
          name: i.name,
          nameAr: i.nameAr,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          addons:
            i.addons.length > 0
              ? i.addons.map((a) => ({ addonId: a._id, name: a.name, nameAr: a.nameAr, price: a.price }))
              : undefined,
        })),
      });
      setPlaced(result);
      setCart([]);
      setFromOtherSession(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setPlacing(false);
    }
  };

  if (menu === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <MenuShimmer />
      </div>
    );
  }

  if (menu === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">Menu not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This restaurant isn't accepting QR orders right now. Please scan the
          QR code again or ask a staff member for help.
        </p>
      </div>
    );
  }

  // Success screen
  if (placed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <CheckCircle className="size-12 text-emerald-500 mb-4" />
        <h1 className="text-2xl font-bold tracking-tight">{t("menu.orderSent")}</h1>
        <p className="mt-2 text-4xl font-mono font-bold">{placed.orderNumber}</p>
        <p className="mt-4 text-sm text-muted-foreground">{t("receipt.thankYou")}</p>
        <Button className="mt-8" variant="outline" onClick={() => setPlaced(null)}>
          {t("menu.addToCart")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir={displayLang === "ar" ? "rtl" : "ltr"}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              {displayLang === "ar" && project?.nameAr ? project.nameAr : project?.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("menu.table")} {menu.tableName ?? tableSlug}
            </p>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="relative flex size-10 items-center justify-center rounded-sm border border-border">
                <ShoppingCart className="size-4" />
                {cartCount > 0 && (
                  <span className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                    {cartCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t("menu.yourOrder")} ({cartCount})</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                {cart.map((item, idx) => (
                  <div key={idx} className="rounded-sm border border-border p-3">
                    <div className="flex justify-between">
                      <p className="text-sm font-medium">
                        {displayLang === "ar" && item.nameAr ? item.nameAr : item.name}
                      </p>
                      <span className="font-mono text-xs">
                        {formatBHD((item.unitPrice + item.addons.reduce((a, a2) => a + a2.price, 0)) * item.quantity, displayLang)}
                      </span>
                    </div>
                    {item.addons.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        + {item.addons.map((a) => displayLang === "ar" ? a.nameAr : a.name).join(", ")}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => {
                        setCart((prev) => {
                          if (prev[idx].quantity <= 1) return prev.filter((_, i) => i !== idx);
                          return prev.map((i, k) => k === idx ? { ...i, quantity: i.quantity - 1 } : i);
                        });
                      }} className="flex size-7 items-center justify-center rounded-sm border border-border">
                        <Minus className="size-3" />
                      </button>
                      <span className="font-mono text-xs min-w-[20px] text-center">{item.quantity}</span>
                      <button type="button" onClick={() => {
                        setCart((prev) => prev.map((i, k) => k === idx ? { ...i, quantity: i.quantity + 1 } : i));
                      }} className="flex size-7 items-center justify-center rounded-sm border border-border">
                        <Plus className="size-3" />
                      </button>
                      <button type="button" onClick={() => {
                        setCart((prev) => prev.filter((_, i) => i !== idx));
                      }} className="ms-auto flex size-7 items-center justify-center text-destructive">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {cart.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t("pos.emptyCart")}</p>
                )}
              </div>

              {cart.length > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>{t("pos.subtotal")}</span>
                    <span className="font-mono">{formatBHD(subtotal, displayLang)}</span>
                  </div>
                  <Separator />
                  <Input placeholder={t("pos.customerName")} value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)} />
                  <Input placeholder={t("pos.customerPhone")} value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)} />
                  <Button className="w-full min-h-11" onClick={handlePlace} disabled={placing}>
                    {placing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        {t("menu.placeOrder")} · {formatBHD(subtotal, displayLang)}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Category nav */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 sticky top-[72px] z-20 bg-background border-b border-border/40">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors
            ${!activeCategory ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
        >
          {displayLang === "ar" ? "الكل" : "All"}
        </button>
        {categories.map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => setActiveCategory(c._id)}
            className={`cv-auto shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors
                        ${activeCategory === c._id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}
          >
            {displayLang === "ar" ? c.nameAr : c.name}
          </button>
        ))}
      </div>

      {/* Products */}
      <div className="px-4 py-4 pb-32 space-y-1">
        {filtered.map((p) => {
          const addons = addonsByProduct[p._id] ?? [];
          return (
            <div
              key={p._id}
              className="cv-auto flex items-center justify-between rounded-sm border border-border p-3 transition-colors hover:bg-card"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {displayLang === "ar" && p.nameAr ? p.nameAr : p.name}
                </p>
                {p.description && (displayLang !== "ar" || p.descriptionAr) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {displayLang === "ar" && p.descriptionAr ? p.descriptionAr : p.description}
                  </p>
                )}
                {p.allergens.length > 0 && (
                  <div className="mt-1 flex gap-1">
                    {p.allergens.map((a) => (
                      <span key={a} className="text-[10px]">
                        {a === "dairy" ? "🥛" : a === "gluten" ? "🌾" : a === "nuts" ? "🥜" : a === "eggs" ? "🥚" : a === "spicy" ? "🌶️" : a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3 ms-3">
                <span className="font-mono text-sm font-semibold">{formatBHD(p.price, displayLang)}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (addons.length > 0) {
                      setShowAddon(p);
                      setAddonSelections([]);
                    } else {
                      addToCart(p);
                    }
                  }}
                  className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-sm bg-foreground text-background transition-all active:scale-95"
                  aria-label={displayLang === "ar" ? `إضافة ${p.nameAr} للسلة` : `Add ${p.name} to cart`}
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
        )}
      </div>

      {/* Addon dialog */}
      <Dialog open={!!showAddon} onOpenChange={() => setShowAddon(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{displayLang === "ar" && showAddon?.nameAr ? showAddon.nameAr : showAddon?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(addonsByProduct[showAddon?._id ?? ""] ?? []).map((a) => (
              <label key={a._id} className="flex items-center justify-between rounded-sm border border-border p-3 text-sm cursor-pointer hover:bg-secondary">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={addonSelections.some((s) => s._id === a._id)}
                    onChange={(e) => {
                      if (e.target.checked) setAddonSelections((prev) => [...prev, a]);
                      else setAddonSelections((prev) => prev.filter((s) => s._id !== a._id));
                    }}
                    className="size-4 accent-foreground"
                  />
                  <span>{displayLang === "ar" ? a.nameAr : a.name}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">+{formatBHD(a.price, displayLang)}</span>
              </label>
            ))}
          </div>
          <Button onClick={() => {
            if (showAddon) addToCart(showAddon, addonSelections);
            setShowAddon(null);
          }} className="w-full">
            {t("menu.addToCart")} ({addonSelections.length})
          </Button>
        </DialogContent>
      </Dialog>

      {/* Call waiter + floating cart */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border/60 bg-background p-4">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => void handleCallWaiter()}
            disabled={waiterCalling}
            aria-label={t("menu.callWaiter")}
            className="flex items-center justify-center gap-2 rounded-sm border border-border px-4 py-3 text-xs font-medium transition-colors hover:bg-secondary min-h-[44px] disabled:opacity-60"
          >
            {waiterCalling ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
            {t("menu.callWaiter")}
          </button>
          <Button
            className="flex-1 min-h-[44px]"
            onClick={() => {
              if (cartCount > 0) {
                document.querySelector<HTMLButtonElement>('[data-sheet-trigger]')?.click();
              }
            }}
          >
            {t("menu.yourOrder")} ({cartCount}) · {formatBHD(subtotal, displayLang)}
          </Button>
          {fromOtherSession && cartCount > 0 && (
            <span
              className="flex items-center gap-1 rounded-sm border border-gold/50 bg-gold/10 px-2 py-1 text-[10px] font-medium text-foreground"
              aria-label={t("menu.sharedCart")}
            >
              <Users className="size-3 text-gold" />
              {t("menu.sharedCart")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}