import { useState } from "react";
import { useForm } from "react-hook-form";
import { Layout } from "@/components/Layout";
import { parseBankFile } from "@/lib/parser";
import { calculateBanking } from "@/lib/calculations";
import type { BankingData } from "@/lib/parser";
import type { BankingResults } from "@/lib/calculations";
import { exportToPDF } from "@/lib/pdf";
import {
  UploadCloud, FileSpreadsheet, Calculator, Download, Save,
  Activity, CheckCircle, AlertOctagon, Loader2, X,
  FileText, FileImage, Zap,
} from "lucide-react";
import { ACCEPTED_EXTENSIONS, detectFormat, FORMAT_LABELS } from "@/lib/fileReader";
import { useCreateCase } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type PendingFile = { file: File; label: string };

export default function BankingAnalysis() {
  const { toast } = useToast();
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; label: string; fieldsExtracted: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<BankingResults | null>(null);

  const createCase = useCreateCase();

  const { register, setValue, getValues } = useForm<BankingData>({
    defaultValues: {
      openingBalance: 0, closingBalance: 0, cashDeposits: 0, cashWithdrawals: 0,
      chequeDeposits: 0, chequeReturns: 0, ecsEmiPayments: 0, loanRepayments: 0,
      interestCredits: 0, interestDebits: 0, bankCharges: 0, averageBalance: 0,
      minimumBalance: 0, overdraftUsage: 0, transactionFrequency: 0,
      totalCredits: 0, totalDebits: 0,
    },
  });

  const fileIconFor = (label: string) => {
    if (label.toLowerCase().includes("pdf")) return <FileText className="w-5 h-5 text-red-400 shrink-0" />;
    if (label.toLowerCase().includes("image")) return <FileImage className="w-5 h-5 text-blue-400 shrink-0" />;
    return <FileSpreadsheet className="w-5 h-5 text-green-400 shrink-0" />;
  };

  // Step 1: Just store the selected file
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile({ file, label: FORMAT_LABELS[detectFormat(file)] });
    setUploadedFile(null);
    e.target.value = "";
  };

  // Step 2: Extract button — actually parse
  const handleExtract = async () => {
    if (!pendingFile) return;
    setExtracting(true);
    try {
      const extracted = await parseBankFile(pendingFile.file);

      let fieldsFound = 0;
      (Object.keys(extracted) as (keyof BankingData)[]).forEach((key) => {
        if (extracted[key] !== undefined) {
          setValue(key, extracted[key] as number);
          fieldsFound++;
        }
      });

      setUploadedFile({ name: pendingFile.file.name, label: pendingFile.label, fieldsExtracted: fieldsFound });
      setPendingFile(null);
      toast({ title: "Data Extracted", description: `${fieldsFound} banking metrics extracted. Verify values, then click Calculate.` });
    } catch {
      toast({ title: "Extraction Failed", description: "Could not read the bank statement. Try CSV or PDF format.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const handleCalculate = () => {
    const data = getValues();
    const cleanData: BankingData = {};
    Object.keys(data).forEach((k) => {
      cleanData[k as keyof BankingData] = Number(data[k as keyof BankingData]) || 0;
    });
    const res = calculateBanking(cleanData);
    setResults(res);
  };

  const handleSave = () => {
    if (!results) return;
    const payload = {
      clientName: "Banking Client " + new Date().toLocaleDateString(),
      caseType: "banking" as const,
      bankingData: getValues() as any,
      bankingResults: results as any,
    };
    createCase.mutate({ data: payload }, {
      onSuccess: () => toast({ title: "Saved", description: "Case saved." }),
      onError: () => toast({ title: "Error", description: "Could not save.", variant: "destructive" }),
    });
  };

  return (
    <Layout>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Banking Performance Analysis</h1>
          <p className="text-muted-foreground mt-1">Deep analysis of banking behavior and credit risk</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => exportToPDF("banking-report", "Banking-Report.pdf")}
            disabled={!results}
            className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button
            onClick={handleSave}
            disabled={!results || createCase.isPending}
            className="px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90 font-medium text-sm flex items-center gap-2 transition-all hover:shadow-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> Save Analysis
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8" id="banking-report">

        {/* Input Column */}
        <div className="xl:col-span-4 space-y-5">

          {/* Upload Zone */}
          <div className="glass-card p-6 rounded-2xl border border-border/50">
            <h3 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-secondary" /> Bank Statement
            </h3>

            {uploadedFile ? (
              <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 flex items-center gap-3">
                {fileIconFor(uploadedFile.label)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{uploadedFile.label} · {uploadedFile.fieldsExtracted} metric(s) extracted</p>
                </div>
                <CheckCircle className="w-5 h-5 text-success shrink-0" />
                <button onClick={() => { setUploadedFile(null); setPendingFile(null); }} className="p-1 hover:bg-white/10 rounded text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : pendingFile ? (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-3">
                {fileIconFor(pendingFile.label)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pendingFile.file.name}</p>
                  <p className="text-xs text-muted-foreground">{pendingFile.label} · Ready to extract</p>
                </div>
                <Zap className="w-5 h-5 text-accent shrink-0" />
                <button onClick={() => setPendingFile(null)} className="p-1 hover:bg-white/10 rounded text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative group cursor-pointer border-2 border-dashed border-border hover:border-secondary/50 rounded-xl p-6 text-center transition-colors bg-background/40">
                <input type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="w-7 h-7 text-secondary group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-medium">Click or drag & drop</p>
                  <div className="flex flex-wrap justify-center gap-1 mt-1">
                    {["CSV", "PDF", "Excel", "Image"].map((f) => (
                      <span key={f} className="text-[10px] bg-white/5 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Extract Button — only when file is pending */}
          {pendingFile && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="w-full py-3 rounded-2xl bg-accent text-accent-foreground font-display font-semibold text-base hover:bg-accent/90 transition-all hover:shadow-lg hover:shadow-accent/30 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {extracting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Extracting Data…</>
              ) : (
                <><Zap className="w-5 h-5" /> Extract Data from Document</>
              )}
            </button>
          )}

          {/* Manual Input + Calculate */}
          <div className="glass-card p-6 rounded-2xl border border-border/50 max-h-[520px] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-card z-10 pb-2 border-b border-border">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-accent" /> Manual Input
              </h3>
              <button
                onClick={handleCalculate}
                className="text-xs font-medium bg-secondary/10 text-secondary px-3 py-1.5 rounded-lg hover:bg-secondary/20"
              >
                Calculate
              </button>
            </div>

            <form className="space-y-3">
              {[
                { id: "totalCredits", label: "Total Credits (₹)" },
                { id: "totalDebits", label: "Total Debits (₹)" },
                { id: "averageBalance", label: "Average Balance (₹)" },
                { id: "minimumBalance", label: "Min Balance (₹)" },
                { id: "cashDeposits", label: "Cash Deposits (₹)" },
                { id: "chequeReturns", label: "Cheque Bounces (#)" },
                { id: "loanRepayments", label: "Loan Repayments (₹)" },
                { id: "ecsEmiPayments", label: "ECS / EMI Payments (₹)" },
                { id: "overdraftUsage", label: "Overdraft Usage (₹)" },
                { id: "transactionFrequency", label: "Txn Frequency (#)" },
              ].map((field) => (
                <div key={field.id} className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground/80">{field.label}</label>
                  <input
                    type="number"
                    {...register(field.id as keyof BankingData)}
                    className="w-32 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                  />
                </div>
              ))}
            </form>
          </div>

          <button
            onClick={handleCalculate}
            className="w-full py-3 rounded-2xl bg-secondary text-secondary-foreground font-display font-semibold text-base hover:bg-secondary/90 transition-all flex items-center justify-center gap-2"
          >
            <Calculator className="w-5 h-5" /> Calculate Banking Score
          </button>
        </div>

        {/* Results Column */}
        <div className="xl:col-span-8 space-y-6">
          {!results ? (
            <div className="h-full min-h-[400px] glass-card rounded-2xl border border-border/50 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Activity className="w-12 h-12 opacity-20" />
              <p className="text-sm text-center">
                {pendingFile
                  ? 'Click "Extract Data from Document" then "Calculate Banking Score"'
                  : "Upload a statement or enter values manually, then click Calculate."}
              </p>
            </div>
          ) : (
            <>
              <div className="glass-card p-8 rounded-2xl border border-secondary/30 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Overall Assessment</h2>
                  <div className="text-4xl font-display font-bold text-foreground flex items-center gap-3">
                    {results.creditRiskAssessment}
                    {results.riskLevel === "Low"
                      ? <CheckCircle className="w-8 h-8 text-success" />
                      : <AlertOctagon className="w-8 h-8 text-warning" />}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-display font-black text-secondary">{results.overallScore}</div>
                  <p className="text-sm text-muted-foreground font-medium">/ 100 Score</p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatusBadge label="Working Capital Position" value={results.workingCapitalPosition} />
                <StatusBadge label="Liquidity Position" value={results.liquidityPosition} />
                <StatusBadge label="Cash Flow Position" value={results.cashFlowPosition} />
                <StatusBadge label="Profitability Level" value={results.profitabilityLevel} />
                <StatusBadge label="Creditworthiness" value={results.creditworthiness} />
                <StatusBadge label="Repayment Capacity" value={results.repaymentCapacity} />
                <StatusBadge label="Financial Stability" value={results.financialStability} />
                <StatusBadge label="Banking Behavior" value={results.bankingBehavior} />
                <StatusBadge label="Risk Level" value={results.riskLevel} isRisk />
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatusBadge({ label, value, isRisk = false }: { label: string; value: string | undefined; isRisk?: boolean }) {
  if (!value) return null;
  const good = ["Strong", "Positive", "High", "Excellent", "Stable", "Disciplined", "Optimal", "Grade A", "Low", "Adequate"];
  const warn = ["Moderate", "Neutral", "Medium", "Fair", "Regular", "Grade B"];
  const bad  = ["Weak", "Negative", "Poor", "Unstable", "Irregular", "Grade C", "Grade D", "Insufficient"];

  let colorClass = "bg-secondary/10 text-secondary border-secondary/20";
  if (good.includes(value)) colorClass = "bg-success/10 text-success border-success/20";
  if (warn.includes(value)) colorClass = "bg-warning/10 text-warning border-warning/20";
  if (bad.includes(value))  colorClass = "bg-destructive/10 text-destructive border-destructive/20";
  if (isRisk && value === "High") colorClass = "bg-destructive/10 text-destructive border-destructive/20";
  if (isRisk && value === "Low")  colorClass = "bg-success/10 text-success border-success/20";

  return (
    <div className="glass-card p-4 rounded-xl border border-border/50 flex flex-col justify-between h-24">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className={`mt-auto w-fit px-3 py-1 rounded-md text-sm font-semibold border ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}
