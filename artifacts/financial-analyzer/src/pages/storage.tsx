import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useListCases, useDeleteCase } from "@workspace/api-client-react";
import { Trash2, ExternalLink, RefreshCw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Storage() {
  const { data: cases, isLoading, refetch } = useListCases();
  const deleteCase = useDeleteCase();
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this case?")) {
      deleteCase.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Deleted", description: "Case removed from storage." });
          refetch();
        }
      });
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Case Storage</h1>
          <p className="text-muted-foreground mt-1">Manage and review previously saved financial analyses</p>
        </div>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm font-medium flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/30 uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Client Name</th>
                  <th className="px-6 py-4">Analysis Type</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Key Metric</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {cases?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      No saved cases found. Start an analysis to save it here.
                    </td>
                  </tr>
                )}
                {cases?.map(c => (
                  <tr key={c.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-mono text-muted-foreground">#{c.id}</td>
                    <td className="px-6 py-4 font-medium text-foreground">{c.clientName}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded bg-secondary/10 text-secondary text-xs capitalize font-semibold border border-secondary/20">
                        {c.caseType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium">
                      {c.caseType === 'working_capital' 
                        ? `Elig: ₹${c.workingCapitalResults?.eligibilityAmount?.toLocaleString()}`
                        : `Score: ${c.bankingResults?.overallScore}`
                      }
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={c.caseType === 'working_capital' ? "/working-capital" : "/banking-analysis"}>
                          <button className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Open module">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </Link>
                        <button 
                          onClick={() => handleDelete(c.id)}
                          className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
