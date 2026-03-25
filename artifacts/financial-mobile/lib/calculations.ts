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
  const credits    = d.totalCredits        ?? 0;
  const debits     = d.totalDebits         ?? 0;
  const avgBal     = d.averageBalance      ?? 0;
  const minBal     = d.minimumBalance      ?? 0;
  const openBal    = d.openingBalance      ?? 0;
  const closeBal   = d.closingBalance      ?? 0;
  const bounces    = d.chequeReturns       ?? 0;
  const od         = d.overdraftUsage      ?? 0;
  const loanEmi    = d.loanRepayments      ?? 0;
  const ecsEmi     = d.ecsEmiPayments      ?? 0;
  const emi        = loanEmi > 0 ? loanEmi : ecsEmi;
  const cashDep    = d.cashDeposits        ?? 0;
  const txnFreq    = d.transactionFrequency ?? 0;
  const salary     = d.salaryCredits       ?? 0;
  const rtgsNeft   = d.rtgsNeftTransfers   ?? 0;
  const intDebits  = d.interestDebits      ?? 0;

  // ── 1. Credit-Debit Turnover Analysis (0–25 pts) ────────────────────────────
  let creditDebitScore = 15; // neutral start
  if (credits > 0 && debits > 0) {
    const utilRatio = debits / credits;
    if (utilRatio <= 0.60)      creditDebitScore = 25; // excellent: significant credit surplus
    else if (utilRatio <= 0.75) creditDebitScore = 22;
    else if (utilRatio <= 0.85) creditDebitScore = 18;
    else if (utilRatio <= 0.95) creditDebitScore = 12;
    else                        creditDebitScore = 5;  // debits ≈ credits, very tight
  }
  // Bonus: closing balance trending up vs opening
  if (openBal > 0 && closeBal > openBal) creditDebitScore = Math.min(25, creditDebitScore + 3);

  // ── 2. Balance Quality (0–20 pts) ────────────────────────────────────────────
  let balScore = 10;
  if (avgBal > 0) {
    // Min balance as % of avg: reflects if account runs dry
    const minRatio = minBal > 0 ? minBal / avgBal : 0;
    if (minRatio >= 0.6)       balScore = 20;
    else if (minRatio >= 0.3)  balScore = 15;
    else if (minRatio >= 0.1)  balScore = 10;
    else                       balScore = 4;
  }
  // Cash deposit concentration: high cash = potential concern (AML/undisclosed income)
  if (credits > 0 && cashDep > 0) {
    const cashRatio = cashDep / credits;
    if (cashRatio > 0.70) balScore = Math.max(0, balScore - 6);
    else if (cashRatio > 0.40) balScore = Math.max(0, balScore - 3);
  }

  // ── 3. Cheque Bounce & OD Risk (0–25 pts) ────────────────────────────────────
  let riskScore = 20;
  if (bounces === 0)       riskScore = 25;
  else if (bounces === 1)  riskScore = 18;
  else if (bounces === 2)  riskScore = 13;
  else if (bounces <= 4)   riskScore = 7;
  else                     riskScore = 2;  // 5+ bounces — high risk
  // OD usage penalty
  if (od > 0 && avgBal > 0) {
    if (od > avgBal * 1.5) riskScore = Math.max(0, riskScore - 8);
    else if (od > avgBal)  riskScore = Math.max(0, riskScore - 4);
  }

  // ── 4. Repayment & Servicing Ability (0–15 pts) ──────────────────────────────
  let repayScore = 8;
  if (emi > 0 && credits > 0) {
    const dscr = emi / credits;
    if (dscr <= 0.25)      repayScore = 15; // very manageable
    else if (dscr <= 0.35) repayScore = 12;
    else if (dscr <= 0.50) repayScore = 8;
    else                   repayScore = 3;  // EMI eating most of credits
  } else if (emi === 0 && credits > 0) {
    repayScore = 10; // no loan = clean slate
  }
  // Interest debit burden
  if (intDebits > 0 && debits > 0 && intDebits / debits > 0.15) {
    repayScore = Math.max(0, repayScore - 3);
  }

  // ── 5. Business Activity & Banking Formality (0–15 pts) ──────────────────────
  let activityScore = 7;
  if (txnFreq >= 100) activityScore = 15; // active account
  else if (txnFreq >= 50)  activityScore = 12;
  else if (txnFreq >= 20)  activityScore = 9;
  else if (txnFreq > 0)    activityScore = 6;
  if (salary > 0) activityScore = Math.min(15, activityScore + 2);          // stable salary inflow
  if (rtgsNeft > 0 && credits > 0 && rtgsNeft / credits > 0.3) {
    activityScore = Math.min(15, activityScore + 2);                          // formal digital transactions
  }

  const score = Math.max(10, Math.min(100,
    creditDebitScore + balScore + riskScore + repayScore + activityScore
  ));

  // ── Derived labels ────────────────────────────────────────────────────────────
  const riskLevel = score >= 75 ? "Low" : score >= 55 ? "Medium" : "High";
  const quality   = (s: number) => s >= 75 ? "Strong" : s >= 50 ? "Adequate" : "Weak";

  const liquidityPosition  = minBal > 0 && avgBal > 0 && minBal / avgBal >= 0.25
    ? "Strong" : (minBal > 0 && avgBal > 0 && minBal / avgBal >= 0.10) ? "Adequate" : "Weak";

  const cashFlowPosition   = credits > debits * 1.1 ? "Strong"
    : credits >= debits * 0.9 ? "Adequate" : "Weak";

  const repayCapacity      = emi > 0 && credits > 0
    ? (emi / credits <= 0.30 ? "Strong" : emi / credits <= 0.50 ? "Adequate" : "Weak")
    : "Adequate";

  const stability          = bounces === 0 && (od === 0 || (avgBal > 0 && od < avgBal))
    ? "Strong" : bounces <= 1 ? "Adequate" : "Weak";

  const behavior           = bounces === 0 ? "Disciplined"
    : bounces <= 2 ? "Adequate" : "Irregular";

  return {
    overallScore:           score,
    riskLevel,
    creditRiskAssessment:
      score >= 80 ? "Grade A — Excellent Creditworthy" :
      score >= 65 ? "Grade B — Good — Acceptable"       :
      score >= 50 ? "Grade C — Average — Monitor Closely":
                    "Grade D — Weak — High Risk",
    workingCapitalPosition: quality(score),
    liquidityPosition,
    cashFlowPosition,
    creditworthiness:       quality(score),
    repaymentCapacity:      repayCapacity,
    financialStability:     stability,
    bankingBehavior:        behavior,
  };
}
