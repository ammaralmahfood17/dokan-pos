import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowRight,
  Bike,
  Coffee,
  LayoutGrid,
  MonitorSmartphone,
  Printer,
  QrCode,
  Users,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router";

export default function Landing() {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: LayoutGrid,
      title: "Point of Sale",
      desc: "A fast, focused register for dine-in, takeaway and delivery. Add-ons, discounts and VAT handled automatically.",
    },
    {
      icon: QrCode,
      title: "QR Menu",
      desc: "One QR per table. Guests scan, browse the bilingual menu, and order without an app or a login.",
    },
    {
      icon: MonitorSmartphone,
      title: "Kitchen Display",
      desc: "Orders stream to the kitchen in real time with SLA timers and bump controls. No more paper slips.",
    },
    {
      icon: WifiOff,
      title: "Works Offline",
      desc: "The register keeps taking orders when the internet drops and syncs automatically when you're back online.",
    },
    {
      icon: Printer,
      title: "80mm Receipts",
      desc: "Bilingual, VAT-compliant thermal receipts with your TRN printed the moment an order is paid.",
    },
    {
      icon: Users,
      title: "Stamps & Loyalty",
      desc: "Digital stamp cards for regulars and promotions that push average order value up.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link to="/dashboard">
                <Button size="sm" variant="outline">
                  Open workspace <ArrowRight className="ms-2 size-3.5" />
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button size="sm" variant="outline">
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-24 pb-20 sm:pt-32 sm:pb-28">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-foreground" />
              POS · QR Menu · Kitchen Display — for the Gulf
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Your restaurant, on one quiet screen.
            </h1>
            <p className="mt-6 text-base leading-7 text-muted-foreground sm:text-lg">
              Dokan takes you from registration to your first real order in under
              seven minutes — a register, a QR menu for every table, and a kitchen
              display that never misses an order.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
                <Button size="lg" className="min-h-11">
                  {isAuthenticated ? "Open your workspace" : "Start your free trial"}
                  <ArrowRight className="ms-2 size-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="min-h-11">
                  Explore features
                </Button>
              </a>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              No credit card · Bahraini VAT (10%) built in · Arabic & English
            </p>
          </div>

          {/* Terminal-style preview */}
          <div className="mx-auto mt-20 max-w-4xl">
            <div className="rounded-lg border border-border bg-card shadow-[0_1px_0_0_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.12)]">
              <div className="flex items-center gap-1.5 border-b border-border/70 px-4 py-3">
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
                <span className="ms-3 font-mono text-[11px] text-muted-foreground">
                  dokan.app/register
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3">
                {/* Product grid mock */}
                <div className="border-e border-border/70 p-5">
                  <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Menu
                  </p>
                  {["Arabic Coffee", "Karak Chai", "Chicken Shawarma", "Kunafa"].map((n, i) => (
                    <div key={n} className="mb-2.5 flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
                      <div>
                        <p className="text-xs font-medium">{n}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {(i * 0.25 + 0.5).toFixed(3)} BHD
                        </p>
                      </div>
                      <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-[10px] font-medium text-background">
                        +
                      </span>
                    </div>
                  ))}
                </div>
                {/* Cart mock */}
                <div className="border-e border-border/70 p-5">
                  <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Order
                  </p>
                  <div className="space-y-2">
                    {[
                      ["1× Karak Chai", "0.500"],
                      ["1× Shawarma", "1.250"],
                      ["1× Oat milk", "0.500"],
                    ].map(([n, p]) => (
                      <div key={n} className="flex justify-between text-xs">
                        <span>{n}</span>
                        <span className="font-mono">{p}</span>
                      </div>
                    ))}
                    <div className="mt-4 space-y-1 border-t border-dashed border-border pt-3">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="font-mono">2.250</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>VAT 10%</span>
                        <span className="font-mono">0.225</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Total</span>
                        <span className="font-mono">2.475</span>
                      </div>
                    </div>
                    <div className="mt-4 flex h-10 items-center justify-center rounded-md bg-foreground text-xs font-medium text-background">
                      Confirm & pay
                    </div>
                  </div>
                </div>
                {/* KDS mock */}
                <div className="p-5">
                  <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Kitchen
                  </p>
                  <div className="rounded-md border-l-2 border-l-green-500 border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">#0042 · Table 3</p>
                      <span className="font-mono text-[10px] text-green-600">4:12</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      1× Shawarma · 1× Karak · 1× Kunafa
                    </p>
                    <div className="mt-3 flex h-8 items-center justify-center rounded border border-border text-[10px] font-medium">
                      Bump
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Features
          </p>
          <h2 className="mt-4 max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Everything a busy restaurant needs. Nothing it doesn't.
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group bg-background p-7 transition-colors hover:bg-card"
              >
                <f.icon className="size-5 text-foreground/60 transition-colors group-hover:text-foreground" />
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            From zero to first order
          </p>
          <h2 className="mt-4 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            Seven minutes, three steps.
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {[
              {
                n: "01",
                icon: Coffee,
                title: "Tell us about your restaurant",
                desc: "Name it, pick a branch, add a few tables. The demo menu is seeded for you — no blank screens.",
              },
              {
                n: "02",
                icon: QrCode,
                title: "Print or share the table QR",
                desc: "Every table gets its own QR code linking straight to your digital menu.",
              },
              {
                n: "03",
                icon: Bike,
                title: "Take the first order",
                desc: "Tap items on the register or let guests order from their phone. The kitchen sees it instantly.",
              },
            ].map((s) => (
              <div key={s.n}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <s.icon className="mt-5 size-5" />
                <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Ready to take the next order?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            Create your workspace, scan the QR on your first table, and watch an
            order come through the kitchen in minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              <Button size="lg" className="min-h-11">
                {isAuthenticated ? "Open your workspace" : "Start your free trial"}
                <ArrowRight className="ms-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Wordmark />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Dokan · POS & QR Menu for Bahrain & the Gulf
          </p>
        </div>
      </footer>
    </div>
  );
}

export function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center justify-center rounded-sm ${size === "sm" ? "size-6" : "size-7"} bg-foreground text-background`}>
        <span className={size === "sm" ? "text-[10px] font-black" : "text-xs font-black"}>د</span>
      </div>
      <span className={`${size === "sm" ? "text-sm" : "text-base"} font-bold tracking-tight`}>
        Dokan
      </span>
    </div>
  );
}