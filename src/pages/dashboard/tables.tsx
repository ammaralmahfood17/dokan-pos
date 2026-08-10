import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, QrCode } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

export default function Tables() {
  const workspace = useWorkspace();
  const tables = workspace?.tables ?? [];
  const createTable = useMutation(api.operations.createTable);
  const deleteTable = useMutation(api.operations.deleteTable);
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const branchId = workspace?.branches?.[0]?._id;

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    if (!name.trim() || !branchId) return;
    await createTable({ branchId, name: name.trim() });
    setOpen(false);
  };

  const handleDelete = async (id: Id<"tables">) => {
    if (confirm("Delete this table?")) await deleteTable({ id });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.tables")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" disabled={!branchId}>
              <Plus className="size-4" /> {t("tables.addTable")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("tables.addTable")}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input name="name" placeholder="Table name (e.g. Table 1)" required />
              <Button type="submit" className="w-full">{t("common.add")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tables.filter((t) => t.isActive).map((table) => (
          <div key={table._id} className="rounded-md border border-border p-4 transition-colors hover:bg-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{table.name}</h3>
              <Button variant="ghost" size="icon" className="size-7 text-destructive"
                onClick={() => handleDelete(table._id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            {/* QR code */}
            {workspace?.project?.slug && (
              <QRCodeComponent
                value={`${window.location.origin}/m/${workspace.project.slug}/${table.slug}`}
              />
            )}
            <p className="mt-2 text-xs text-muted-foreground break-all">
              {window.location.origin}/m/{workspace?.project?.slug}/{table.slug}
            </p>
          </div>
        ))}
        {tables.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {t("common.noResults")}
          </p>
        )}
      </div>
    </div>
  );
}

function QRCodeComponent({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      if (cancelled || !ref.current) return;
      QRCode.toCanvas(ref.current, value, {
        width: 180,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
    });
    return () => { cancelled = true; };
  }, [value]);

  return (
    <div className="flex justify-center p-2 bg-white rounded">
      <canvas ref={ref} className="size-[120px]" />
    </div>
  );
}