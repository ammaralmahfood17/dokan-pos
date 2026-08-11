import { useEffect, useState } from "react";
import { useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  applyTheme, resetTheme, saveTheme, loadTheme, DEFAULT_THEME,
  type ThemeColors,
} from "@/lib/theme";
import { LogOut, RotateCcw, Palette } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const workspace = useWorkspace();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const updateProject = useMutation(api.projects.updateProject);

  const project = workspace?.project;

  // ── Theme (P2.1): live preview, persisted locally ────────────────────────
  const [theme, setTheme] = useState<ThemeColors>(() => loadTheme());

  const updateTheme = (patch: Partial<ThemeColors>) => {
    setTheme((prev) => {
      const next = { ...prev, ...patch };
      applyTheme(next); // instant, no save button needed
      saveTheme(next);
      return next;
    });
  };

  const handleResetTheme = () => {
    resetTheme();
    setTheme(DEFAULT_THEME);
    toast(t("settings.themeReset"));
  };

  useEffect(() => {
    // Sync state if the theme was changed in another tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dokan-theme") setTheme(loadTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await updateProject({
        name: fd.get("name") as string || undefined,
        nameAr: fd.get("nameAr") as string || undefined,
        vatRate: Number(fd.get("vatRate")) || undefined,
        vatNumber: fd.get("vatNumber") as string || undefined,
        currency: fd.get("currency") as string || undefined,
        benefitpayMerchantId: fd.get("benefitpayMerchantId") as string || undefined,
      });
      toast("Settings saved");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t("nav.settings")}</h1>

      <div className="max-w-lg space-y-8">
        {/* Language */}
        <div>
          <h2 className="text-sm font-semibold mb-3">{t("settings.language")}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors
                ${lang === "en" ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-secondary"}`}
            >
              {t("settings.english")}
            </button>
            <button
              type="button"
              onClick={() => setLang("ar")}
              className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors
                ${lang === "ar" ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-secondary"}`}
            >
              {t("settings.arabic")}
            </button>
          </div>
        </div>

        <Separator />

        {/* Project settings */}
        <div>
          <h2 className="text-sm font-semibold mb-3">{t("settings.project")}</h2>
          {project ? (
            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("onboarding.projectName")}</Label>
                <Input name="name" defaultValue={project.name} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("onboarding.projectNameAr")}</Label>
                <Input name="nameAr" defaultValue={project.nameAr ?? ""} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("settings.vatRate")}</Label>
                  <Input name="vatRate" type="number" step="0.0001" defaultValue={String(project.vatRate)} className="h-8 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("settings.vatNumber")}</Label>
                  <Input name="vatNumber" defaultValue={project.vatNumber ?? ""} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("benefitPay.merchantId")}</Label>
                <Input
                  name="benefitpayMerchantId"
                  defaultValue={String(project.metadata?.benefitpayMerchantId ?? "")}
                  className="h-8 text-sm font-mono"
                  dir="ltr"
                  placeholder="BP-XXXX-XXXX"
                />
              </div>
              <Button type="submit" size="sm">{t("common.save")}</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
        </div>

        <Separator />

        {/* Theme (P2.1) — live customizer */}
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-1">
            <Palette className="size-3.5 text-gold" />
            {t("settings.theme")}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">{t("settings.themeHint")}</p>
          <div className="space-y-3">
            {(
              [
                ["primary", "settings.primaryColor", theme.primary],
                ["gold", "settings.goldColor", theme.gold],
                ["surface", "settings.surfaceColor", theme.surface],
              ] as const
            ).map(([key, label, value]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <Label className="text-xs text-muted-foreground">{t(label)}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={value}
                    onChange={(e) => updateTheme({ [key]: e.target.value } as Partial<ThemeColors>)}
                    className="h-8 w-14 cursor-pointer p-1"
                    aria-label={t(label)}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">{value}</span>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleResetTheme}>
              <RotateCcw className="size-3.5" />
              {t("settings.themeReset")}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Sign out */}
        <div>
          <Button variant="outline" className="gap-2 text-destructive" onClick={handleSignOut}>
            <LogOut className="size-4" />
            {t("settings.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}