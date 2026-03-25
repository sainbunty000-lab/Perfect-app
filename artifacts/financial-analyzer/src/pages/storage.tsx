import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useListCases, useDeleteCase } from "@workspace/api-client-react";
import { Trash2, ExternalLink, RefreshCw, FileText, BarChart2, Landmark, CalendarRange, Receipt, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

// ─── Multi-Year local storage structure ──────────────────────────────────────
interface LocalMultiYearCase {
  id: number;
  clientName: string;
  savedAt: string;
  overallHealth: string;
  eligibility: { growthAdjustedEligibility: number };
}

// ─── Type badge configs ───────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  working_capital: { label: "Working Capital", cls: "bg-[#4A9EFF]/10 text-[#4A9EFF] border-[#4A9EFF]/20", icon: <BarChart2 className="w-3 h-3" /> },
  banking:         { label: "Banking",          cls: "bg-[#F5C842]/10 text-[#F5C842] border-[#F5C842]/20", icon: <Landmark className="w-3 h-3" /> },
  combined:        { label: "Combined",          cls: "bg-primary/10 text-primary border-primary/20",         icon: <FileText className="w-3 h-3" /> },
  "multi-year":    { label: "Multi-Year",        cls: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20", icon: <CalendarRange className="w-3 h-3" /> },
  gst_itr:         { label: "GST & ITR",         cls: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20", icon: <Receipt className="w-3 h-3" /> },
};

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] || { label: type.replace("_", " "), cls: "bg-muted/30 text-muted-foreground border-border", icon: <FileText className="w-3 h-3" /> };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Storage() {
  const { data: dbCases = [], isLoading, refetch } = useListCases();
  const deleteCase = useDeleteCase();
  const { toast } = useToast();
  const [localCases, setLocalCases] = useState<LocalMultiYearCase[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("de_multiyear_cases");
      if (raw) setLocalCases(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const handleDeleteDb = (id: number) => {
    if (!confirm("Delete this case permanently?")) return;
    deleteCase.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Deleted", description: "Case removed from storage." });
        refetch();
      },
    });
  };

  const handleDeleteLocal = (id: number) => {
    if (!confirm("Delete this multi-year case?")) return;
    const updated = localCases.filter((c) => c.id !== id);
    setLocalCases(updated);
    localStorage.setItem("de_multiyear_cases", JSON.stringify(updated));
    toast({ title: "Deleted", description: "Multi-year case removed." });
  };

  const allTypes = ["all", "working_capital", "banking", "combined", "multi-year"];

  const filteredDb = dbCases.filter((c) => filter === "all" || c.caseType === filter);
  const filteredLocal = localCases.filter(() => filter === "all" || filter === "multi-year");

  const totalCount = filteredDb.length + (filter === "all" || filter === "multi-year" ? filteredLocal.length : 0);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Case Storage</h1>
          <p className="text-muted-foreground mt-1">Manage all saved financial analyses — {totalCount} case{totalCount !== 1 ? "s" : ""} stored</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {allTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                filter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {t === "all" ? "All Modules" : (TYPE_CONFIG[t]?.label || t)}
            </button>
          ))}
          <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/30 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Client / Case Name</th>
                  <th className="px-6 py-4">Module</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Key Metric</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">

                {/* DB cases */}
                {filteredDb.map((c) => (
                  <tr key={`db-${c.id}`} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-mono text-muted-foreground text-xs">#{c.id}</td>
                    <td className="px-6 py-4 font-medium">{c.clientName}</td>
                    <td className="px-6 py-4"><TypeBadge type={c.caseType} /></td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium">
                      {c.caseType === "working_capital" && c.workingCapitalResults?.eligibilityAmount
                        ? <span className="text-secondary">Elig: ₹{c.workingCapitalResults.eligibilityAmount.toLocaleString()}</span>
                        : c.bankingResults?.overallScore
                        ? <span>Score: {c.bankingResults.overallScore}/100</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={
                          c.caseType === "working_capital" ? "/working-capital" :
                          c.caseType === "banking" ? "/banking-analysis" : "/storage"
                        }>
                          <button className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Open module">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </Link>
                        <button
                          onClick={() => handleDeleteDb(c.id)}
                          className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Local multi-year cases */}
                {(filter === "all" || filter === "multi-year") && filteredLocal.map((c) => (
                  <tr key={`local-${c.id}`} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-mono text-muted-foreground text-xs">MY-{c.id.toString().slice(-5)}</td>
                    <td className="px-6 py-4 font-medium">{c.clientName}</td>
                    <td className="px-6 py-4"><TypeBadge type="multi-year" /></td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(c.savedAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium">
                      <span className="text-[#10B981]">Elig: ₹{c.eligibility.growthAdjustedEligibility.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{c.overallHealth}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href="/multi-year">
                          <button className="p-2 rounded-lg bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 transition-colors" title="Open Multi-Year">
                            <Eye className="w-4 h-4" />
                          </button>
                        </Link>
                        <button
                          onClick={() => handleDeleteLocal(c.id)}
                          className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Empty state */}
                {totalCount === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="font-medium mb-1">No saved cases found</p>
                      <p className="text-xs">Complete an analysis and click Save to store it here.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {(dbCases.length > 0 || localCases.length > 0) && (
        <div className="mt-4 flex gap-4 flex-wrap text-xs text-muted-foreground">
          <span>Total: {dbCases.length + localCases.length} cases</span>
          {Object.entries(
            dbCases.reduce((acc, c) => { acc[c.caseType] = (acc[c.caseType] || 0) + 1; return acc; }, {} as Record<string, number>)
          ).map(([t, n]) => (
            <span key={t}>{TYPE_CONFIG[t]?.label || t}: {n}</span>
          ))}
          {localCases.length > 0 && <span>Multi-Year: {localCases.length}</span>}
        </div>
      )}
    </Layout>
  );
}
