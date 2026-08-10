import { useQuery } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Gift, Stamp } from "lucide-react";

export default function Loyalty() {
  const programs = useQuery(api.programs.listLoyaltyPrograms);
  const activeProgram = programs?.[0];
  const stamps = useQuery(
    api.programs.listLoyaltyStamps,
    activeProgram ? { programId: activeProgram._id } : "skip",
  );
  const { t, lang } = useI18n();

  if (!activeProgram) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-6">{t("nav.loyalty")}</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Gift className="size-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">{t("loyalty.noProgram")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.loyalty")}</h1>
        <Badge variant="outline" className="gap-1.5">
          <Stamp className="size-3" />
          {activeProgram.stampTarget} {t("loyalty.stamps")}
        </Badge>
      </div>

      <div className="rounded-md border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold">
          {lang === "ar" && activeProgram.nameAr ? activeProgram.nameAr : activeProgram.name}
        </h2>
        {activeProgram.rewardName && (
          <p className="text-sm text-muted-foreground mt-1">
            {t("loyalty.reward")}: {lang === "ar" && activeProgram.rewardNameAr ? activeProgram.rewardNameAr : activeProgram.rewardName}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {t("loyalty.stampCard")} · {activeProgram.stampTarget} {t("loyalty.stamps")}
        </p>
      </div>

      <h3 className="text-sm font-medium text-muted-foreground mb-3">Stamps</h3>
      {(stamps ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No stamps collected yet.</p>
      ) : (
        <div className="space-y-2">
          {(stamps ?? []).map((s) => (
            <div key={s._id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="font-mono text-xs">{s.customerPhone}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.currentStamps} / {activeProgram.stampTarget} {t("loyalty.stamps")}
                </p>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: Math.min(s.currentStamps, activeProgram.stampTarget) }).map((_, i) => (
                  <div key={i} className="size-3 rounded-full bg-foreground" />
                ))}
                {Array.from({ length: Math.max(0, activeProgram.stampTarget - s.currentStamps) }).map((_, i) => (
                  <div key={`e-${i}`} className="size-3 rounded-full border border-border bg-background" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}