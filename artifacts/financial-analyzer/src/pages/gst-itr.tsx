import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { parseGstItrFile, analyzeGstItr } from "@/lib/gst-itr-parser";
import type { GstItrResults, GstrData, ItrData } from "@/lib/gst-itr-parser";
import { ACCEPTED_EXTENSIONS, detectFormat, FORMAT_LABELS } from "@/lib/fileReader";
import {
  UploadCloud, Loader2, CheckCircle, AlertTriangle, X,
  FileText, FileImage, FileSpreadsheet, Info, Zap,
  ShieldCheck, AlertOctagon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PendingSlot = { file: File; format: string };
type DocSlot = {
  file: File;
  format: string;
  docType: string;
  status: "ok" | "unknown";
};

const formatIcon = (fmt: string) => {
  if (fmt === "pdf") return <FileText className="w-4 h-4 text-red-400" />;
  if (fmt === "excel") return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
  if (fmt === "image") return <FileImage className="w-4 h-4 text-blue-400" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
};

const INR = (n?: number) =>
  n !== undefined ? "₹" + n.toLocaleString("en-IN") : "—";
const PCT = (n?: number) =>
  n !== undefined ? n.toFixed(1) + "%" : "—";

export default function GstItrPage() {
  const { toast } = useToast();

  // Files selected but NOT yet parsed
  const [pendingSlots, setPendingSlots] = useState<PendingSlot[]>([]);

  // Files after parsing
  const [slots, setSlots] = useState<DocSlot[]>([]);
  const [gstrData, setGstrData] = useState<GstrData | undefined>();
  const [itrData, setItrData] = useState<ItrData | undefined>();
  const [results, setResults] = useState<GstItrResults | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPending = pendingSlots.length > 0;
  const hasExtracted = slots.length > 0;

  // Step 1: Just add files to pending list — no parsing
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newPending: PendingSlot[] = files.map((f) => ({
      file: f,
      format: detectFormat(f),
    }));
    setPendingSlots((prev) => [...prev, ...newPending]);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Step 2: Extract button — parse all pending files
  const handleExtract = async () => {
    if (!pendingSlots.length) return;
    setExtracting(true);
    try {
      let newGstr = gstrData;
      let newItr = itrData;
      const newSlots: DocSlot[] = [...slots];

      for (const pending of pendingSlots) {
        const parsed = await parseGstItrFile(pending.file);
        const fmt = FORMAT_LABELS[pending.format as import("@/lib/fileReader").SupportedFormat] ?? pending.format;

        if (parsed.gstr) newGstr = { ...newGstr, ...parsed.gstr };
        if (parsed.itr)  newItr  = { ...newItr,  ...parsed.itr };

        const label =
          parsed.type === "BOTH" ? "GSTR + ITR" :
          parsed.type === "GSTR" ? "GST Return" :
          parsed.type === "ITR"  ? "ITR" : "Unknown";

        newSlots.push({
          file: pending.file,
          format: fmt,
          docType: label,
          status: parsed.type === "UNKNOWN" ? "unknown" : "ok",
        });
      }

      setGstrData(newGstr);
      setItrData(newItr);
      setSlots(newSlots);
      setPendingSlots([]);
      setResults(null);
      toast({ title: "Data Extracted", description: `${newSlots.length - slots.length} file(s) parsed. Click "Analyze Documents" to generate report.` });
    } catch {
      toast({ title: "Extraction Failed", description: "Could not read one or more documents.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const removePending = (idx: number) => setPendingSlots((s) => s.filter((_, i) => i !== idx));
  const removeSlot = (idx: number) => { setSlots((s) => s.filter((_, i) => i !== idx)); setResults(null); };

  const handleAnalyze = () => {
    if (!gstrData && !itrData) {
      toast({ title: "No Data", description: "Extract at least one GST or ITR document first.", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setTimeout(() => {
      const res = analyzeGstItr(gstrData, itrData);
      setResults(res);
      setAnalyzing(false);
    }, 600);
  };

  const gradeColor = (g?: string) =>
    g === "A" ? "text-success" : g === "B" ? "text-primary" : g === "C" ? "text-warning" : "text-destructive";

  return (
    <Layout>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">GST & ITR Analysis</h1>
          <p className="text-muted-foreground mt-1">Upload GSTR-1, GSTR-3B, or ITR documents for compliance analysis</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={analyzing || !hasExtracted}
          className="px-6 py-2.5 rounded-xl bg-[#A855F7] text-white hover:bg-[#9333EA] font-medium text-sm flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {analyzing ? "Analyzing…" : "Analyze Documents"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">

        {/* ── LEFT: Upload ── */}
        <div className="xl:col-span-4 space-y-5">

          {/* Upload Zone */}
          <div className="glass-card p-5 rounded-2xl border border-border/50">
            <h3 className="font-display font-semibold text-sm mb-1">Document Upload</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add one or more files — GSTR-1, GSTR-3B, and/or ITR. Then click Extract Data.
            </p>

            <div className="relative group cursor-pointer border-2 border-dashed border-border hover:border-[#A855F7]/50 rounded-xl p-6 text-center transition-colors bg-background/40">
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2">
                <UploadCloud className="w-7 h-7 text-[#A855F7] group-hover:scale-110 transition-transform" />
                <p className="text-sm font-medium">Click or drag & drop</p>
                <div className="flex flex-wrap justify-center gap-1 mt-1">
                  {["PDF", "Excel", "JPEG/PNG", "TXT"].map((f) => (
                    <span key={f} className="text-[10px] bg-white/5 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Pending files (selected but not yet parsed) */}
          {pendingSlots.length > 0 && (
            <div className="glass-card p-4 rounded-2xl border border-accent/30 space-y-2">
              <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">Selected — Not Yet Extracted</h4>
              {pendingSlots.map((p, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-accent/20 bg-accent/5">
                  {formatIcon(p.format)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">Ready to extract</p>
                  </div>
                  <Zap className="w-4 h-4 text-accent shrink-0" />
                  <button onClick={() => removePending(idx)} className="p-1 hover:bg-white/10 rounded text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Extract Button */}
          {hasPending && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-display font-semibold text-base hover:bg-accent/90 transition-all hover:shadow-lg hover:shadow-accent/30 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {extracting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Extracting Data…</>
              ) : (
                <><Zap className="w-5 h-5" /> Extract Data from Documents</>
              )}
            </button>
          )}

          {/* Extracted files list */}
          {slots.length > 0 && (
            <div className="glass-card p-4 rounded-2xl border border-border/50 space-y-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Extracted Documents</h4>
              {slots.map((slot, idx) => (
                <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${slot.status === "unknown" ? "border-warning/30 bg-warning/5" : "border-success/20 bg-success/5"}`}>
                  {formatIcon(detectFormat(slot.file))}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{slot.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{slot.format} · {slot.docType}</p>
                  </div>
                  {slot.status === "unknown"
                    ? <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                    : <CheckCircle className="w-4 h-4 text-success shrink-0" />}
                  <button onClick={() => removeSlot(idx)} className="p-1 hover:bg-white/10 rounded text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Supported document guide */}
          <div className="glass-card p-4 rounded-2xl border border-border/50">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Supported Documents</h4>
            <div className="space-y-2">
              {[
                { label: "GSTR-3B", desc: "Monthly tax summary return" },
                { label: "GSTR-1", desc: "Outward supplies return" },
                { label: "GSTR-9", desc: "Annual GST return" },
                { label: "ITR-1 / ITR-2", desc: "Individual income tax return" },
                { label: "ITR-3 / ITR-4", desc: "Business income return" },
                { label: "Computation Sheet", desc: "Tax computation of income" },
              ].map((d) => (
                <div key={d.label} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#A855F7] mt-1.5 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-foreground/80">{d.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{d.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="xl:col-span-8 space-y-6">
          {!results ? (
            <div className="h-full min-h-[500px] glass-card rounded-2xl border border-border/50 flex flex-col items-center justify-center text-muted-foreground gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#A855F7]/10 flex items-center justify-center">
                <Info className="w-8 h-8 text-[#A855F7] opacity-60" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground/70">Upload GST / ITR documents</p>
                <p className="text-sm mt-1">
                  {hasPending
                    ? 'Click "Extract Data from Documents" to read files'
                    : hasExtracted
                    ? 'Click "Analyze Documents" to generate the compliance report'
                    : 'Then extract and analyze to see results'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Compliance Score */}
              <div className="glass-card p-7 rounded-2xl border border-[#A855F7]/30 flex items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-[#A855F7]/10 rounded-full -translate-y-16 translate-x-16 blur-2xl" />
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Compliance Score</p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-display font-black text-[#A855F7]">{results.complianceScore}</span>
                    <span className="text-muted-foreground text-sm">/ 100</span>
                  </div>
                  <p className="text-sm text-foreground/60 mt-2">
                    Document Type: <span className="font-semibold text-foreground/80">{results.documentType === "BOTH" ? "GSTR + ITR" : results.documentType}</span>
                  </p>
                </div>
                <div className="text-center">
                  <div className={`text-7xl font-display font-black ${gradeColor(results.complianceGrade)}`}>
                    {results.complianceGrade}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Grade</p>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {results.itcUtilizationRatio !== undefined && (
                  <MetricCard label="ITC Utilization" value={PCT(results.itcUtilizationRatio)} good={results.itcUtilizationRatio >= 80} note="of available ITC used" />
                )}
                {results.effectiveGstRate !== undefined && (
                  <MetricCard label="Effective GST Rate" value={PCT(results.effectiveGstRate)} neutral note="output tax / turnover" />
                )}
                {results.taxBurdenRatio !== undefined && (
                  <MetricCard label="Net Tax Burden" value={PCT(results.taxBurdenRatio)} good={results.taxBurdenRatio < 5} note="net GST / turnover" />
                )}
                {results.itcEfficiency !== undefined && (
                  <MetricCard label="ITC Efficiency" value={PCT(results.itcEfficiency)} good={results.itcEfficiency >= 70} note="ITC vs output tax" />
                )}
                {results.effectiveTaxRate !== undefined && (
                  <MetricCard label="Effective Tax Rate" value={PCT(results.effectiveTaxRate)} good={results.effectiveTaxRate < 20} note="ITR: tax / taxable income" />
                )}
                {results.tdsCoverageRatio !== undefined && (
                  <MetricCard label="TDS Coverage" value={PCT(results.tdsCoverageRatio)} good={results.tdsCoverageRatio >= 80} note="TDS / net tax liability" />
                )}
                {results.businessIncomeRatio !== undefined && (
                  <MetricCard label="Business Income Share" value={PCT(results.businessIncomeRatio)} neutral note="business / gross total income" />
                )}
                {results.turnoverMatchScore !== undefined && (
                  <MetricCard label="GST–ITR Match" value={results.turnoverMatchScore + "%"} good={results.turnoverMatchScore >= 80} note="turnover consistency" />
                )}
              </div>

              {/* GSTR Extracted Data */}
              {results.gstr && (
                <DataSection title="GST Return — Extracted Data" color="#A855F7" items={[
                  { label: "GSTIN", value: results.gstr.gstin ?? "—" },
                  { label: "Filing Period", value: results.gstr.filingPeriod ?? "—" },
                  { label: "Total Taxable Turnover", value: INR(results.gstr.totalTaxableTurnover) },
                  { label: "IGST Collected", value: INR(results.gstr.igstCollected) },
                  { label: "CGST Collected", value: INR(results.gstr.cgstCollected) },
                  { label: "SGST Collected", value: INR(results.gstr.sgstCollected) },
                  { label: "Total Output Tax", value: INR(results.gstr.totalOutputTax) },
                  { label: "Total ITC Available", value: INR(results.gstr.totalItcAvailable) },
                  { label: "Total ITC Utilized", value: INR(results.gstr.totalItcUtilized) },
                  { label: "Net Tax Payable", value: INR(results.gstr.netTaxPayable) },
                  { label: "Tax Paid (Cash)", value: INR(results.gstr.taxPaidCash) },
                  { label: "Late Fee", value: INR(results.gstr.lateFee) },
                  { label: "Interest", value: INR(results.gstr.interestPaid) },
                ]} />
              )}

              {/* ITR Extracted Data */}
              {results.itr && (
                <DataSection title="Income Tax Return — Extracted Data" color="#3B82F6" items={[
                  { label: "PAN", value: results.itr.panNumber ?? "—" },
                  { label: "Assessment Year", value: results.itr.assessmentYear ?? "—" },
                  { label: "ITR Form", value: results.itr.itrForm ?? "—" },
                  { label: "Gross Total Income", value: INR(results.itr.grossTotalIncome) },
                  { label: "Business Income", value: INR(results.itr.businessIncome) },
                  { label: "Salary Income", value: INR(results.itr.salaryIncome) },
                  { label: "Other Sources", value: INR(results.itr.otherSourcesIncome) },
                  { label: "Deductions (Chap. VI-A)", value: INR(results.itr.totalDeductions) },
                  { label: "Taxable Income", value: INR(results.itr.taxableIncome) },
                  { label: "Tax Payable", value: INR(results.itr.taxPayable) },
                  { label: "TDS Deducted", value: INR(results.itr.tdsDeducted) },
                  { label: "Advance Tax Paid", value: INR(results.itr.advanceTaxPaid) },
                  { label: "Net Tax Liability", value: INR(results.itr.netTaxLiability) },
                  { label: "Refund Amount", value: INR(results.itr.refundAmount) },
                  { label: "Tax Due", value: INR(results.itr.taxDue) },
                ]} />
              )}

              {/* Flags & Strengths */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {results.flags.length > 0 && (
                  <div className="glass-card p-5 rounded-2xl border border-warning/20">
                    <h3 className="text-xs font-bold text-warning uppercase tracking-wider mb-3 flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4" /> Red Flags
                    </h3>
                    <ul className="space-y-2">
                      {results.flags.map((f, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning mt-2 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {results.strengths.length > 0 && (
                  <div className="glass-card p-5 rounded-2xl border border-success/20">
                    <h3 className="text-xs font-bold text-success uppercase tracking-wider mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Strengths
                    </h3>
                    <ul className="space-y-2">
                      {results.strengths.map((s, i) => (
                        <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-success mt-2 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
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

function MetricCard({ label, value, good, neutral, note }: {
  label: string; value: string; good?: boolean; neutral?: boolean; note?: string;
}) {
  const color = neutral ? "text-secondary" : good ? "text-success" : "text-warning";
  return (
    <div className="glass-card p-4 rounded-xl border border-border/50">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
      {note && <p className="text-[10px] text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}

function DataSection({ title, color, items }: {
  title: string; color: string; items: { label: string; value: string }[];
}) {
  const visible = items.filter((i) => i.value !== "—");
  if (!visible.length) return null;
  return (
    <div className="glass-card p-5 rounded-2xl border border-border/50">
      <h3 className="text-sm font-display font-semibold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
        {visible.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1 border-b border-border/30">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <span className="text-xs font-semibold text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
