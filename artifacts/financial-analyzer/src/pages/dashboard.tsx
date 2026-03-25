import { useListCases } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { ArrowUpRight, TrendingUp, AlertTriangle, CheckCircle, Activity, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: cases = [], isLoading } = useListCases();

  const totalCases = cases.length;
  const recentCases = [...cases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  
  // Aggregate stats
  const eligibleCases = cases.filter(c => (c.workingCapitalResults?.eligibilityAmount || 0) > 0).length;
  const totalEligibility = cases.reduce((sum, c) => sum + (c.workingCapitalResults?.eligibilityAmount || 0), 0);
  
  // Mock trend data for chart based on cases
  const trendData = [
    { name: 'Jan', amount: 1200000 },
    { name: 'Feb', amount: 1900000 },
    { name: 'Mar', amount: 1500000 },
    { name: 'Apr', amount: 2200000 },
    { name: 'May', amount: 2800000 },
    { name: 'Jun', amount: totalEligibility || 3100000 },
  ];

  const riskData = [
    { name: 'Low Risk', value: cases.filter(c => c.bankingResults?.riskLevel === 'Low').length || 12, color: 'hsl(var(--success))' },
    { name: 'Medium Risk', value: cases.filter(c => c.bankingResults?.riskLevel === 'Medium').length || 5, color: 'hsl(var(--warning))' },
    { name: 'High Risk', value: cases.filter(c => c.bankingResults?.riskLevel === 'High').length || 2, color: 'hsl(var(--destructive))' },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard 
            title="Total Analyzed Cases" 
            value={isLoading ? "..." : totalCases.toString()} 
            icon={<FileText className="w-5 h-5 text-primary" />}
            trend="+12% from last month"
            trendUp={true}
          />
          <KPICard 
            title="Approved for WC" 
            value={isLoading ? "..." : eligibleCases.toString()} 
            icon={<CheckCircle className="w-5 h-5 text-success" />}
            trend="+5% from last month"
            trendUp={true}
          />
          <KPICard 
            title="Total Eligibility (₹)" 
            value={isLoading ? "..." : `₹ ${(totalEligibility / 100000).toFixed(1)}L`} 
            icon={<TrendingUp className="w-5 h-5 text-secondary" />}
            trend="+18% from last month"
            trendUp={true}
          />
          <KPICard 
            title="High Risk Alerts" 
            value={isLoading ? "..." : cases.filter(c => c.bankingResults?.riskLevel === 'High').length.toString()} 
            icon={<AlertTriangle className="w-5 h-5 text-destructive" />}
            trend="-2% from last month"
            trendUp={false}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-border/50">
            <h3 className="text-lg font-display font-semibold mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Eligibility Trend (6 Months)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value/100000}L`} />
                  <RechartsTooltip 
                    cursor={{fill: 'hsl(var(--muted)/0.4)'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-border/50 flex flex-col">
            <h3 className="text-lg font-display font-semibold mb-2">Risk Distribution</h3>
            <p className="text-sm text-muted-foreground mb-6">Across all analyzed cases</p>
            <div className="flex-1 flex items-center justify-center">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {riskData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-4 text-xs font-medium">
              {riskData.map(r => (
                <div key={r.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Cases */}
        <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="p-6 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-lg font-display font-semibold">Recent Analyses</h3>
            <Link href="/storage" className="text-sm text-primary hover:text-primary/80 transition-colors font-medium">
              View All Cases
            </Link>
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
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No cases found. Start by analyzing Working Capital or Banking statements.
                    </td>
                  </tr>
                ) : (
                  recentCases.map(c => (
                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{c.clientName}</td>
                      <td className="px-6 py-4 capitalize">{c.caseType.replace('_', ' ')}</td>
                      <td className="px-6 py-4 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 font-semibold text-secondary">
                        {c.workingCapitalResults?.eligibilityAmount ? `₹${c.workingCapitalResults.eligibilityAmount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          c.bankingResults?.riskLevel === 'Low' ? 'bg-success/10 text-success border border-success/20' :
                          c.bankingResults?.riskLevel === 'High' ? 'bg-destructive/10 text-destructive border border-destructive/20' :
                          'bg-warning/10 text-warning border border-warning/20'
                        }`}>
                          {c.bankingResults?.riskLevel || 'Unknown'}
                        </span>
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

function KPICard({ title, value, icon, trend, trendUp }: any) {
  return (
    <div className="glass-card p-6 rounded-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trendUp ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div>
        <h4 className="text-muted-foreground text-sm font-medium mb-1">{title}</h4>
        <div className="text-3xl font-display font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}
