import { useState } from "react";
import { useForm } from "react-hook-form";
import { Layout } from "@/components/Layout";
import { parseBankFile } from "@/lib/parser";
import { calculateBanking } from "@/lib/calculations";
import type { BankingData } from "@/lib/parser";
import type { BankingResults } from "@/lib/calculations";
import { exportToPDF } from "@/lib/pdf";
import { UploadCloud, FileSpreadsheet, Calculator, Download, Save, Activity, CheckCircle, AlertOctagon } from "lucide-react";
import { useCreateCase } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function BankingAnalysis() {
  const { toast } = useToast();
  const [isParsing, setIsParsing] = useState(false);
  const [results, setResults] = useState<BankingResults | null>(null);
  
  const createCase = useCreateCase();

  const { register, handleSubmit, setValue, getValues } = useForm<BankingData>({
    defaultValues: {
      openingBalance: 0, closingBalance: 0, cashDeposits: 0, cashWithdrawals: 0, 
      chequeDeposits: 0, chequeReturns: 0, ecsEmiPayments: 0, loanRepayments: 0, 
      interestCredits: 0, interestDebits: 0, bankCharges: 0, averageBalance: 0, 
      minimumBalance: 0, overdraftUsage: 0, transactionFrequency: 0, 
      totalCredits: 0, totalDebits: 0
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    try {
      const extracted = await parseBankFile(files[0]);

      let fieldsFound = 0;
      (Object.keys(extracted) as (keyof BankingData)[]).forEach((key) => {
        if (extracted[key] !== undefined) {
          setValue(key, extracted[key] as number);
          fieldsFound++;
        }
      });

      toast({
        title: "Statement Parsed",
        description: `Extracted ${fieldsFound} banking metrics. Please verify the values before calculating.`,
      });
      handleCalculate();
    } catch (err) {
      toast({ title: "Parsing Failed", description: "Could not read the bank statement. Ensure it's a valid CSV.", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  const handleCalculate = () => {
    const data = getValues();
    const cleanData: BankingData = {};
    Object.keys(data).forEach(k => {
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
      onError: () => toast({ title: "Error", description: "Could not save.", variant: "destructive" })
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
        <div className="xl:col-span-4 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-border/50">
            <h3 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-secondary" /> Bank Statement CSV
            </h3>
            <div className="relative group cursor-pointer border-2 border-dashed border-border hover:border-secondary/50 rounded-xl p-8 text-center transition-colors bg-background/50">
              <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground group-hover:text-secondary transition-colors mb-3" />
              <p className="text-sm font-medium">Upload Statement</p>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-border/50 h-[500px] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-card z-10 pb-2 border-b border-border">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-accent" /> Manual Input
              </h3>
              <button onClick={handleCalculate} className="text-xs font-medium bg-secondary/10 text-secondary px-3 py-1.5 rounded-lg hover:bg-secondary/20">
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
                { id: "overdraftUsage", label: "Overdraft Usage (₹)" },
                { id: "transactionFrequency", label: "Txn Frequency (#)" },
              ].map(field => (
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
        </div>

        {/* Results Column */}
        <div className="xl:col-span-8 space-y-6">
          {!results ? (
             <div className="h-full min-h-[400px] glass-card rounded-2xl border border-border/50 flex flex-col items-center justify-center text-muted-foreground">
               <Activity className="w-12 h-12 mb-4 opacity-20" />
               <p>Upload a CSV or enter values to generate the banking analysis report.</p>
             </div>
          ) : (
            <>
              {/* Top Score Card */}
              <div className="glass-card p-8 rounded-2xl border border-secondary/30 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">Overall Assessment</h2>
                  <div className="text-4xl font-display font-bold text-foreground flex items-center gap-3">
                    {results.creditRiskAssessment}
                    {results.riskLevel === 'Low' ? <CheckCircle className="w-8 h-8 text-success" /> : <AlertOctagon className="w-8 h-8 text-warning" />}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-display font-black text-secondary">{results.overallScore}</div>
                  <p className="text-sm text-muted-foreground font-medium">/ 100 Score</p>
                </div>
              </div>

              {/* Badges Grid */}
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

function StatusBadge({ label, value, isRisk = false }: { label: string, value: string | undefined, isRisk?: boolean }) {
  if (!value) return null;
  
  let colorClass = "bg-secondary/10 text-secondary border-secondary/20";
  
  // Logic for colors
  const good = ['Strong', 'Positive', 'High', 'Excellent', 'Stable', 'Disciplined', 'Optimal', 'Grade A', 'Low', 'Adequate'];
  const warn = ['Moderate', 'Neutral', 'Medium', 'Fair', 'Regular', 'Grade B'];
  const bad = ['Weak', 'Negative', 'Low', 'Poor', 'Unstable', 'Irregular', 'Grade C', 'Grade D', 'High', 'Insufficient'];

  if (good.includes(value)) colorClass = isRisk ? "bg-success/10 text-success border-success/20" : "bg-success/10 text-success border-success/20";
  if (warn.includes(value)) colorClass = "bg-warning/10 text-warning border-warning/20";
  if (bad.includes(value)) colorClass = isRisk ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-destructive/10 text-destructive border-destructive/20";

  return (
    <div className="glass-card p-4 rounded-xl border border-border/50 flex flex-col justify-between h-24">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className={`mt-auto w-fit px-3 py-1 rounded-md text-sm font-semibold border ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}
