import { useEffect, useState } from "react";
import { useListCases } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { generateSummaryParagraph } from "@/lib/multi-year-calculations";
import {
  ArrowUpRight, TrendingUp, AlertTriangle, CheckCircle, Activity,
  FileText, BarChart2, Landmark, CalendarRange, Receipt,
  Sparkles, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Link } from "wouter";

// ─── Session data types (stored to localStorage per module) ──────────────────
interface WCSession { eligibilityAmount: number; currentRatio: number; workingCapitalCycle: number; riskLevel?: string; }
interface BankingSession { overallScore: number; riskLevel: string; creditRiskAssessment: string; }
interface MultiYearSession {
  trends: { salesTrend: string; avgSalesGrowth: number };
  eligibility: { growthAdjustedEligibility: number };
  overallHealth: string;
}

function readSession<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: cases = [], isLoading } = useListCases();

  const [wcSession,   setWcSession]   = useState<WCSession | null>(null);
  const [bankSession, setBankSession] = useState<BankingSession | null>(null);
  const [mySession,   setMySession]   = useState<MultiYearSession | null>(null);

  useEffect(() => {
    const wc = readSession<{ results: WCSession }>("de_wc_session");
    const bk = readSession<{ results: BankingSession }>("de_banking_session");
    const my = readSession<{ results: MultiYearSession }>("de_multiyear_session");
    if (wc?.results) setWcSession(wc.results);
    if (bk?.results) setBankSession(bk.results);
    if (my?.results) setMySession(my.results);
  }, []);

  const hasSession = wcSession || bankSession || mySession;

  // Summary paragraph
  const summary = generateSummaryParagraph({
    wcEligibility:        wcSession?.eligibilityAmount,
    wcCurrentRatio:       wcSession?.currentRatio,
    wcCycle:              wcSession?.workingCapitalCycle,
    bankingScore:         bankSession?.overallScore,
    bankingRisk:          bankSession?.riskLevel,
    bankingGrade:         bankSession?.creditRiskAssessment,
    multiYearGrowth:      mySession?.trends.avgSalesGrowth,
    multiYearTrend:       mySession?.trends.salesTrend,
    multiYearEligibility: mySession?.eligibility.growthAdjustedEligibility,
    multiYearHealth:      mySession?.overallHealth,
  });

  // DB stats
  const totalCases = cases.length;
  const eligibleCases = cases.filter((c) => (c.workingCapitalResults?.eligibilityAmount || 0) > 0).length;
  const totalEligibility = cases.reduce((sum, c) => sum + (c.workingCapitalResults?.eligibilityAmount || 0), 0);
  const recentCases = [...cases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const riskData = [
    { name: "Low Risk",    value: cases.filter((c) => c.bankingResults?.riskLevel === "Low").length  || 0, color: "hsl(var(--success))" },
    { name: "Medium Risk", value: cases.filter((c) => c.bankingResults?.riskLevel === "Medium").length || 0, color: "hsl(var(--warning))" },
    { name: "High Risk",   value: cases.filter((c) => c.bankingResults?.riskLevel === "High").length  || 0, color: "hsl(var(--destructive))" },
  ];

  const monthlyTrend = [
    { name: "Jan", amount: 1200000 }, { name: "Feb", amount: 1900000 },
    { name: "Mar", amount: 1500000 }, { name: "Apr", amount: 2200000 },
    { name: "May", amount: 2800000 }, { name: "Jun", amount: totalEligibility || 3100000 },
  ];

  // Combined eligibility (session only)
  const combinedEligibility = (() => {
    const vals = [wcSession?.eligibilityAmount, mySession?.eligibility.growthAdjustedEligibility].filter((v): v is number => v !== undefined);
    if (!vals.length) return null;
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return bankSession?.riskLevel === "High" ? Math.round(avg * 0.85) : avg;
  })();

  const MODULE_SHORTCUTS = [
    { path: "/working-capital", label: "Working Capital",  icon: BarChart2,     color: "text-[#4A9EFF]", bg: "bg-[#4A9EFF]/10 border-[#4A9EFF]/20" },
    { path: "/banking-analysis",label: "Banking Analysis", icon: Landmark,      color: "text-[#F5C842]", bg: "bg-[#F5C842]/10 border-[#F5C842]/20" },
    { path: "/gst-itr",         label: "GST & ITR",        icon: Receipt,       color: "text-[#A855F7]", bg: "bg-[#A855F7]/10 border-[#A855F7]/20" },
    { path: "/multi-year",      label: "Multi-Year",       icon: CalendarRange, color: "text-[#10B981]", bg: "bg-[#10B981]/10 border-[#10B981]/20" },
  ];

  return (
    <Layout>
      <div className="space-y-8">

        {/* Brand Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Dhanush Enterprises — Financial Intelligence Platform</p>
            <h1 className="text-3xl font-display font-bold">Combined Dashboard</h1>
            <p className="text-muted-foreground mt-1">Real-time view of all analysis modules</p>
          </div>
          {hasSession && combinedEligibility !== null && (
            <div className="text-right glass-card px-6 py-4 rounded-2xl border border-secondary/30">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-1">Combined Eligibility</p>
              <p className="text-3xl font-display font-bold text-secondary">₹{combinedEligibility.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{bankSession?.riskLevel === "High" ? "Risk-adjusted estimate" : "Indicative estimate"}</p>
            </div>
          )}
        </div>

        {/* ── Summary Paragraph ─────────────────────────────────── */}
        <div className="glass-card p-6 rounded-2xl border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-display font-semibold text-lg">Financial Health Summary</h3>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">{summary}</p>
        </div>

        {/* ── Module Shortcuts ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULE_SHORTCUTS.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.path} href={m.path}>
                <div className={`glass-card p-4 rounded-2xl border cursor-pointer hover:-translate-y-1 transition-all ${m.bg} flex items-center gap-3`}>
                  <Icon className={`w-6 h-6 ${m.color} shrink-0`} />
                  <span className="text-sm font-semibold text-foreground">{m.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* ── Individual Module Results (session) ─────────────────── */}
        {hasSession && (
          <div>
            <h3 className="text-lg font-display font-semibold mb-4">Current Session Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

              {wcSession && (
                <ModuleCard
                  title="Working Capital"
                  icon={<BarChart2 className="w-5 h-5 text-[#4A9EFF]" />}
                  accent="border-[#4A9EFF]/30"
                  rows={[
                    { label: "Eligibility",    value: `₹${wcSession.eligibilityAmount.toLocaleString("en-IN")}`, highlight: true },
                    { label: "Current Ratio",  value: `${wcSession.currentRatio.toFixed(2)}x` },
                    { label: "WC Cycle",       value: `${wcSession.workingCapitalCycle} days` },
                  ]}
                  link="/working-capital"
                />
              )}

              {bankSession && (
                <ModuleCard
                  title="Banking Analysis"
                  icon={<Landmark className="w-5 h-5 text-[#F5C842]" />}
                  accent="border-[#F5C842]/30"
                  rows={[
                    { label: "Overall Score",  value: `${bankSession.overallScore}/100`, highlight: true },
                    { label: "Credit Grade",   value: bankSession.creditRiskAssessment },
                    { label: "Risk Level",     value: bankSession.riskLevel },
                  ]}
                  link="/banking-analysis"
                />
              )}

              {mySession && (
                <ModuleCard
                  title="Multi-Year Analysis"
                  icon={<CalendarRange className="w-5 h-5 text-[#10B981]" />}
                  accent="border-[#10B981]/30"
                  rows={[
                    { label: "Adj. Eligibility", value: `₹${mySession.eligibility.growthAdjustedEligibility.toLocaleString("en-IN")}`, highlight: true },
                    { label: "Sales Trend",      value: mySession.trends.salesTrend },
                    { label: "Avg Growth",       value: `${mySession.trends.avgSalesGrowth}%/yr` },
                  ]}
                  link="/multi-year"
                />
              )}
            </div>
          </div>
        )}

        {/* ── KPI Cards (DB-backed) ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard title="Total Saved Cases" value={isLoading ? "…" : String(totalCases)} icon={<FileText className="w-5 h-5 text-primary" />} trend="+12% from last month" trendUp />
          <KPICard title="WC Eligible Cases" value={isLoading ? "…" : String(eligibleCases)} icon={<CheckCircle className="w-5 h-5 text-success" />} trend="+5% from last month" trendUp />
          <KPICard title="Total Eligibility" value={isLoading ? "…" : `₹${(totalEligibility / 100000).toFixed(1)}L`} icon={<TrendingUp className="w-5 h-5 text-secondary" />} trend="+18% from last month" trendUp />
          <KPICard title="High Risk Cases" value={isLoading ? "…" : String(cases.filter((c) => c.bankingResults?.riskLevel === "High").length)} icon={<AlertTriangle className="w-5 h-5 text-destructive" />} trend="-2 this month" trendUp={false} />
        </div>

        {/* ── Charts ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-border/50">
            <h3 className="text-base font-display font-semibold mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Eligibility Trend (6 Months)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                  <RechartsTip cursor={{ fill: "hsl(var(--muted)/0.4)" }} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-border/50 flex flex-col">
            <h3 className="text-base font-display font-semibold mb-1">Risk Distribution</h3>
            <p className="text-xs text-muted-foreground mb-4">Across all saved cases</p>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value" stroke="none">
                    {riskData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <RechartsTip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-xs font-medium mt-2">
              {riskData.map((r) => (
                <div key={r.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent Saved Cases ────────────────────────────────── */}
        <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-base font-display font-semibold">Recent Saved Analyses</h3>
            <Link href="/storage" className="text-sm text-primary hover:text-primary/80 font-medium">View All Cases</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/30 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Client Name</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Eligibility</th>
                  <th className="px-6 py-4">Risk Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                      No saved cases yet. Complete an analysis and click Save to store it here.
                    </td>
                  </tr>
                ) : (
                  recentCases.map((c) => (
                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium">{c.clientName}</td>
                      <td className="px-6 py-4">
                        <TypeBadge type={c.caseType} />
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-semibold text-secondary">
                        {c.workingCapitalResults?.eligibilityAmount ? `₹${c.workingCapitalResults.eligibilityAmount.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <RiskBadge risk={c.bankingResults?.riskLevel} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  );
}

// ── Small UI components ──────────────────────────────────────────────────────

function ModuleCard({ title, icon, accent, rows, link }: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  rows: { label: string; value: string; highlight?: boolean }[];
  link: string;
}) {
  return (
    <div className={`glass-card rounded-2xl border ${accent} p-5 hover:-translate-y-0.5 transition-all`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-display font-semibold text-sm">{title}</span>
        </div>
        <Link href={link}>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer" />
        </Link>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className={`text-sm font-semibold ${r.highlight ? "text-secondary" : "text-foreground"}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, trend, trendUp }: { title: string; value: string; icon: React.ReactNode; trend: string; trendUp: boolean }) {
  return (
    <div className="glass-card p-6 rounded-2xl border border-border/50 hover:border-primary/30 hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">{icon}</div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trendUp ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <h4 className="text-muted-foreground text-sm font-medium mb-1">{title}</h4>
      <div className="text-3xl font-display font-bold">{value}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const MAP: Record<string, { label: string; cls: string }> = {
    working_capital: { label: "Working Capital", cls: "bg-[#4A9EFF]/10 text-[#4A9EFF] border-[#4A9EFF]/20" },
    banking:         { label: "Banking",          cls: "bg-[#F5C842]/10 text-[#F5C842] border-[#F5C842]/20" },
    combined:        { label: "Combined",          cls: "bg-primary/10 text-primary border-primary/20" },
    "multi-year":    { label: "Multi-Year",        cls: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20" },
  };
  const m = MAP[type] || { label: type.replace("_", " "), cls: "bg-muted/30 text-muted-foreground border-border" };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${m.cls}`}>{m.label}</span>;
}

function RiskBadge({ risk }: { risk?: string }) {
  if (!risk) return <span className="text-muted-foreground text-sm">—</span>;
  const cls = risk === "Low" ? "bg-success/10 text-success border-success/20" : risk === "High" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20";
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{risk}</span>;
}
