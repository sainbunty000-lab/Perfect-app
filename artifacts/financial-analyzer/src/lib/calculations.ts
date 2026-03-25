import type { 
  WorkingCapitalData, 
  WorkingCapitalResults, 
  BankingData, 
  BankingResults 
} from "@workspace/api-client-react";

// Safe division to avoid Infinity/NaN
const safeDiv = (num: number, den: number): number => {
  return den === 0 || isNaN(den) ? 0 : num / den;
};

export function calculateWorkingCapital(data: WorkingCapitalData): WorkingCapitalResults {
  const ca = data.currentAssets || 0;
  const cl = data.currentLiabilities || 0;
  const inv = data.inventory || 0;
  const debtors = data.debtors || 0;
  const creditors = data.creditors || 0;
  const sales = data.sales || 0;
  const cogs = data.cogs || 0;
  const purchases = data.purchases || 0;

  const currentRatio = safeDiv(ca, cl);
  const quickRatio = safeDiv((ca - inv), cl);
  const inventoryTurnover = safeDiv(cogs, inv);
  const debtorDays = safeDiv(debtors, sales) * 365;
  const creditorDays = safeDiv(creditors, purchases) * 365;
  
  const inventoryDays = inventoryTurnover > 0 ? 365 / inventoryTurnover : 0;
  const workingCapitalCycle = debtorDays + inventoryDays - creditorDays;
  
  const workingCapitalAmount = ca - cl;
  const eligibilityAmount = Math.max(0, workingCapitalAmount * 0.75); // 75% of positive WC

  return {
    currentRatio: Number(currentRatio.toFixed(2)),
    quickRatio: Number(quickRatio.toFixed(2)),
    inventoryTurnover: Number(inventoryTurnover.toFixed(2)),
    debtorDays: Math.round(debtorDays),
    creditorDays: Math.round(creditorDays),
    workingCapitalCycle: Math.round(workingCapitalCycle),
    workingCapitalAmount: Number(workingCapitalAmount.toFixed(2)),
    eligibilityAmount: Number(eligibilityAmount.toFixed(2)),
  };
}

export function calculateBanking(data: BankingData): BankingResults {
  const credits = data.totalCredits || 0;
  const debits = data.totalDebits || 0;
  const minBal = data.minimumBalance || 0;
  const avgBal = data.averageBalance || 0;
  const bounces = data.chequeReturns || 0;
  const overdraft = data.overdraftUsage || 0;
  const loanRepayments = data.loanRepayments || 0;
  
  let score = 100;

  // Working Capital Position
  let wcPos = "Moderate";
  if (avgBal > 500000) wcPos = "Adequate";
  if (avgBal < 50000) { wcPos = "Insufficient"; score -= 15; }

  // Liquidity
  let liquidity = "Moderate";
  if (minBal > 100000 && avgBal > minBal * 1.5) liquidity = "Strong";
  if (minBal < 10000) { liquidity = "Weak"; score -= 15; }

  // Cash Flow
  let cashFlow = "Neutral";
  if (credits > debits * 1.1) cashFlow = "Positive";
  if (debits > credits) { cashFlow = "Negative"; score -= 10; }

  // Repayment Capacity
  let repayment = "Adequate";
  if (credits > loanRepayments * 5) repayment = "Strong";
  if (credits < loanRepayments * 2) { repayment = "Weak"; score -= 15; }

  // Banking Behavior
  let behavior = "Regular";
  if (bounces === 0 && overdraft === 0) behavior = "Disciplined";
  if (bounces > 2 || overdraft > credits * 0.2) { behavior = "Irregular"; score -= 20; }

  // Risk Level
  let risk = "Medium";
  if (score > 80) risk = "Low";
  if (score < 50) risk = "High";

  // Creditworthiness
  let credit = "Good";
  if (score >= 85) credit = "Excellent";
  if (score < 70) credit = "Fair";
  if (score < 50) credit = "Poor";

  return {
    workingCapitalPosition: wcPos,
    liquidityPosition: liquidity,
    cashFlowPosition: cashFlow,
    profitabilityLevel: credits > debits * 1.2 ? "High" : (credits > debits ? "Medium" : "Low"),
    creditworthiness: credit,
    repaymentCapacity: repayment,
    financialStability: score > 75 ? "Stable" : (score > 50 ? "Moderate" : "Unstable"),
    operationalEfficiency: "Moderate", // Simplified for demo
    businessTurnoverTrend: "Stable", // Simplified
    cashConversionCycle: 45, // Placeholder if WC data missing, real logic merges them
    bankingBehavior: behavior,
    riskLevel: risk,
    fundUtilization: overdraft > 0 ? "High" : "Optimal",
    debtServicingAbility: repayment,
    creditRiskAssessment: score > 80 ? "Grade A" : (score > 60 ? "Grade B" : "Grade C"),
    overallScore: Math.max(0, score),
  };
}
