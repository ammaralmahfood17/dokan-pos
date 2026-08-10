import { useState } from "react";
import { useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

export default function Branches() {
  const workspace = useWorkspace();
  const branches = workspace?.branches ?? [];
  const createBranch = useMutation(api.operations.createBranch);
  const deleteBranch = useMutation(api.operations.deleteBranch);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createBranch({
      name: fd.get("name") as string,
      nameAr: fd.get("nameAr") as string || undefined,
      address: fd.get("address") as string || undefined,
      phone: fd.get("phone") as string || undefined,
    });
    setOpen(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.branches")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="size-4" /> {t("branches.addBranch")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("branches.addBranch")}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input name="name" placeholder="Branch name" required />
              <Input name="nameAr" placeholder="الاسم بالعربية" />
              <Input name="address" placeholder="Address" />
              <Input name="phone" placeholder="Phone" />
              <Button type="submit" className="w-full">{t("common.create")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">{t("branches.addBranch")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b._id} className="border-b border-border/40">
                <td className="px-4 py-3">
                  <p className="font-medium">{b.name}</p>
                  {b.nameAr && <p className="text-xs text-muted-foreground">{b.nameAr}</p>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" className="size-8 text-destructive"
                    onClick={async () => {
                      if (confirm("Delete?")) await deleteBranch({ id: b._id });
                    }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}