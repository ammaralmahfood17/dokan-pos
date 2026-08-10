import { useState } from "react";
import { useMutation, useQuery } from "@/lib/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Wordmark } from "./Landing";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Onboarding() {
  const workspace = useQuery(api.projects.myWorkspace);
  const navigate = useNavigate();
  const createProject = useMutation(api.projects.createProject);
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [business, setBusiness] = useState({ name: "", nameAr: "" });
  const [branch, setBranch] = useState({ name: "", nameAr: "" });
  const [tableNames, setTableNames] = useState(["Table 1", "Table 2", "Table 3", "Table 4"]);
  const [seedDemo, setSeedDemo] = useState(true);

  useEffect(() => {
    if (workspace) {
      navigate("/dashboard", { replace: true });
    }
  }, [workspace, navigate]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createProject({
        name: business.name || "My Restaurant",
        nameAr: business.nameAr || undefined,
        branchName: branch.name || "Main Branch",
        branchNameAr: branch.nameAr || undefined,
        tableNames: tableNames.filter((n) => n.trim()),
        seedDemoData: seedDemo,
      });
      toast("Workspace created! Redirecting...");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  const updateTable = (i: number, value: string) => {
    setTableNames((prev) => prev.map((t, j) => (j === i ? value : t)));
  };

  const addTable = () => setTableNames((prev) => [...prev, `Table ${prev.length + 1}`]);
  const removeTable = (i: number) => setTableNames((prev) => prev.filter((_, j) => j !== i));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center border-b border-border/60 px-6">
        <Wordmark />
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.welcome")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("onboarding.welcomeDesc")}</p>
          </div>

          <div className="space-y-8">
            {/* Step 1: Business info */}
            <div>
              <p className="mb-3 text-xs font-mono text-muted-foreground">{t("onboarding.businessInfo")}</p>
              <div className="space-y-3 rounded-md border border-border p-4">
                <Input
                  placeholder="Restaurant name"
                  value={business.name}
                  onChange={(e) => setBusiness((p) => ({ ...p, name: e.target.value }))}
                />
                <Input
                  placeholder="اسم المطعم"
                  value={business.nameAr}
                  onChange={(e) => setBusiness((p) => ({ ...p, nameAr: e.target.value }))}
                />
              </div>
            </div>

            {/* Step 2: Branch */}
            <div>
              <p className="mb-3 text-xs font-mono text-muted-foreground">{t("onboarding.branchInfo")}</p>
              <div className="space-y-3 rounded-md border border-border p-4">
                <Input
                  placeholder="Branch name"
                  value={branch.name}
                  onChange={(e) => setBranch((p) => ({ ...p, name: e.target.value }))}
                />
                <Input
                  placeholder="اسم الفرع"
                  value={branch.nameAr}
                  onChange={(e) => setBranch((p) => ({ ...p, nameAr: e.target.value }))}
                />
              </div>
            </div>

            {/* Step 3: Tables */}
            <div>
              <p className="mb-3 text-xs font-mono text-muted-foreground">{t("onboarding.tables")}</p>
              <div className="rounded-md border border-border p-4 space-y-2">
                {tableNames.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={t}
                      onChange={(e) => updateTable(i, e.target.value)}
                      className="h-8 text-sm"
                      placeholder={`Table ${i + 1}`}
                    />
                    {tableNames.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTable(i)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-sm text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTable}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" /> {t("onboarding.addTable")}
                </button>
              </div>
            </div>

            {/* Seed demo */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={seedDemo} onCheckedChange={(v) => setSeedDemo(!!v)} />
              <span className="text-sm text-muted-foreground">{t("onboarding.seedDemo")}</span>
            </label>

            {/* Submit */}
            <Button
              className="w-full min-h-11"
              size="lg"
              disabled={loading}
              onClick={handleCreate}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  {t("onboarding.letsGo")}
                  <ArrowRight className="ms-2 size-4 rtl:hidden" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}