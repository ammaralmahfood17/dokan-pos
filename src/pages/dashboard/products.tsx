import { useState } from "react";
import { useQuery, useMutation } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatBHD } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectItem, SelectContent } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Id } from "@/lib/api";

export default function Products() {
  const catalog = useQuery(api.catalog.posCatalog);
  const createProduct = useMutation(api.catalog.createProduct);
  const updateProduct = useMutation(api.catalog.updateProduct);
  const deleteProduct = useMutation(api.catalog.deleteProduct);
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const products = catalog?.products ?? [];
  const categories = catalog?.categories ?? [];

  const handleSave = async (formData: any) => {
    if (editing?._id) {
      await updateProduct({ id: editing._id, ...formData });
    } else {
      await createProduct({ ...formData, price: Number(formData.price) });
    }
    setOpen(false);
    setEditing(null);
  };

  const handleDelete = async (id: Id<"products">) => {
    if (confirm("Delete this product?")) await deleteProduct({ id });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("products.name")}</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="size-4" /> {t("products.addProduct")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "Add"} {t("products.name").toLowerCase()}</DialogTitle>
            </DialogHeader>
            <ProductForm
              categories={categories}
              initial={editing}
              onSave={handleSave}
              lang={lang}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-start font-medium">{t("products.name")} / {t("products.nameAr")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("products.category")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("products.price")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("products.available")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const cat = categories.find((c) => c._id === p.categoryId);
              return (
                <tr key={p._id} className="border-b border-border/40 transition-colors hover:bg-card/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{lang === "ar" && p.nameAr ? p.nameAr : p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? p.name : p.nameAr}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{cat?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatBHD(p.price, lang)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block size-2 rounded-full ${p.isAvailable ? "bg-emerald-500" : "bg-amber-400"}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="size-8"
                        onClick={() => { setEditing(p); setOpen(true); }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive"
                        onClick={() => handleDelete(p._id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">{t("common.noResults")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductForm({ categories, initial, onSave, lang }: any) {
  const [data, setData] = useState(initial || {
    name: "", nameAr: "", categoryId: "", price: "",
    description: "", descriptionAr: "", isAvailable: true,
  });

  const handle = (field: string, value: any) => setData((d: any) => ({ ...d, [field]: value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(data); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="English name" value={data.name} onChange={(e) => handle("name", e.target.value)} required />
        <Input placeholder="الاسم بالعربية" value={data.nameAr} onChange={(e) => handle("nameAr", e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select value={data.categoryId} onValueChange={(v) => handle("categoryId", v)}>
          <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {categories.map((c: any) => (
              <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="number" step="0.001" placeholder="Price" value={data.price} onChange={(e) => handle("price", e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="Description (EN)" value={data.description ?? ""} onChange={(e) => handle("description", e.target.value)} />
        <Input placeholder="وصف (AR)" value={data.descriptionAr ?? ""} onChange={(e) => handle("descriptionAr", e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">{lang === "ar" ? "متاح" : "Available"}</label>
        <Switch checked={data.isAvailable} onCheckedChange={(v) => handle("isAvailable", v)} />
      </div>
      <Button type="submit" className="w-full">{initial ? "Update" : "Create"}</Button>
    </form>
  );
}