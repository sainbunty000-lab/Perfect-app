import type { WorkingCapitalData, BankingData } from "./parser";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface WorkingCapitalResults {
  currentRatio: number;
  quickRatio: number;
  inventoryTurnover: number;
  debtorDays: number;
  creditorDays: number;
  inventoryDays: number;
  workingCapitalCycle: number;
  workingCapitalAmount: number;
  eligibilityAmount: number;
  grossProfitMargin: number;
  netProfitMargin: number;
}

export interface BankingResults {
  workingCapitalPosition: string;
  liquidityPosition: string;
  cashFlowPosition: string;
  profitabilityLevel: string;
  creditworthiness: string;
  repaymentCapacity: string;
  financialStability: string;
  operationalEfficiency: string;
  businessTurnoverTrend: string;
  cashConversionCycle: number;
  bankingBehavior: string;
  riskLevel: string;
  fundUtilization: string;
  debtServicingAbility: string;
  creditRiskAssessment: string;
  overallScore: number;
  // Detailed sub-scores for transparency
  scoreBreakdown: Record<string, number>;
}

// ─────────────────────────────────────────────
// Utility: safe division (never returns Infinity/NaN)
// ─────────────────────────────────────────────
const safeDiv = (num: number, den: number): number => {
  if (!den || den === 0 || isNaN(den) || !isFinite(den)) return 0;
  if (!num || isNaN(num)) return 0;
  return num / den;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundInt = (n: number) => Math.round(n);

// ─────────────────────────────────────────────
// WORKING CAPITAL CALCULATIONS
// All formulas are standard financial analysis formulas
// ─────────────────────────────────────────────
export function calculateWorkingCapital(data: WorkingCapitalData): WorkingCapitalResults {
  const ca       = data.currentAssets       || 0;
  const cl       = data.currentLiabilities  || 0;
  const inv      = data.inventory           || 0;
  const debtors  = data.debtors             || 0;
  const creditors = data.creditors          || 0;
  const sales    = data.sales               || 0;
  const cogs     = data.cogs                || 0;
  const purchases = data.purchases          || 0;
  const netProfit = data.netProfit          || 0;

  // ── Core Ratios ──────────────────────────────────────────────────────────

  // Current Ratio = Current Assets / Current Liabilities
  // Benchmark: >2 Good, 1–2 Adequate, <1 Poor
  const currentRatio = round2(safeDiv(ca, cl));

  // Quick Ratio (Acid Test) = (Current Assets - Inventory) / Current Liabilities
  // Removes illiquid inventory from numerator
  // Benchmark: >1 Good, 0.5–1 Adequate, <0.5 Poor
  const quickRatio = round2(safeDiv(ca - inv, cl));

  // Inventory Turnover = COGS / Average Inventory
  // (We use closing inventory as proxy when opening is not available)
  // Higher = faster inventory movement = better
  const inventoryTurnover = round2(safeDiv(cogs > 0 ? cogs : sales * 0.7, inv));

  // Inventory Days (DIO) = 365 / Inventory Turnover
  // Lower = better (inventory converts to sales faster)
  const inventoryDays = inventoryTurnover > 0 ? roundInt(365 / inventoryTurnover) : 0;

  // Debtor Days (DSO) = (Debtors / Sales) × 365
  // How many days to collect receivables. Lower = better.
  const debtorDays = roundInt(safeDiv(debtors, sales) * 365);

  // Creditor Days (DPO) = (Creditors / Purchases) × 365
  // How many days to pay suppliers. Higher = better (for buyer).
  // Use sales as fallback if purchases not available
  const creditorDays = roundInt(
    safeDiv(creditors, purchases > 0 ? purchases : sales * 0.6) * 365
  );

  // Cash Conversion Cycle (CCC) = DIO + DSO - DPO
  // Lower (or negative) = better. Negative means the business collects
  // before it has to pay suppliers (like supermarkets).
  const workingCapitalCycle = inventoryDays + debtorDays - creditorDays;

  // Working Capital Amount = Current Assets - Current Liabilities
  const workingCapitalAmount = round2(ca - cl);

  // Final Eligibility = 75% of positive Working Capital
  // (Industry standard: banks lend up to 75% of net working capital)
  const eligibilityAmount = round2(Math.max(0, workingCapitalAmount * 0.75));

  // ── Profitability ────────────────────────────────────────────────────────
  // Gross Profit Margin = (Sales - COGS) / Sales × 100
  const grossProfitMargin = round2(safeDiv(sales - (cogs || sales * 0.7), sales) * 100);

  // Net Profit Margin = Net Profit / Sales × 100
  const netProfitMargin = round2(safeDiv(netProfit, sales) * 100);

  return {
    currentRatio,
    quickRatio,
    inventoryTurnover,
    inventoryDays,
    debtorDays,
    creditorDays,
    workingCapitalCycle: roundInt(workingCapitalCycle),
    workingCapitalAmount,
    eligibilityAmount,
    grossProfitMargin,
    netProfitMargin,
  };
}

// ─────────────────────────────────────────────
// BANKING ANALYSIS CALCULATIONS
// Rule-based, uses RATIOS not absolute values
// so results are scale-independent (works for
// both ₹50K and ₹5Cr average balance businesses)
// ─────────────────────────────────────────────
export function calculateBanking(data: BankingData): BankingResults {
  const credits     = data.totalCredits       || 0;
  const debits      = data.totalDebits        || 0;
  const minBal      = data.minimumBalance     || 0;
  const avgBal      = data.averageBalance     || 0;
  const openBal     = data.openingBalance     || 0;
  const closeBal    = data.closingBalance     || 0;
  const bounces     = data.chequeReturns      || 0;
  const overdraft   = data.overdraftUsage     || 0;
  const loanEmi     = data.loanRepayments     || 0;
  const ecsEmi      = data.ecsEmiPayments     || 0;
  const intDebits   = data.interestDebits     || 0;
  const bankCharges = data.bankCharges        || 0;
  const salaries    = data.salaryCredits      || 0;
  const upi         = data.upiTransactions    || 0;
  const rtgs        = data.rtgsNeftTransfers  || 0;
  const gst         = data.gstTaxPayments     || 0;
  const txnCount    = data.transactionFrequency || 1;
  const largeTxns   = data.largeTransactions  || 0;
  const cashDep     = data.cashDeposits       || 0;
  const cashWdl     = data.cashWithdrawals    || 0;

  // ── Derived Ratios (scale-independent) ──────────────────────────────────

  // 1. Credit-Debit Ratio: credits vs debits
  const cdRatio = safeDiv(credits, debits || 1);

  // 2. Minimum Balance Utilization: how much above minimum does avg bal sit?
  //    minBal / avgBal — lower ratio = cushion above min
  const minBalRatio = avgBal > 0 ? safeDiv(minBal, avgBal) : 0;

  // 3. Bounce Rate: bounces per 100 transactions
  const bounceRate = safeDiv(bounces, txnCount) * 100;

  // 4. Overdraft Intensity: overdraft as % of total credits
  const odIntensity = safeDiv(overdraft, credits) * 100;

  // 5. Cash transaction ratio (cash-heavy = informal economy risk)
  const cashRatio = safeDiv(cashDep + cashWdl, credits + debits) * 100;

  // 6. Digital transaction ratio (UPI + RTGS as % of total activity)
  const digitalRatio = safeDiv(upi + rtgs, credits + debits) * 100;

  // 7. Debt servicing ratio: EMI+loan as % of total credits
  const debtServiceRatio = safeDiv(loanEmi + ecsEmi, credits) * 100;

  // 8. Balance growth: closing vs opening
  const balanceGrowth = openBal > 0 ? ((closeBal - openBal) / openBal) * 100 : 0;

  // 9. Interest burden ratio: interest debits as % of credits
  const interestBurden = safeDiv(intDebits + bankCharges, credits) * 100;

  // 10. GST compliance ratio: GST payments as % of credits (proxy for turnover reporting)
  const gstComplianceRatio = safeDiv(gst, credits) * 100;

  // ── Score Components (each out of 10, total 100) ─────────────────────────

  const scoreBreakdown: Record<string, number> = {};

  // (A) Liquidity — 15 pts
  // Good: minBal >= 20% of avgBal, avgBal positive
  let liquidityScore = 0;
  if (avgBal > 0) {
    liquidityScore += minBalRatio >= 0.5 ? 8 : minBalRatio >= 0.2 ? 5 : minBalRatio >= 0.05 ? 2 : 0;
    liquidityScore += balanceGrowth >= 10 ? 7 : balanceGrowth >= 0 ? 4 : balanceGrowth >= -10 ? 2 : 0;
  }
  scoreBreakdown["Liquidity"] = Math.min(15, liquidityScore);

  // (B) Cash Flow — 15 pts
  // Good: credits consistently > debits
  let cashFlowScore = 0;
  if (cdRatio >= 1.2) cashFlowScore = 15;
  else if (cdRatio >= 1.05) cashFlowScore = 12;
  else if (cdRatio >= 1.0) cashFlowScore = 8;
  else if (cdRatio >= 0.9) cashFlowScore = 4;
  else cashFlowScore = 0;
  scoreBreakdown["Cash Flow"] = cashFlowScore;

  // (C) Banking Behavior — 20 pts
  let behaviorScore = 20;
  // Each bounce deducts points
  behaviorScore -= Math.min(15, bounces * 5);
  // High overdraft usage deducts
  if (odIntensity > 30) behaviorScore -= 5;
  else if (odIntensity > 10) behaviorScore -= 2;
  scoreBreakdown["Banking Behavior"] = Math.max(0, behaviorScore);

  // (D) Debt Servicing — 15 pts
  let debtScore = 15;
  if (debtServiceRatio > 50) debtScore = 0;
  else if (debtServiceRatio > 35) debtScore = 5;
  else if (debtServiceRatio > 25) debtScore = 8;
  else if (debtServiceRatio > 15) debtScore = 12;
  scoreBreakdown["Debt Servicing"] = debtScore;

  // (E) Operational Activity — 15 pts
  // High transaction frequency + digital payments = well-run business
  let opsScore = 0;
  // Monthly txn frequency (assume data is 3–12 months)
  const monthlyTxn = txnCount / 6; // assume 6-month statement
  opsScore += monthlyTxn >= 60 ? 8 : monthlyTxn >= 30 ? 6 : monthlyTxn >= 10 ? 3 : 1;
  opsScore += digitalRatio >= 50 ? 7 : digitalRatio >= 25 ? 4 : digitalRatio >= 10 ? 2 : 0;
  scoreBreakdown["Operational Activity"] = Math.min(15, opsScore);

  // (F) GST/Tax Compliance — 10 pts
  let gstScore = gstComplianceRatio >= 1.5 ? 10 : gstComplianceRatio >= 0.5 ? 7 : gstComplianceRatio > 0 ? 4 : 2;
  scoreBreakdown["GST Compliance"] = gstScore;

  // (G) Business Turnover Trend — 10 pts (balance growth proxy)
  let trendScore = 0;
  if (balanceGrowth >= 20) trendScore = 10;
  else if (balanceGrowth >= 10) trendScore = 8;
  else if (balanceGrowth >= 0) trendScore = 6;
  else if (balanceGrowth >= -10) trendScore = 3;
  else trendScore = 0;
  scoreBreakdown["Turnover Trend"] = trendScore;

  const totalScore = Math.round(
    Math.min(100, Object.values(scoreBreakdown).reduce((a, b) => a + b, 0))
  );

  // ── Qualitative Assessments ───────────────────────────────────────────────

  // Working Capital Position
  const wcPosition =
    avgBal > 0 && cdRatio >= 1.1 ? "Adequate"
    : cdRatio >= 1.0 ? "Moderate"
    : "Insufficient";

  // Liquidity
  const liquidityPos =
    minBalRatio >= 0.5 && avgBal > 0 ? "Strong"
    : minBalRatio >= 0.1 ? "Moderate"
    : "Weak";

  // Cash Flow
  const cashFlowPos =
    cdRatio >= 1.1 ? "Positive"
    : cdRatio >= 1.0 ? "Neutral"
    : "Negative";

  // Profitability (using credits net of debts as proxy)
  const netSurplus = credits - debits;
  const surplusRatio = safeDiv(netSurplus, credits) * 100;
  const profitability =
    surplusRatio >= 20 ? "High"
    : surplusRatio >= 5 ? "Medium"
    : "Low";

  // Creditworthiness
  const creditworthiness =
    totalScore >= 85 ? "Excellent"
    : totalScore >= 70 ? "Good"
    : totalScore >= 50 ? "Fair"
    : "Poor";

  // Repayment Capacity
  const repayment =
    debtServiceRatio <= 15 && cdRatio >= 1.1 ? "Strong"
    : debtServiceRatio <= 30 ? "Adequate"
    : "Weak";

  // Financial Stability
  const stability =
    totalScore >= 75 && balanceGrowth >= 0 ? "Stable"
    : totalScore >= 50 ? "Moderate"
    : "Unstable";

  // Operational Efficiency
  const efficiency =
    digitalRatio >= 50 && monthlyTxnHelper(txnCount) >= 30 ? "High"
    : digitalRatio >= 20 ? "Moderate"
    : "Low";

  // Business Turnover Trend
  const turnoverTrend =
    balanceGrowth >= 10 ? "Growing"
    : balanceGrowth >= -5 ? "Stable"
    : "Declining";

  // Banking Behavior
  const behavior =
    bounces === 0 && odIntensity < 5 ? "Disciplined"
    : bounces <= 1 && odIntensity < 20 ? "Regular"
    : "Irregular";

  // Risk Level
  const risk =
    totalScore >= 80 ? "Low"
    : totalScore >= 55 ? "Medium"
    : "High";

  // Fund Utilization
  const fundUtil =
    odIntensity < 5 && cdRatio >= 1.0 ? "Optimal"
    : odIntensity < 20 ? "Adequate"
    : "Poor";

  // Debt Servicing Ability (same logic as repayment capacity)
  const debtServicing = repayment;

  // Credit Risk Grade
  const creditGrade =
    totalScore >= 85 ? "Grade A"
    : totalScore >= 70 ? "Grade B"
    : totalScore >= 50 ? "Grade C"
    : "Grade D";

  // Cash Conversion Cycle approximation from banking data
  // If exact WC data not available, estimate from transaction patterns
  const approxCCC = Math.round(
    safeDiv(credits, txnCount / 30) * 0.1  // rough proxy
  );

  return {
    workingCapitalPosition: wcPosition,
    liquidityPosition: liquidityPos,
    cashFlowPosition: cashFlowPos,
    profitabilityLevel: profitability,
    creditworthiness,
    repaymentCapacity: repayment,
    financialStability: stability,
    operationalEfficiency: efficiency,
    businessTurnoverTrend: turnoverTrend,
    cashConversionCycle: Math.max(0, approxCCC),
    bankingBehavior: behavior,
    riskLevel: risk,
    fundUtilization: fundUtil,
    debtServicingAbility: debtServicing,
    creditRiskAssessment: creditGrade,
    overallScore: totalScore,
    scoreBreakdown,
  };
}

// Helper
function monthlyTxnHelper(total: number): number {
  return total / 6;
}

// ─────────────────────────────────────────────
// RATIO BENCHMARKS (for UI status coloring)
// ─────────────────────────────────────────────
export const BENCHMARKS = {
  currentRatio:      { good: 2.0,  warning: 1.0 },   // >2 good, 1-2 ok, <1 poor
  quickRatio:        { good: 1.0,  warning: 0.5 },   // >1 good, 0.5-1 ok, <0.5 poor
  inventoryTurnover: { good: 6.0,  warning: 3.0 },   // >6 good, 3-6 ok, <3 poor
  debtorDays:        { good: 45,   warning: 90,  lowerBetter: true }, // <45 good
  creditorDays:      { good: 60,   warning: 30,  lowerBetter: false }, // >60 good (buyer wants longer)
  workingCapitalCycle: { good: 30, warning: 90,  lowerBetter: true }, // <30 good
  grossProfitMargin: { good: 30,   warning: 15 },
  netProfitMargin:   { good: 10,   warning: 5  },
};

export type RatioStatus = "good" | "warning" | "danger";

export function getRatioStatus(
  key: keyof typeof BENCHMARKS,
  value: number
): RatioStatus {
  const b = BENCHMARKS[key];
  if (!b) return "warning";

  const lowerBetter = (b as any).lowerBetter === true;

  if (lowerBetter) {
    if (value <= b.good) return "good";
    if (value <= b.warning) return "warning";
    return "danger";
  } else {
    if (value >= b.good) return "good";
    if (value >= b.warning) return "warning";
    return "danger";
  }
}
