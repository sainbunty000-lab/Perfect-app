// Working Capital & Banking calculation logic — mobile version

export interface WorkingCapitalData {
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  debtors?: number;
  creditors?: number;
  cash?: number;
  sales?: number;
  cogs?: number;
  purchases?: number;
  expenses?: number;
  netProfit?: number;
}

export interface WorkingCapitalResults {
  workingCapitalAmount?: number;
  eligibilityAmount?: number;
  currentRatio?: number;
  quickRatio?: number;
  inventoryTurnover?: number;
  debtorDays?: number;
  creditorDays?: number;
  workingCapitalCycle?: number;
  grossProfitMargin?: number;
  netProfitMargin?: number;
}

export function calculateWorkingCapital(d: WorkingCapitalData): WorkingCapitalResults {
  const ca = d.currentAssets ?? 0;
  const cl = d.currentLiabilities ?? 0;
  const inv = d.inventory ?? 0;
  const debtors = d.debtors ?? 0;
  const creditors = d.creditors ?? 0;
  const sales = d.sales ?? 1;
  const cogs = d.cogs ?? 0;
  const purchases = d.purchases ?? cogs;
  const netProfit = d.netProfit ?? 0;

  const wc = ca - cl;
  const eligibility = Math.max(0, wc * 0.75);
  const currentRatio = cl > 0 ? ca / cl : 0;
  const quickRatio = cl > 0 ? (ca - inv) / cl : 0;
  const invTurnover = inv > 0 ? (cogs || sales) / inv : 0;
  const debtorDays = sales > 0 ? (debtors / sales) * 365 : 0;
  const creditorDays = purchases > 0 ? (creditors / purchases) * 365 : 0;
  const invDays = invTurnover > 0 ? 365 / invTurnover : 0;
  const wcCycle = debtorDays + invDays - creditorDays;
  const gpMargin = sales > 0 ? ((sales - (cogs || 0)) / sales) * 100 : 0;
  const npMargin = sales > 0 ? (netProfit / sales) * 100 : 0;

  return {
    workingCapitalAmount: Math.round(wc),
    eligibilityAmount: Math.round(eligibility),
    currentRatio: +currentRatio.toFixed(2),
    quickRatio: +quickRatio.toFixed(2),
    inventoryTurnover: +invTurnover.toFixed(2),
    debtorDays: +debtorDays.toFixed(1),
    creditorDays: +creditorDays.toFixed(1),
    workingCapitalCycle: +wcCycle.toFixed(1),
    grossProfitMargin: +gpMargin.toFixed(1),
    netProfitMargin: +npMargin.toFixed(1),
  };
}

export interface BankingData {
  totalCredits?: number;
  totalDebits?: number;
  averageBalance?: number;
  minimumBalance?: number;
  openingBalance?: number;
  closingBalance?: number;
  cashDeposits?: number;
  chequeReturns?: number;
  loanRepayments?: number;
  overdraftUsage?: number;
  transactionFrequency?: number;
  ecsEmiPayments?: number;
  salaryCredits?: number;
  interestCredits?: number;
  interestDebits?: number;
  bankCharges?: number;
  upiTransactions?: number;
  rtgsNeftTransfers?: number;
  largeTransactions?: number;
}

export interface BankingResults {
  overallScore: number;
  riskLevel: string;
  creditRiskAssessment: string;
  workingCapitalPosition: string;
  liquidityPosition: string;
  cashFlowPosition: string;
  creditworthiness: string;
  repaymentCapacity: string;
  financialStability: string;
  bankingBehavior: string;
}

export function calculateBanking(d: BankingData): BankingResults {
  const credits = d.totalCredits ?? 0;
  const debits = d.totalDebits ?? 0;
  const avgBal = d.averageBalance ?? 0;
  const minBal = d.minimumBalance ?? 0;
  const bounces = d.chequeReturns ?? 0;
  const od = d.overdraftUsage ?? 0;
  const emi = d.loanRepayments ?? d.ecsEmiPayments ?? 0;

  let score = 60;
  if (credits > 0 && debits > 0) {
    const utilization = debits / credits;
    if (utilization < 0.7) score += 10;
    else if (utilization > 0.95) score -= 10;
  }
  if (avgBal > 0 && minBal > 0) {
    const balRatio = minBal / avgBal;
    if (balRatio > 0.5) score += 8;
    else if (balRatio < 0.1) score -= 8;
  }
  if (bounces === 0) score += 10;
  else if (bounces <= 2) score -= 5;
  else score -= 15;
  if (od === 0) score += 5;
  else if (od > avgBal * 0.5) score -= 10;
  if (emi > 0 && credits > 0 && emi / credits < 0.4) score += 5;

  score = Math.max(10, Math.min(100, score));

  const riskLevel = score >= 75 ? "Low" : score >= 55 ? "Medium" : "High";
  const quality = (score: number) =>
    score >= 75 ? "Strong" : score >= 55 ? "Moderate" : "Weak";

  return {
    overallScore: score,
    riskLevel,
    creditRiskAssessment:
      score >= 75 ? "Grade A — Creditworthy" :
      score >= 60 ? "Grade B — Acceptable" :
      score >= 45 ? "Grade C — Marginal" : "Grade D — High Risk",
    workingCapitalPosition: quality(score),
    liquidityPosition: minBal > 0 && minBal >= avgBal * 0.2 ? "Strong" : "Moderate",
    cashFlowPosition: credits > debits ? "Positive" : "Negative",
    creditworthiness: quality(score),
    repaymentCapacity: emi > 0 && credits > 0 && emi / credits < 0.4 ? "Adequate" : "Moderate",
    financialStability: bounces === 0 && od === 0 ? "Stable" : "Moderate",
    bankingBehavior: bounces <= 1 ? "Disciplined" : "Irregular",
  };
}
