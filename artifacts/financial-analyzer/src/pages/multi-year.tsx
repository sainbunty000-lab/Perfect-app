import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { parseFinancialFile } from "@/lib/parser";
import {
  calculateMultiYear,
  type YearEntry,
  type MultiYearResults,
} from "@/lib/multi-year-calculations";
import { exportToPDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";
import {
  UploadCloud, TrendingUp, TrendingDown, Minus, Save,
  Download, Calculator, Loader2, X, FileText, ArrowUp,
  ArrowDown, Activity, CheckCircle, AlertOctagon, Plus,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip, ResponsiveContainer, Legend, BarChart, Bar,
} from "recharts";
import { ACCEPTED_EXTENSIONS, detectFormat, FORMAT_LABELS } from "@/lib/fileReader";

// ─── Types ────────────────────────────────────────────────────────────────────
interface YearSlot {
  label: string;
  file: File | null;
  format: string;
  loading: boolean;
  entry: YearEntry | null;
}

function makeSlot(label: string): YearSlot {
  return { label, file: null, format: "", loading: false, entry: null };
}

const YEAR_LABELS = ["Year 1 (Oldest)", "Year 2", "Year 3 (Latest)"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function MultiYearAnalysis() {
  const { toast } = useToast();
  const [slots, setSlots] = useState<YearSlot[]>([makeSlot("Year 1 (Oldest)")]);
  const [results, setResults] = useState<MultiYearResults | null>(null);
  const [calculating, setCalculating] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const updateSlot = (idx: number, patch: Partial<YearSlot>) =>
    setSlots((s) => s.map((slot, i) => (i === idx ? { ...slot, ...patch } : slot)));

  const addYear = () => {
    if (slots.length >= 3) return;
    setSlots((s) => [...s, makeSlot(YEAR_LABELS[s.length])]);
  };

  const removeYear = (idx: number) => {
    setSlots((s) => s.filter((_, i) => i !== idx));
    setResults(null);
  };

  const handleFileSelect = async (idx: number, file: File) => {
    const fmt = FORMAT_LABELS[detectFormat(file)];
    updateSlot(idx, { file, format: fmt, loading: true, entry: null });
    try {
      const data = await parseFinancialFile(file);
      const yearLabel = `FY ${2022 + idx}–${2023 + idx}`;
      updateSlot(idx, { loading: false, entry: { label: yearLabel, data } });
      toast({ title: `Year ${idx + 1} Parsed`, description: `${fmt} processed successfully.` });
    } catch {
      updateSlot(idx, { loading: false, file: null, format: "" });
      toast({ title: "Parse Failed", description: "Could not read the file.", variant: "destructive" });
    }
  };

  const handleCalculate = () => {
    const readyEntries = slots.filter((s) => s.entry).map((s) => s.entry!);
    if (readyEntries.length === 0) {
      toast({ title: "No Data", description: "Upload at least one year's document.", variant: "destructive" });
      return;
    }
    setCalculating(true);
    setTimeout(() => {
      try {
        const res = calculateMultiYear(readyEntries);
        setResults(res);
        // Persist to localStorage for Dashboard
        localStorage.setItem("de_multiyear_session", JSON.stringify({
          ts: Date.now(),
          results: res,
        }));
      } catch (e: any) {
        toast({ title: "Calculation Error", description: e.message, variant: "destructive" });
      } finally {
        setCalculating(false);
      }
    }, 100);
  };

  const handleSave = () => {
    if (!results) return;
    const existing: any[] = JSON.parse(localStorage.getItem("de_multiyear_cases") || "[]");
    const entry = {
      id: Date.now(),
      type: "multi-year",
      clientName: `Multi-Year Analysis — ${new Date().toLocaleDateString()}`,
      savedAt: new Date().toISOString(),
      years: results.yearMetrics.map((y) => ({ label: y.label, sales: y.sales, netProfit: y.netProfit, eligibility: y.eligibilityAmount })),
      trends: results.trends,
      eligibility: results.eligibility,
      overallHealth: results.overallHealth,
    };
    existing.push(entry);
    localStorage.setItem("de_multiyear_cases", JSON.stringify(existing));
    toast({ title: "Saved", description: "Multi-year case saved to storage." });
  };

  const chartData = results?.yearMetrics.map((y) => ({
    name: y.label,
    Sales: y.sales,
    "Net Profit": y.netProfit,
    Expenses: y.expenses,
    Eligibility: y.eligibilityAmount,
  })) || [];

  const TrendIcon = ({ t }: { t: string }) =>
    t === "Increasing" ? <TrendingUp className="w-4 h-4 text-success" /> :
    t === "Decreasing" ? <TrendingDown className="w-4 h-4 text-destructive" /> :
    <Minus className="w-4 h-4 text-warning" />;

  return (
    <Layout>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Multi-Year Analysis</h1>
          <p className="text-muted-foreground mt-1">Upload up to 3 years of financial statements for trend-based eligibility</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => exportToPDF("multiyear-report", "MultiYear-Report.pdf")} disabled={!results}
            className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button onClick={handleSave} disabled={!results}
            className="px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> Save Case
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8" id="multiyear-report">

        {/* ── Upload Column ─── */}
        <div className="xl:col-span-4 space-y-5">
          <div className="glass-card p-6 rounded-2xl border border-border/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-primary" /> Year-wise Upload
              </h3>
              {slots.length < 3 && (
                <button onClick={addYear} className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20">
                  <Plus className="w-3.5 h-3.5" /> Add Year
                </button>
              )}
            </div>

            <div className="space-y-4">
              {slots.map((slot, idx) => (
                <div key={idx} className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-foreground/80">{slot.label}</span>
                    {slots.length > 1 && (
                      <button onClick={() => removeYear(idx)} className="p-1 text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {slot.entry ? (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-success shrink-0" />
                      <span className="truncate text-foreground/80">{slot.file?.name}</span>
                      <button onClick={() => { updateSlot(idx, { file: null, format: "", entry: null }); setResults(null); }}
                        className="ml-auto text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : slot.loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Parsing…
                    </div>
                  ) : (
                    <>
                      <input
                        ref={(el) => { inputRefs.current[idx] = el; }}
                        type="file" accept={ACCEPTED_EXTENSIONS} className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(idx, f); e.target.value = ""; }}
                      />
                      <button onClick={() => inputRefs.current[idx]?.click()}
                        className="w-full border-2 border-dashed border-border/50 rounded-lg py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-2">
                        <UploadCloud className="w-4 h-4" /> Click to upload BS + P&L
                      </button>
                      <p className="text-[10px] text-muted-foreground mt-1.5 text-center">PDF · Excel · Image (OCR) · TXT</p>
                    </>
                  )}

                  {slot.entry && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <InfoPill label="Sales" value={`₹${(slot.entry.data.sales || 0).toLocaleString("en-IN")}`} />
                      <InfoPill label="Net Profit" value={`₹${(slot.entry.data.netProfit || 0).toLocaleString("en-IN")}`} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleCalculate} disabled={calculating || !slots.some((s) => s.entry)}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {calculating ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing…</> : <><Calculator className="w-5 h-5" /> Analyze Trends</>}
          </button>

          {/* Info Panel */}
          <div className="glass-card p-4 rounded-2xl border border-border/50 space-y-2 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground/70 text-[11px] uppercase tracking-wide">How it works</p>
            <p>Upload Balance Sheet + P&L for each year. The engine extracts sales, profit, expenses, and assets automatically.</p>
            <p>Eligibility is weighted — the most recent year carries 2× weight. Growth adjustments (±15%) are applied based on trend.</p>
          </div>
        </div>

        {/* ── Results Column ─── */}
        <div className="xl:col-span-8 space-y-6">
          {!results ? (
            <div className="h-full min-h-[400px] glass-card rounded-2xl border border-border/50 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Activity className="w-12 h-12 opacity-20" />
              <p className="text-sm text-center">Upload at least one year's document and click Analyze Trends.</p>
            </div>
          ) : (
            <>
              {/* Overall health + eligibility */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <HealthCard health={results.overallHealth} />
                <MetricCard label="Weighted Eligibility" value={`₹${results.eligibility.weightedEligibility.toLocaleString("en-IN")}`} sub="Equal weight per year" color="text-secondary" />
                <MetricCard label="Growth-Adjusted Eligibility" value={`₹${results.eligibility.growthAdjustedEligibility.toLocaleString("en-IN")}`} sub={`Factor: ${results.eligibility.growthFactor}×`} color="text-primary" />
              </div>

              {/* Reasoning */}
              <div className="glass-card p-4 rounded-2xl border border-primary/20 bg-primary/5 text-sm text-foreground/80">
                <span className="font-semibold text-primary text-xs uppercase tracking-wide mr-2">Eligibility Reasoning</span>
                {results.eligibility.reasoning}
              </div>

              {/* Trends summary */}
              <div className="glass-card p-6 rounded-2xl border border-border/50">
                <h3 className="text-base font-display font-semibold mb-4">Trend Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <TrendBadge label="Sales Trend" trend={results.trends.salesTrend} growth={results.trends.avgSalesGrowth} />
                  <TrendBadge label="Profit Trend" trend={results.trends.profitTrend} growth={results.trends.avgProfitGrowth} />
                  <div className="bg-background/50 rounded-xl p-3 border border-border/50">
                    <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Stability Score</p>
                    <p className="text-2xl font-display font-bold text-foreground">{results.trends.stabilityScore}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
                  </div>
                  <div className="bg-background/50 rounded-xl p-3 border border-border/50">
                    <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Avg Expense Growth</p>
                    <p className={`text-2xl font-display font-bold ${results.trends.avgExpenseGrowth > results.trends.avgSalesGrowth ? "text-destructive" : "text-success"}`}>
                      {results.trends.avgExpenseGrowth}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Charts */}
              {chartData.length >= 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="glass-card p-6 rounded-2xl border border-border/50">
                    <h4 className="text-sm font-display font-semibold mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-secondary" /> Sales & Profit Trend
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                          <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
                          <RechartsTip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="Sales" stroke="hsl(var(--secondary))" strokeWidth={2} dot={{ r: 4 }} />
                          <Line type="monotone" dataKey="Net Profit" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-2xl border border-border/50">
                    <h4 className="text-sm font-display font-semibold mb-4 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-accent" /> Eligibility by Year
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                          <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
                          <RechartsTip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                          <Bar dataKey="Eligibility" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* Year-by-year table */}
              <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
                <div className="p-5 border-b border-border/50">
                  <h3 className="font-display font-semibold">Year-by-Year Metrics</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-5 py-3 text-left">Year</th>
                        <th className="px-5 py-3 text-right">Sales</th>
                        <th className="px-5 py-3 text-right">Net Profit</th>
                        <th className="px-5 py-3 text-right">Expenses</th>
                        <th className="px-5 py-3 text-right">Current Ratio</th>
                        <th className="px-5 py-3 text-right">Eligibility</th>
                        <th className="px-5 py-3 text-right">YoY Sales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {results.yearMetrics.map((y, i) => {
                        const growth = results.trends.salesGrowthRates[i - 1];
                        return (
                          <tr key={y.label} className="hover:bg-white/5">
                            <td className="px-5 py-3 font-medium">{y.label}</td>
                            <td className="px-5 py-3 text-right">₹{y.sales.toLocaleString("en-IN")}</td>
                            <td className={`px-5 py-3 text-right font-semibold ${y.netProfit >= 0 ? "text-success" : "text-destructive"}`}>₹{y.netProfit.toLocaleString("en-IN")}</td>
                            <td className="px-5 py-3 text-right text-muted-foreground">₹{y.expenses.toLocaleString("en-IN")}</td>
                            <td className="px-5 py-3 text-right">{y.currentRatio.toFixed(2)}x</td>
                            <td className="px-5 py-3 text-right font-semibold text-secondary">₹{y.eligibilityAmount.toLocaleString("en-IN")}</td>
                            <td className="px-5 py-3 text-right">
                              {growth !== undefined ? (
                                <span className={`flex items-center justify-end gap-1 font-medium ${growth >= 0 ? "text-success" : "text-destructive"}`}>
                                  {growth >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                                  {Math.abs(growth)}%
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Flags & Strengths */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {results.flags.length > 0 && (
                  <div className="glass-card p-5 rounded-2xl border border-warning/20 bg-warning/5">
                    <h4 className="text-sm font-semibold text-warning flex items-center gap-2 mb-3"><AlertOctagon className="w-4 h-4" /> Red Flags</h4>
                    {results.flags.map((f, i) => <p key={i} className="text-xs text-foreground/80 mb-1">• {f}</p>)}
                  </div>
                )}
                {results.strengths.length > 0 && (
                  <div className="glass-card p-5 rounded-2xl border border-success/20 bg-success/5">
                    <h4 className="text-sm font-semibold text-success flex items-center gap-2 mb-3"><CheckCircle className="w-4 h-4" /> Strengths</h4>
                    {results.strengths.map((s, i) => <p key={i} className="text-xs text-foreground/80 mb-1">• {s}</p>)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ── Small components ───────────────────────────────────────────────────────────

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase text-muted-foreground font-medium">{label}</p>
      <p className="text-xs font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

function HealthCard({ health }: { health: string }) {
  const colors: Record<string, string> = {
    Excellent: "text-success border-success/30 bg-success/5",
    Good:      "text-secondary border-secondary/30 bg-secondary/5",
    Moderate:  "text-warning border-warning/30 bg-warning/5",
    Weak:      "text-destructive border-destructive/30 bg-destructive/5",
  };
  return (
    <div className={`glass-card rounded-2xl border p-5 flex flex-col items-center justify-center text-center ${colors[health] || ""}`}>
      <p className="text-[10px] uppercase font-semibold tracking-wide opacity-70 mb-1">Overall Health</p>
      <p className="text-3xl font-display font-black">{health}</p>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="glass-card rounded-2xl border border-border/50 p-5">
      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function TrendBadge({ label, trend, growth }: { label: string; trend: string; growth: number }) {
  const icon = trend === "Increasing" ? <TrendingUp className="w-4 h-4" /> : trend === "Decreasing" ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />;
  const color = trend === "Increasing" ? "text-success bg-success/10 border-success/20" : trend === "Decreasing" ? "text-destructive bg-destructive/10 border-destructive/20" : "text-warning bg-warning/10 border-warning/20";
  return (
    <div className="bg-background/50 rounded-xl p-3 border border-border/50">
      <p className="text-[10px] uppercase text-muted-foreground font-medium mb-2">{label}</p>
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-semibold ${color}`}>
        {icon} {trend}
      </div>
      <p className="text-xs text-muted-foreground mt-1">Avg: {growth}%/yr</p>
    </div>
  );
}
