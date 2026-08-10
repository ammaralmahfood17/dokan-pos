import { useState } from "react";
import { useMutation } from "@/lib/react-query";
import { api, type StaffMember } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

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
  const updateStaff = useMutation(api.operations.updateStaff);
  const deleteStaff = useMutation(api.operations.deleteStaff);
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const fullName = String(fd.get("fullName") ?? "");
      const role = String(fd.get("role") ?? "cashier");
      // A blank PIN field means "leave the existing PIN untouched" when
      // editing (we never prefill or display PINs); undefined skips the
      // set_staff_pin RPC entirely so an existing PIN is not wiped.
      const pinInput = String(fd.get("pinCode") ?? "").trim();
      const pinCode = pinInput || undefined;
      if (editing) {
        await updateStaff({ id: editing._id, fullName, role, pinCode });
      } else {
        await createStaff({ fullName, role, pinCode });
      }
      setOpen(false);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: StaffMember) => {
    if (confirm(`Remove ${m.fullName} from the team?`)) {
      await deleteStaff({ id: m._id });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.staff")}</h1>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="size-4" /> {t("staff.addMember")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "Add"} staff member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <Input
                name="fullName"
                placeholder={t("staff.fullName")}
                defaultValue={editing?.fullName ?? ""}
                required
              />
              <Select name="role" defaultValue={editing?.role ?? "cashier"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_KEYS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                name="pinCode"
                placeholder={t("staff.pin") + " (4 digits)"}
                maxLength={4}
                inputMode="numeric"
                defaultValue=""
                autoComplete="one-time-code"
              />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? "Update" : t("common.create")}
              </Button>
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
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.hasPin ? "••••" : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setEditing(m);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => handleDelete(m)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
