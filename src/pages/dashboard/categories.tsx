import { useState } from "react";
import { useQuery, useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Id } from "@/lib/api";

export default function Categories() {
  const catalog = useQuery(api.catalog.posCatalog);
  const createCategory = useMutation(api.catalog.createCategory);
  const updateCategory = useMutation(api.catalog.updateCategory);
  const deleteCategory = useMutation(api.catalog.deleteCategory);
  const { t } = useI18n();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const categories = catalog?.categories ?? [];

  const handleSave = async (formData: any) => {
    if (editing?._id) {
      await updateCategory({ id: editing._id, ...formData });
    } else {
      await createCategory(formData);
    }
    setOpen(false);
    setEditing(null);
  };

  const handleDelete = async (id: Id<"categories">) => {
    if (confirm("Delete this category?")) await deleteCategory({ id });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("categories.addCategory")}</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="size-4" /> {t("categories.addCategory")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} category</DialogTitle></DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSave({ name: fd.get("name"), nameAr: fd.get("nameAr"), sortOrder: Number(fd.get("sortOrder")) || 0 });
            }} className="space-y-4">
              <Input name="name" placeholder="English name" defaultValue={editing?.name ?? ""} required />
              <Input name="nameAr" placeholder="الاسم بالعربية" defaultValue={editing?.nameAr ?? ""} required />
              <Input name="sortOrder" type="number" placeholder="Sort order" defaultValue={editing?.sortOrder ?? 0} />
              <Button type="submit" className="w-full">{editing ? "Update" : "Create"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">Name (EN)</th>
              <th className="px-4 py-3 text-start font-medium">Name (AR)</th>
              <th className="px-4 py-3 text-start font-medium">Order</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c._id} className="border-b border-border/40 transition-colors hover:bg-card/50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.nameAr}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.sortOrder}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="size-8"
                      onClick={() => { setEditing(c); setOpen(true); }}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive"
                      onClick={() => handleDelete(c._id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}