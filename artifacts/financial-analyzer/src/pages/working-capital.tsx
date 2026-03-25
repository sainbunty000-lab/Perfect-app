import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { Layout } from "@/components/Layout";
import { parseFinancialFile } from "@/lib/parser";
import { extractWorkingCapitalFromText } from "@/lib/parser";
import { calculateWorkingCapital } from "@/lib/calculations";
import type { WorkingCapitalData } from "@/lib/parser";
import type { WorkingCapitalResults } from "@/lib/calculations";
import { exportToPDF } from "@/lib/pdf";
import { ACCEPTED_EXTENSIONS, detectFormat, FORMAT_LABELS } from "@/lib/fileReader";
import {
  UploadCloud, FileText, Calculator, Download, Save, Info,
  CheckCircle, FileImage, FileSpreadsheet,
  Loader2, X, ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { useCreateCase } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type PendingFile = { file: File; label: string };
type UploadedFile = { file: File; label: string; fieldsExtracted: number };

const formatIcon = (fmt: string) => {
  if (fmt === "pdf") return <FileText className="w-5 h-5 text-red-400" />;
  if (fmt === "excel") return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
  if (fmt === "image") return <FileImage className="w-5 h-5 text-blue-400" />;
  return <FileText className="w-5 h-5 text-muted-foreground" />;
};

export default function WorkingCapital() {
  const { toast } = useToast();

  // Files selected but not yet parsed
  const [pendingBS, setPendingBS] = useState<PendingFile | null>(null);
  const [pendingPL, setPendingPL] = useState<PendingFile | null>(null);

  // Files after parsing
  const [bsFile, setBsFile] = useState<UploadedFile | null>(null);
  const [plFile, setPlFile] = useState<UploadedFile | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<WorkingCapitalResults | null>(null);
  const [showManual, setShowManual] = useState(false);
  const bsInputRef = useRef<HTMLInputElement>(null);
  const plInputRef = useRef<HTMLInputElement>(null);

  const createCase = useCreateCase();

  const { register, setValue, watch, getValues } = useForm<WorkingCapitalData>({
    defaultValues: {
      currentAssets: 0, currentLiabilities: 0, inventory: 0,
      debtors: 0, creditors: 0, cash: 0, sales: 0, cogs: 0,
      purchases: 0, expenses: 0, netProfit: 0,
    },
  });

  const formValues = watch();
  const hasAnyPending = !!pendingBS || !!pendingPL;
  const hasAnyParsed = !!bsFile || !!plFile;

  const mergeExtracted = (data: WorkingCapitalData) => {
    (Object.keys(data) as (keyof WorkingCapitalData)[]).forEach((key) => {
      if (data[key] !== undefined && data[key] !== 0) {
        setValue(key, data[key] as number);
      }
    });
  };

  // Step 1: Just store the selected file — don't parse yet
  const handleBSSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingBS({ file, label: FORMAT_LABELS[detectFormat(file)] });
    setBsFile(null);
    if (bsInputRef.current) bsInputRef.current.value = "";
  };

  const handlePLSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPL({ file, label: FORMAT_LABELS[detectFormat(file)] });
    setPlFile(null);
    if (plInputRef.current) plInputRef.current.value = "";
  };

  // Step 2: Extract button — parse all pending files
  const handleExtract = async () => {
    if (!pendingBS && !pendingPL) return;
    setExtracting(true);
    try {
      let totalFields = 0;

      if (pendingBS) {
        const extracted = await parseFinancialFile(pendingBS.file);
        const bsFields: (keyof WorkingCapitalData)[] = [
          "currentAssets", "currentLiabilities", "inventory",
          "debtors", "creditors", "cash",
        ];
        let count = 0;
        bsFields.forEach((k) => {
          if (extracted[k] !== undefined && extracted[k] !== 0) {
            setValue(k, extracted[k] as number);
            count++;
          }
        });
        mergeExtracted(extracted);
        setBsFile({ file: pendingBS.file, label: pendingBS.label, fieldsExtracted: count });
        setPendingBS(null);
        totalFields += count;
      }

      if (pendingPL) {
        const extracted = await parseFinancialFile(pendingPL.file);
        const plFields: (keyof WorkingCapitalData)[] = [
          "sales", "cogs", "purchases", "expenses", "netProfit",
        ];
        let count = 0;
        plFields.forEach((k) => {
          if (extracted[k] !== undefined && extracted[k] !== 0) {
            setValue(k, extracted[k] as number);
            count++;
          }
        });
        mergeExtracted(extracted);
        setPlFile({ file: pendingPL.file, label: pendingPL.label, fieldsExtracted: count });
        setPendingPL(null);
        totalFields += count;
      }

      setShowManual(true);
      toast({
        title: "Data Extracted",
        description: `${totalFields} field(s) extracted. Verify values in Manual Input, then click Calculate Ratios.`,
      });
    } catch {
      toast({
        title: "Extraction Failed",
        description: "Could not read one or more documents. Try a different format or use manual input.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleCalculate = () => {
    const data = getValues();
    const cleanData: WorkingCapitalData = {};
    Object.keys(data).forEach((k) => {
      cleanData[k as keyof WorkingCapitalData] = Number(data[k as keyof WorkingCapitalData]) || 0;
    });
    const res = calculateWorkingCapital(cleanData);
    setResults(res);
  };

  const handleSave = () => {
    if (!results) {
      toast({ title: "Calculate First", description: "Please generate results before saving.", variant: "destructive" });
      return;
    }
    const payload = {
      clientName: "WC Client " + new Date().toLocaleDateString(),
      caseType: "working_capital" as const,
      workingCapitalData: getValues() as any,
      workingCapitalResults: results as any,
    };
    createCase.mutate({ data: payload }, {
      onSuccess: () => toast({ title: "Saved", description: "Case saved to storage." }),
      onError: () => toast({ title: "Save Failed", description: "Could not save the case.", variant: "destructive" }),
    });
  };

  return (
    <Layout>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Working Capital Analysis</h1>
          <p className="text-muted-foreground mt-1">Upload Balance Sheet & P&L or enter values manually</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => exportToPDF("wc-report", "Working-Capital-Report.pdf")} disabled={!results}
            className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button onClick={handleSave} disabled={!results || createCase.isPending}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> {createCase.isPending ? "Saving..." : "Save Case"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8" id="wc-report">

        {/* ── LEFT: Upload + Manual ── */}
        <div className="xl:col-span-4 space-y-5">

          {/* Balance Sheet Upload */}
          <UploadCard
            title="Balance Sheet"
            subtitle="Upload your Balance Sheet document"
            color="blue"
            accept={ACCEPTED_EXTENSIONS}
            inputRef={bsInputRef}
            pending={pendingBS}
            uploadedFile={bsFile}
            onClear={() => { setPendingBS(null); setBsFile(null); }}
            onChange={handleBSSelect}
            formats={["PDF", "Excel", "JPEG/PNG", "TXT"]}
          />

          {/* P&L Upload */}
          <UploadCard
            title="Profit & Loss Statement"
            subtitle="Upload your P&L / Income Statement"
            color="teal"
            accept={ACCEPTED_EXTENSIONS}
            inputRef={plInputRef}
            pending={pendingPL}
            uploadedFile={plFile}
            onClear={() => { setPendingPL(null); setPlFile(null); }}
            onChange={handlePLSelect}
            formats={["PDF", "Excel", "JPEG/PNG", "TXT"]}
          />

          {/* ── EXTRACT BUTTON (shown when files are pending) ── */}
          {hasAnyPending && (
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

          {/* Calculate CTA */}
          <button
            onClick={handleCalculate}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-base hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/30 flex items-center justify-center gap-2"
          >
            <Calculator className="w-5 h-5" /> Calculate Ratios
          </button>

          {/* Manual Input — collapsible */}
          <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
            <button
              onClick={() => setShowManual((v) => !v)}
              className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
            >
              <span className="font-display font-semibold text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4 text-accent" /> Manual Input / Override
              </span>
              {showManual ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showManual && (
              <div className="px-5 pb-5 space-y-5 border-t border-border/50 pt-4">
                <ManualSection title="Balance Sheet" fields={[
                  { id: "currentAssets", label: "Current Assets" },
                  { id: "currentLiabilities", label: "Current Liabilities" },
                  { id: "inventory", label: "Inventory" },
                  { id: "debtors", label: "Debtors" },
                  { id: "creditors", label: "Creditors" },
                  { id: "cash", label: "Cash & Bank" },
                ]} register={register} color="primary" />

                <ManualSection title="Profit & Loss" fields={[
                  { id: "sales", label: "Revenue / Sales" },
                  { id: "cogs", label: "COGS" },
                  { id: "purchases", label: "Purchases" },
                  { id: "expenses", label: "Operating Expenses" },
                  { id: "netProfit", label: "Net Profit" },
                ]} register={register} color="secondary" />
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="xl:col-span-8 space-y-6">
          {!results ? (
            <div className="h-full min-h-[500px] glass-card rounded-2xl border border-border/50 flex flex-col items-center justify-center text-muted-foreground gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Info className="w-8 h-8 text-primary opacity-60" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground/70">Upload documents or enter values</p>
                <p className="text-sm mt-1">
                  {hasAnyPending
                    ? 'Click "Extract Data from Documents" then "Calculate Ratios"'
                    : hasAnyParsed
                    ? 'Verify values in Manual Input, then click "Calculate Ratios"'
                    : 'Then click "Calculate Ratios" to see results'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="glass-card p-6 rounded-2xl border border-primary/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-8 translate-x-8 blur-2xl" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Eligibility Amount</p>
                  <h2 className="text-4xl font-display font-black text-primary">
                    ₹{results.eligibilityAmount?.toLocaleString("en-IN")}
                  </h2>
                  <p className="text-xs mt-2 text-foreground/50">75% of Net Working Capital</p>
                </div>
                <div className="glass-card p-6 rounded-2xl border border-border/50">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Net Working Capital</p>
                  <h2 className={`text-4xl font-display font-black ${(results.workingCapitalAmount ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    ₹{results.workingCapitalAmount?.toLocaleString("en-IN")}
                  </h2>
                  <p className="text-xs mt-2 text-foreground/50">Current Assets − Current Liabilities</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <RatioCard title="Current Ratio" value={results.currentRatio} suffix="x" benchmark="> 1.33" good={results.currentRatio! >= 1.33} />
                <RatioCard title="Quick Ratio" value={results.quickRatio} suffix="x" benchmark="> 1.0" good={results.quickRatio! >= 1} />
                <RatioCard title="Inventory Turnover" value={results.inventoryTurnover} suffix="x" benchmark="Higher is better" good={results.inventoryTurnover! >= 4} />
                <RatioCard title="Debtor Days" value={results.debtorDays} suffix=" days" benchmark="< 90 days" good={results.debtorDays! <= 90} />
                <RatioCard title="Creditor Days" value={results.creditorDays} suffix=" days" benchmark="Depends on terms" good neutral />
                <RatioCard title="Working Capital Cycle" value={results.workingCapitalCycle} suffix=" days" benchmark="Lower is better" good={results.workingCapitalCycle! < 60} />
              </div>

              {(results.grossProfitMargin !== undefined || results.netProfitMargin !== undefined) && (
                <div className="glass-card p-5 rounded-2xl border border-border/50">
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Profitability</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Gross Profit Margin</p>
                      <p className={`text-2xl font-display font-bold ${(results.grossProfitMargin ?? 0) >= 20 ? "text-success" : "text-warning"}`}>
                        {results.grossProfitMargin?.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Net Profit Margin</p>
                      <p className={`text-2xl font-display font-bold ${(results.netProfitMargin ?? 0) >= 10 ? "text-success" : "text-warning"}`}>
                        {results.netProfitMargin?.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ── Upload Card ───────────────────────────────────────────────────────────────
function UploadCard({
  title, subtitle, color, accept, inputRef, pending, uploadedFile, onClear, onChange, formats,
}: {
  title: string; subtitle: string; color: "blue" | "teal"; accept: string;
  inputRef: React.RefObject<HTMLInputElement>;
  pending: { file: File; label: string } | null;
  uploadedFile: { file: File; label: string; fieldsExtracted: number } | null;
  onClear: () => void; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formats: string[];
}) {
  const borderHover = color === "blue" ? "hover:border-blue-500/50" : "hover:border-primary/50";
  const iconColor = color === "blue" ? "text-blue-400" : "text-primary";

  return (
    <div className="glass-card p-5 rounded-2xl border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {(pending || uploadedFile) && (
          <button onClick={onClear} className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {uploadedFile ? (
        <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 flex items-center gap-3">
          {formatIcon(detectFormat(uploadedFile.file))}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{uploadedFile.file.name}</p>
            <p className="text-xs text-muted-foreground">{uploadedFile.label} · {uploadedFile.fieldsExtracted} field(s) extracted</p>
          </div>
          <CheckCircle className="w-5 h-5 text-success shrink-0" />
        </div>
      ) : pending ? (
        <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-3">
          {formatIcon(detectFormat(pending.file))}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{pending.file.name}</p>
            <p className="text-xs text-muted-foreground">{pending.label} · Ready to extract</p>
          </div>
          <Zap className="w-5 h-5 text-accent shrink-0" />
        </div>
      ) : (
        <div className={`relative group cursor-pointer border-2 border-dashed border-border ${borderHover} rounded-xl p-6 text-center transition-colors bg-background/40`}>
          <input ref={inputRef} type="file" accept={accept} onChange={onChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className={`w-7 h-7 ${iconColor} group-hover:scale-110 transition-transform`} />
            <p className="text-sm font-medium">Click or drag & drop</p>
            <div className="flex flex-wrap justify-center gap-1 mt-1">
              {formats.map((f) => (
                <span key={f} className="text-[10px] bg-white/5 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual Input Section ──────────────────────────────────────────────────────
function ManualSection({ title, fields, register, color }: {
  title: string; fields: { id: string; label: string }[];
  register: any; color: "primary" | "secondary";
}) {
  const focusClass = color === "primary"
    ? "focus:border-primary focus:ring-primary"
    : "focus:border-secondary focus:ring-secondary";

  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</h4>
      {fields.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-3">
          <label className="text-xs font-medium text-foreground/80 shrink-0">{f.label} (₹)</label>
          <input
            type="number"
            {...register(f.id)}
            className={`w-28 bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 transition-all ${focusClass}`}
          />
        </div>
      ))}
    </div>
  );
}

// ── Ratio Card ────────────────────────────────────────────────────────────────
function RatioCard({ title, value, suffix = "", benchmark, good, neutral }: {
  title: string; value?: number; suffix?: string; benchmark: string; good?: boolean; neutral?: boolean;
}) {
  const color = neutral ? "text-secondary" : good ? "text-success" : "text-warning";
  return (
    <div className="glass-card p-4 rounded-xl border border-border/50">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</p>
      <div className={`text-2xl font-display font-bold ${color}`}>
        {value?.toFixed(2)}{suffix}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{benchmark}</p>
    </div>
  );
}
