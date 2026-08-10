import { LayoutDashboard, LogOut, Menu, QrCode, ShoppingCart, Store, Users, Coffee, Settings, Gift, Tag, BarChart3, Loader2, Radio, UserCheck, X, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { useOnline } from "@/hooks/use-online";
import { flushQueue } from "@/lib/offline";
import { useStaff, StaffProvider } from "@/hooks/use-staff";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function DashboardShell() {
  return (
    <StaffProvider>
      <DashboardInner />
    </StaffProvider>
  );
}

function DashboardInner() {
  const workspace = useWorkspace();
  const { user, signOut } = useAuth();
  const { staff, isLoggedIn, openLogin, logout } = useStaff();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, setLang, t, dir } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: "nav.dashboard", path: "/dashboard" },
    { icon: ShoppingCart, label: "nav.pos", path: "/dashboard/pos" },
    { icon: Radio, label: "nav.kds", path: "/dashboard/kds" },
    { icon: Store, label: "nav.orders", path: "/dashboard/orders" },
    { icon: Coffee, label: "nav.products", path: "/dashboard/products" },
    { icon: Coffee, label: "nav.categories", path: "/dashboard/categories" },
    { icon: QrCode, label: "nav.tables", path: "/dashboard/tables" },
    { icon: Users, label: "nav.branches", path: "/dashboard/branches" },
    { icon: UserX, label: "nav.staff", path: "/dashboard/staff" },
    { icon: Gift, label: "nav.loyalty", path: "/dashboard/loyalty" },
    { icon: Tag, label: "nav.promotions", path: "/dashboard/promotions" },
    { icon: BarChart3, label: "nav.reports", path: "/dashboard/reports" },
    { icon: Settings, label: "nav.settings", path: "/dashboard/settings" },
  ];

  // Redirect to onboarding if user is signed in but has no project.
  useEffect(() => {
    if (workspace === null) {
      navigate("/onboarding", { replace: true });
    }
  }, [workspace, navigate]);

  // Flush any offline-queued orders when back online (and on first mount).
  useEffect(() => {
    if (online) flushQueue();
  }, [online]);

  if (workspace === null || workspace === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen bg-background" dir={dir}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-56 flex-col border-e border-border bg-card transition-transform duration-200 sm:static sm:translate-x-0",
          dir === "rtl" ? "right-0 translate-x-full" : "left-0 -translate-x-full",
          sidebarOpen && "translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-border/60 px-5">
          <div className="flex size-7 items-center justify-center rounded-sm bg-foreground text-background">
            <span className="text-xs font-black">د</span>
          </div>
          <span className="text-base font-bold tracking-tight">Dokan</span>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isActive =
                item.path === "/dashboard"
                  ? location.pathname === "/dashboard"
                  : location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-sm px-3 text-sm transition-colors",
                    isActive
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{t(item.label)}</span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User info & sign out */}
        <div className="border-t border-border/60 p-3">
          <p className="truncate px-2 text-xs text-muted-foreground">
            {user?.name ?? user?.email ?? "User"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start gap-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="size-3.5" />
            {t("settings.signOut")}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="flex h-16 items-center justify-between border-b border-border/60 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="sm:hidden cursor-pointer"
              onClick={() => setSidebarOpen(true)}
              aria-label="Toggle menu"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-sm font-semibold">
                {workspace?.project?.name ?? "Dokan"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(location.pathname === "/dashboard"
                  ? "nav.dashboard"
                  : `nav.${location.pathname.split("/").pop() || ""}`)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* PIN-based cashier login */}
            {isLoggedIn && staff ? (
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-secondary hover:text-destructive"
                title="Log out cashier"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {staff.fullName}
                <X className="size-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={openLogin}
                className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <UserCheck className="size-3" />
                Sign in as cashier
              </button>
            )}

            {/* Language toggle */}
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-xs font-medium transition-colors hover:bg-secondary"
              title={t("settings.languageLabel")}
            >
              {lang === "en" ? "ع" : "EN"}
            </button>

            {/* Online indicator */}
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                online ? "bg-emerald-500" : "bg-amber-500",
              )}
              title={online ? t("common.online") : t("common.offline")}
            />
          </div>
        </header>

        {/* Offline banner */}
        {!online && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            <span className="size-1.5 rounded-full bg-amber-500" />
            {t("common.offline")}
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 px-4 py-6 sm:px-6 overflow-auto">
          <Suspense
            fallback={
              <div className="flex min-h-48 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}