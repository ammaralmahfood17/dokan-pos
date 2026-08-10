import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

const ROLE_KEYS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  kitchen: "Kitchen",
};

export default function Staff() {
  const workspace = useWorkspace();
  const members = workspace?.staff ?? [];
  const createStaff = useMutation(api.operations.createStaff);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createStaff({
      fullName: fd.get("fullName") as string,
      role: fd.get("role") as any,
      pinCode: fd.get("pinCode") as string || undefined,
    });
    setOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.staff")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="size-4" /> {t("staff.addMember")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("staff.addMember")}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input name="fullName" placeholder={t("staff.fullName")} required />
              <Select name="role" defaultValue="cashier">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_KEYS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input name="pinCode" placeholder={t("staff.pin")} maxLength={4} />
              <Button type="submit" className="w-full">{t("common.create")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">{t("staff.fullName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("staff.role")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("staff.pin")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m._id} className="border-b border-border/40">
                <td className="px-4 py-3 font-medium">{m.fullName}</td>
                <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{ROLE_KEYS[m.role] ?? m.role}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.pinCode ?? "—"}</td>
                <td className="px-4 py-3 text-right" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}