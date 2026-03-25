import { useState } from "react";
import { useForm } from "react-hook-form";
import { Layout } from "@/components/Layout";
import { parseFinancialFile } from "@/lib/parser";
import { calculateWorkingCapital, getRatioStatus } from "@/lib/calculations";
import type { WorkingCapitalData } from "@/lib/parser";
import type { WorkingCapitalResults } from "@/lib/calculations";
import { exportToPDF } from "@/lib/pdf";
import { UploadCloud, FileText, Calculator, Download, Save, Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { useCreateCase } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function WorkingCapital() {
  const { toast } = useToast();
  const [isParsing, setIsParsing] = useState(false);
  const [results, setResults] = useState<WorkingCapitalResults | null>(null);
  
  const createCase = useCreateCase();

  const { register, handleSubmit, setValue, watch, getValues } = useForm<WorkingCapitalData>({
    defaultValues: {
      currentAssets: 0, currentLiabilities: 0, inventory: 0, 
      debtors: 0, creditors: 0, cash: 0, sales: 0, cogs: 0, 
      purchases: 0, expenses: 0, netProfit: 0
    }
  });

  const formValues = watch();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    try {
      const file = files[0];
      const extracted = await parseFinancialFile(file);

      let fieldsFound = 0;
      (Object.keys(extracted) as (keyof WorkingCapitalData)[]).forEach((key) => {
        if (extracted[key] !== undefined) {
          setValue(key, extracted[key] as number);
          fieldsFound++;
        }
      });

      if (fieldsFound === 0) {
        toast({
          title: "No Data Extracted",
          description: "Could not find recognizable financial fields. Please check the file format or use manual input.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Parsing Complete",
          description: `Successfully extracted ${fieldsFound} field(s) from document. Please verify values below.`,
        });
        handleCalculate();
      }
    } catch (err) {
      toast({
        title: "Parsing Failed",
        description: "Could not read the document. Supported: .txt, .csv",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleCalculate = () => {
    const data = getValues();
    // parse all values to number just in case
    const cleanData: WorkingCapitalData = {};
    Object.keys(data).forEach(k => {
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
      clientName: "New Client " + new Date().toLocaleDateString(),
      caseType: "working_capital" as const,
      workingCapitalData: getValues() as any,
      workingCapitalResults: results as any,
    };

    createCase.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Saved", description: "Case saved to storage successfully." });
      },
      onError: () => {
        toast({ title: "Save Failed", description: "Could not save the case.", variant: "destructive" });
      }
    });
  };

  return (
    <Layout>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Working Capital Analysis</h1>
          <p className="text-muted-foreground mt-1">Extract or manually input BS & P&L data for ratio calculation</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => exportToPDF("wc-report", "Working-Capital-Report.pdf")}
            disabled={!results}
            className="px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-muted font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button 
            onClick={handleSave}
            disabled={!results || createCase.isPending}
            className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm flex items-center gap-2 transition-all hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {createCase.isPending ? "Saving..." : "Save Case"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8" id="wc-report">
        
        {/* Left Column: Input & Parsing */}
        <div className="xl:col-span-4 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-border/50">
            <h3 className="text-lg font-display font-semibold mb-4 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-secondary" /> Document Upload
            </h3>
            
            <div className="relative group cursor-pointer border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center transition-colors bg-background/50">
              <input 
                type="file" 
                accept=".txt,.csv" 
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              />
              <FileText className="w-8 h-8 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Drag & drop or click to upload</p>
              <p className="text-xs text-muted-foreground">Supports .txt, .csv (Balance Sheet & P&L)</p>
              
              {isParsing && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                    <span className="text-xs font-medium">Parsing data...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-border/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <Calculator className="w-5 h-5 text-accent" /> Manual Input
              </h3>
              <button 
                onClick={handleCalculate}
                className="text-xs font-medium bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
              >
                Calculate
              </button>
            </div>

            <form className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2">Balance Sheet</h4>
                {[
                  { id: "currentAssets", label: "Current Assets (₹)" },
                  { id: "currentLiabilities", label: "Current Liabilities (₹)" },
                  { id: "inventory", label: "Inventory (₹)" },
                  { id: "debtors", label: "Debtors (₹)" },
                  { id: "creditors", label: "Creditors (₹)" },
                  { id: "cash", label: "Cash & Bank (₹)" },
                ].map(field => (
                  <div key={field.id} className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground/80">{field.label}</label>
                    <input 
                      type="number" 
                      {...register(field.id as keyof WorkingCapitalData)}
                      className="w-32 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-4">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 pb-2">Profit & Loss</h4>
                {[
                  { id: "sales", label: "Revenue/Sales (₹)" },
                  { id: "cogs", label: "COGS (₹)" },
                  { id: "purchases", label: "Purchases (₹)" },
                  { id: "expenses", label: "Operating Exp. (₹)" },
                  { id: "netProfit", label: "Net Profit (₹)" },
                ].map(field => (
                  <div key={field.id} className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground/80">{field.label}</label>
                    <input 
                      type="number" 
                      {...register(field.id as keyof WorkingCapitalData)}
                      className="w-32 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                ))}
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="xl:col-span-8 space-y-6">
          {!results ? (
            <div className="h-full min-h-[400px] glass-card rounded-2xl border border-border/50 flex flex-col items-center justify-center text-muted-foreground">
              <Info className="w-12 h-12 mb-4 opacity-20" />
              <p>Upload a document or enter values manually to see results.</p>
            </div>
          ) : (
            <>
              {/* Primary Outcomes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6 rounded-2xl border border-primary/30 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">Final Eligibility Amount</p>
                  <h2 className="text-4xl font-display font-bold text-primary">₹{results.eligibilityAmount?.toLocaleString()}</h2>
                  <p className="text-xs mt-2 text-foreground/60">Based on 75% of positive Working Capital</p>
                </div>
                <div className="glass-card p-6 rounded-2xl border border-border/50">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Working Capital Amount</p>
                  <h2 className="text-4xl font-display font-bold text-foreground">₹{results.workingCapitalAmount?.toLocaleString()}</h2>
                  <p className="text-xs mt-2 text-foreground/60">Current Assets - Current Liabilities</p>
                </div>
              </div>

              {/* Ratios Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <RatioCard title="Current Ratio" value={results.currentRatio} benchmark="> 1.33 Ideal" status={results.currentRatio! >= 1.33 ? "good" : "warn"} />
                <RatioCard title="Quick Ratio" value={results.quickRatio} benchmark="> 1.0 Ideal" status={results.quickRatio! >= 1 ? "good" : "warn"} />
                <RatioCard title="Inv. Turnover" value={results.inventoryTurnover} suffix="x" benchmark="Higher is better" status="neutral" />
                <RatioCard title="Debtor Days" value={results.debtorDays} suffix=" d" benchmark="< 90 Ideal" status={results.debtorDays! <= 90 ? "good" : "warn"} />
                <RatioCard title="Creditor Days" value={results.creditorDays} suffix=" d" benchmark="Depends on terms" status="neutral" />
                <RatioCard title="WC Cycle (CCC)" value={results.workingCapitalCycle} suffix=" d" benchmark="Lower is better" status={results.workingCapitalCycle! < 60 ? "good" : "warn"} />
              </div>
            </>
          )}
        </div>

      </div>
    </Layout>
  );
}

function RatioCard({ title, value, suffix = "", benchmark, status }: any) {
  const colors = {
    good: "text-success",
    warn: "text-warning",
    danger: "text-destructive",
    neutral: "text-secondary"
  };
  
  return (
    <div className="glass-card p-4 rounded-xl border border-border/50">
      <h4 className="text-xs font-medium text-muted-foreground mb-2">{title}</h4>
      <div className={`text-2xl font-display font-bold ${colors[status as keyof typeof colors]}`}>
        {value}{suffix}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{benchmark}</p>
    </div>
  );
}
