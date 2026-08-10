import { useState } from "react";
import { useQuery, useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Tag } from "lucide-react";
import type { Id } from "@/lib/api";

const TYPE_KEYS: Record<string, string> = {
  percentage: "promotions.percentage",
  fixed: "promotions.fixed",
  bogo: "promotions.bogo",
};

export default function Promotions() {
  const promotions = useQuery(api.programs.listPromotions);
  const createPromotion = useMutation(api.programs.createPromotion);
  const deletePromotion = useMutation(api.programs.deletePromotion);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createPromotion({
      name: fd.get("name") as string,
      nameAr: fd.get("nameAr") as string || undefined,
      type: fd.get("type") as any,
      value: Number(fd.get("value")) || undefined,
      minOrderAmount: Number(fd.get("minOrderAmount")) || undefined,
    });
    setOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.promotions")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="size-4" /> {t("promotions.addPromotion")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("promotions.addPromotion")}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input name="name" placeholder="Promotion name" required />
              <Input name="nameAr" placeholder="اسم العرض" />
              <Select name="type" defaultValue="percentage">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_KEYS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{t(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input name="value" type="number" step="0.001" placeholder="Value" />
              <Input name="minOrderAmount" type="number" step="0.001" placeholder="Min order amount" />
              <Button type="submit" className="w-full">{t("common.create")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(promotions ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Tag className="size-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">{t("promotions.noPromotions")}</p>
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">Name</th>
                <th className="px-4 py-3 text-start font-medium">{t("promotions.type")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("promotions.value")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(promotions ?? []).map((p) => (
                <tr key={p._id} className="border-b border-border/40">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{t(TYPE_KEYS[p.type] ?? p.type)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.value ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="size-8 text-destructive"
                      onClick={async () => {
                        if (confirm("Delete?")) await deletePromotion({ id: p._id });
                      }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}