import { useState } from "react";
import { useQuery, useMutation } from "@/lib/react-query";
import { api, type LoyaltyProgram } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Gift, Stamp, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

export default function Loyalty() {
  const programs = useQuery(api.programs.listLoyaltyPrograms);
  const activeProgram = programs?.[0];
  const stamps = useQuery(
    api.programs.listLoyaltyStamps,
    activeProgram ? { programId: activeProgram._id } : "skip",
  );
  const createProgram = useMutation(api.programs.createLoyaltyProgram);
  const updateProgram = useMutation(api.programs.updateLoyaltyProgram);
  const deleteProgram = useMutation(api.programs.deleteLoyaltyProgram);
  const { t, lang } = useI18n();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyProgram | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const data = {
        name: String(fd.get("name") ?? ""),
        nameAr: String(fd.get("nameAr") ?? "") || undefined,
        stampTarget: Number(fd.get("stampTarget")) || 9,
        rewardName: String(fd.get("rewardName") ?? "") || undefined,
        rewardNameAr: String(fd.get("rewardNameAr") ?? "") || undefined,
      };
      if (editing) {
        await updateProgram({ id: editing._id, ...data });
      } else {
        await createProgram(data);
      }
      setOpen(false);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: LoyaltyProgram) => {
    if (confirm(`Delete "${p.name}"? Its stamp history will be removed too.`)) {
      await deleteProgram({ id: p._id });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.loyalty")}</h1>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="size-4" /> {t("common.create")} program
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit" : "New"} loyalty program
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input name="name" placeholder="Program name (EN)" defaultValue={editing?.name ?? ""} required />
                <Input name="nameAr" placeholder="اسم البرنامج (AR)" defaultValue={editing?.nameAr ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  name="stampTarget"
                  type="number"
                  min={1}
                  placeholder="Stamps to reward"
                  defaultValue={editing?.stampTarget ?? 9}
                />
                <Input name="rewardName" placeholder="Reward (EN)" defaultValue={editing?.rewardName ?? ""} />
              </div>
              <Input name="rewardNameAr" placeholder="المكافأة (AR)" defaultValue={editing?.rewardNameAr ?? ""} />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? "Update" : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(programs ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Gift className="size-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">{t("loyalty.noProgram")}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {(programs ?? []).map((p) => (
              <div key={p._id} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {lang === "ar" && p.nameAr ? p.nameAr : p.name}
                    </h2>
                    {p.rewardName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("loyalty.reward")}: {lang === "ar" && p.rewardNameAr ? p.rewardNameAr : p.rewardName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.stampTarget} {t("loyalty.stamps")} ·{" "}
                      {p.active ? "active" : "paused"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {activeProgram && (
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Stamps</h3>
                <Badge variant="outline" className="gap-1.5">
                  <Stamp className="size-3" />
                  {activeProgram.stampTarget} {t("loyalty.stamps")}
                </Badge>
              </div>
              {(stamps ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stamps collected yet — stamps are awarded automatically on
                  paid orders with a phone number.
                </p>
              ) : (
                <div className="space-y-2">
                  {(stamps ?? []).map((s) => (
                    <div key={s._id} className="flex items-center justify-between rounded-sm border border-border p-3">
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
          )}
        </>
      )}
    </div>
  );
}
