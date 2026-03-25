/**
 * fieldMapper.ts
 * Safety-net normaliser that handles any alias Gemini might return
 * despite the schema instructions. Maps ALL known alternative names
 * to the exact field names the app's data structures expect.
 *
 * This runs client-side after receiving the API response, so even if
 * Gemini ignores the schema and uses an old name, the app still gets
 * the right value.
 */

type AliasMap = Record<string, string[]>;

// ── Balance Sheet aliases → WorkingCapitalData field names ────────────────────
const BS_ALIASES: AliasMap = {
  currentAssets:          ["totalCurrentAssets", "total_current_assets", "ca", "totalCA", "currentAssetsTotal"],
  currentLiabilities:     ["totalCurrentLiabilities", "total_current_liabilities", "cl", "totalCL", "currentLiabilitiesTotal"],
  inventory:              ["inventories", "closingStock", "closing_stock", "stockInTrade", "stock", "goodsInHand"],
  debtors:                ["tradeReceivables", "sundryDebtors", "accountsReceivable", "billsReceivable", "bookDebts"],
  cash:                   ["cashAndBank", "cashAndBankBalances", "cashAndCashEquivalents", "bankBalance", "cashBalance", "cashAtBank"],
  creditors:              ["sundryCreditors", "tradePayables", "accountsPayable", "billsPayable", "tradingCreditors"],
  fixedAssets:            ["netBlock", "grossBlock", "propertyPlantEquipment", "ppAndE", "tangibleAssets"],
  totalAssets:            ["grandTotalAssets", "assetsTotal"],
  netWorth:               ["shareholdersFunds", "shareholdersEquity", "capitalAccount", "partnersCapital", "ownersEquity", "equity"],
  longTermLoans:          ["longTermBorrowings", "securedLoans", "termLoans", "termLoan"],
  shortTermLoans:         ["shortTermBorrowings", "unsecuredLoans"],
  bankOD:                 ["bankOverdraft", "overdraft", "cashCredit", "ccAccount", "odAccount"],
  otherCurrentLiabilities:["otherCL", "provisions", "advanceFromCustomers"],
  investments:            ["investment", "mutualFunds"],
  loansAndAdvances:       ["loanAndAdvances", "advances", "prepaidExpenses"],
  totalLiabilities:       ["grandTotalLiabilities", "liabilitiesTotal", "totalFundsEmployed"],
};

// ── Profit & Loss aliases → WorkingCapitalData field names ────────────────────
const PL_ALIASES: AliasMap = {
  sales:             ["grossSales", "netSales", "revenue", "turnover", "revenueFromOperations", "netRevenue", "totalRevenue", "totalSales", "grossTurnover"],
  cogs:              ["costOfGoodsSold", "costOfSales", "directCosts", "materialConsumed", "costOfRevenue", "manufacturingCost"],
  purchases:         ["purchase", "purchaseOfStockInTrade", "purchaseOfRawMaterials", "netPurchases"],
  openingStock:      ["openingInventory", "stockAtBeginning"],
  closingStock:      ["closingInventory", "stockAtEnd", "inventory"], // fallback
  grossProfit:       ["gp", "tradingProfit", "grossMargin"],
  expenses:          ["operatingExpenses", "indirectExpenses", "overheads", "sellingAndAdmin", "gaExpenses", "adminExpenses", "totalOperatingExpenses"],
  EBITDA:            ["ebitda", "pbdit", "operatingProfit"],
  depreciation:      ["depreciationAndAmortization", "dAndA", "amortization"],
  interestExpenses:  ["interest", "financeCharges", "financeCosts", "bankChargesFinance", "interestPaid"],
  netProfit:         ["netProfitAfterTax", "pat", "profitAfterTax", "netIncome", "profitForTheYear", "surplus"],
  otherIncome:       ["nonOperatingIncome", "miscIncome"],
  totalIncome:       ["grossIncome"],
  totalExpenses:     ["totalCosts", "totalExpenditures"],
  tax:               ["incomeTax", "provisionForTax", "currentTax", "taxExpense"],
};

// ── Banking aliases → BankingData field names ─────────────────────────────────
const BANKING_ALIASES: AliasMap = {
  totalCredits:       ["creditTurnover", "totalDeposits", "totalReceipts", "totalInflow", "totalCredited", "sumOfCredits"],
  totalDebits:        ["debitTurnover", "totalWithdrawals", "totalPayments", "totalOutflow", "totalDebited", "sumOfDebits"],
  averageBalance:     ["avgBalance", "monthlyAverageBalance", "mab", "abb", "averageDailyBalance"],
  minimumBalance:     ["minBalance", "lowestBalance"],
  openingBalance:     ["balanceBF", "balanceBroughtForward", "openingCreditBalance"],
  closingBalance:     ["balanceCF", "balanceCarriedForward", "closingCreditBalance", "outstandingBalance", "balanceAsOnDate"],
  cashDeposits:       ["cashDeposit", "cashCredited", "currencyDeposit"],
  chequeReturns:      ["bouncedCheques", "returnedCheques", "chequeBounces", "chequeDishonour", "ecsReturns", "nachReturns", "bounceCount", "returnCount", "emiBouncedCount"],
  loanRepayments:     ["loanEmi", "termLoanEmi", "principalRepayment", "loanInstalment"],
  overdraftUsage:     ["odUsed", "odUtilized", "ccUtilized", "cashCreditUsed", "overdraftAmount"],
  ecsEmiPayments:     ["ecs", "nachDebit", "standingInstruction", "autoDebit", "monthlyEmiEcs"],
  transactionFrequency:["transactionCount", "noOfTransactions", "totalTransactions", "numberOfEntries"],
  salaryCredits:      ["salaryReceived", "salaryIncome", "monthlySalary"],
  interestCredits:    ["interestIncome", "bankInterestReceived", "savingsInterest"],
  interestDebits:     ["interestCharged", "bankInterestCharged", "financeChargesDebited"],
  bankCharges:        ["serviceCharges", "maintenanceCharges", "processingCharges"],
  sanctionedLimit:    ["ccLimit", "odLimit", "approvedLimit", "creditLimit"],
  outstandingBalance: ["balanceOutstanding", "principalOutstanding", "loanOutstanding"],
  utilization:        ["utilizationPercentage", "percentageUtilization"],
  dpValue:            ["drawingPower", "dp", "eligibleDp"],
};

// ── GSTR aliases → GstrFields interface names ─────────────────────────────────
const GSTR_ALIASES: AliasMap = {
  gstin:              ["gstinNumber", "gstNumber", "gstRegistrationNo", "gstIn"],
  filingPeriod:       ["taxPeriod", "returnPeriod", "period", "monthOfFiling"],
  gstrForm:           ["formType", "returnType", "gstrType"],
  totalTaxableTurnover:["totalTaxableValue", "taxableTurnover", "taxableValue", "aggregateTurnover", "netTaxableSupply"],
  totalOutputTax:     ["totalTax", "totalGst", "outputTax", "grossGstLiability", "taxAmount"],
  igstCollected:      ["igst", "totalIgst", "integratedGst", "igstAmount", "igstPayable"],
  cgstCollected:      ["cgst", "totalCgst", "centralGst", "cgstAmount", "cgstPayable"],
  sgstCollected:      ["sgst", "totalSgst", "stateGst", "sgstAmount", "sgstPayable", "utgst"],
  cessCollected:      ["cess", "totalCess", "gstCess", "compensationCess"],
  totalItcAvailable:  ["inputTaxCredit", "itc", "itcAvailable", "totalItc", "eligibleItc"],
  totalItcUtilized:   ["itcUtilized", "itcAvailed", "itcUsed", "itcSetOff"],
  netTaxPayable:      ["taxToBePaidInCash", "balanceTaxPayable", "taxPayableAfterItc", "netGstLiability"],
  taxPaidCash:        ["taxPaidInCash", "cashPayment", "gstPaidCash"],
  lateFee:            ["lateFeePaid", "lateFees", "penalty"],
  interestPaid:       ["interest", "interestOnDelayedPayment", "interestLiability"],
  totalInvoices:      ["numberOfInvoices", "invoiceCount", "noOfTransactions"],
  b2bTaxableValue:    ["b2bSupplies", "suppliesToRegisteredPersons"],
  b2cTaxableValue:    ["b2cSupplies", "suppliesToUnregisteredPersons", "b2cs", "b2cl"],
  exportValue:        ["exportSupplies", "exports", "zeroRatedSupplies"],
  annualTurnover:     ["aggregateAnnualTurnover", "totalAnnualTurnover"],
};

// ── ITR aliases → ItrFields interface names ───────────────────────────────────
const ITR_ALIASES: AliasMap = {
  assessmentYear:   ["ay", "yearOfAssessment"],
  panNumber:        ["pan", "permanentAccountNumber"],
  itrForm:          ["formType", "returnType"],
  grossTotalIncome: ["gti", "totalIncomeBeforeDeductions", "grossIncome"],
  taxableIncome:    ["netTaxableIncome", "totalIncomeTaxable", "chargeableIncome", "assessedIncome", "netIncome"],
  businessIncome:   ["profitFromBusiness", "pgbp", "businessProfit", "incomeFromProfession"],
  totalDeductions:  ["deductions", "chapterViaDeductions", "deductionsUnder80c", "totalOf80C"],
  taxPayable:       ["taxOnTotalIncome", "incomeTax", "taxComputedAtApplicableRates"],
  netTaxLiability:  ["taxDue", "netTaxPayable", "totalTaxPayable", "taxAfterCess"],
  tdsDeducted:      ["tds", "taxDeductedAtSource", "totalTds", "tdsCredit"],
  advanceTaxPaid:   ["advanceTax", "advanceTaxInstallments"],
  refundAmount:     ["refund", "refundDue", "amountRefundable", "refundClaimed"],
  taxDue:           ["balanceTaxPayable", "selfAssessmentTaxDue", "netTaxDue"],
  salaryIncome:     ["salary", "incomeFromSalary", "salaries", "grossSalary"],
  capitalGains:     ["stcg", "ltcg", "shortTermCapitalGains", "longTermCapitalGains"],
  otherIncome:      ["incomeFromOtherSources", "ifos", "interestIncomeIfos"],
  housePropertyIncome:["houseProperty", "incomeFromHouseProperty", "rentalIncome"],
  selfAssessmentTax:["sat", "selfAssessmentTaxPaid"],
  surcharge:        ["surchargeOnTax"],
  educationCess:    ["cess", "healthAndEducationCess"],
};

// ── Normalise helper ──────────────────────────────────────────────────────────

function applyAliases(raw: Record<string, any>, aliasMap: AliasMap): Record<string, any> {
  const out: Record<string, any> = { ...raw };

  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    // If canonical field is already present and non-null, keep it as-is
    if (out[canonical] !== undefined && out[canonical] !== null) continue;

    // Search aliases in priority order
    for (const alias of aliases) {
      if (raw[alias] !== undefined && raw[alias] !== null) {
        out[canonical] = raw[alias];
        break;
      }
      // Also try camelCase variants (e.g. "total_current_assets")
      const camel = alias.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (raw[camel] !== undefined && raw[camel] !== null) {
        out[canonical] = raw[camel];
        break;
      }
    }
  }

  return out;
}

// ── Inference rules ───────────────────────────────────────────────────────────
// Derive missing fields from other present fields.

function applyInferences(fields: Record<string, any>, docType: string): Record<string, any> {
  const f = { ...fields };

  if (docType === "balance_sheet" || docType === "profit_loss") {
    // Derive cogs from openingStock + purchases - closingStock
    if (f.cogs == null && f.purchases != null) {
      const open = f.openingStock ?? 0;
      const close = f.closingStock ?? f.inventory ?? 0;
      if (open !== 0 || close !== 0) {
        f.cogs = open + (f.purchases ?? 0) - close;
      } else {
        f.cogs = f.purchases; // fallback: cogs ≈ purchases
      }
    }

    // Derive sales from totalIncome if sales is missing
    if (f.sales == null && f.totalIncome != null) {
      f.sales = f.totalIncome;
    }

    // Derive netProfit from grossProfit - expenses - interestExpenses - depreciation - tax
    if (f.netProfit == null && f.grossProfit != null) {
      const exp  = f.expenses ?? 0;
      const intE = f.interestExpenses ?? 0;
      const dep  = f.depreciation ?? 0;
      const tax  = f.tax ?? 0;
      f.netProfit = (f.grossProfit as number) - exp - intE - dep - tax;
    }

    // Derive grossProfit from sales - cogs
    if (f.grossProfit == null && f.sales != null && f.cogs != null) {
      f.grossProfit = (f.sales as number) - (f.cogs as number);
    }

    // Derive currentAssets sum if missing
    if (f.currentAssets == null) {
      const parts = [f.inventory, f.debtors, f.cash, f.loansAndAdvances].filter(Boolean);
      if (parts.length >= 2) {
        f.currentAssets = parts.reduce((a: number, b: number) => a + b, 0);
      }
    }
  }

  if (docType === "banking") {
    // Derive chequeReturns from emiBouncedCount if missing
    if (f.chequeReturns == null && f.emiBouncedCount != null) {
      f.chequeReturns = f.emiBouncedCount;
    }
    // Opening balance from closing if only one is present and we have credits/debits
    if (f.openingBalance == null && f.closingBalance != null && f.totalCredits != null && f.totalDebits != null) {
      f.openingBalance = (f.closingBalance as number) - (f.totalCredits as number) + (f.totalDebits as number);
    }
  }

  if (docType === "itr") {
    // Derive taxableIncome from grossTotalIncome - totalDeductions
    if (f.taxableIncome == null && f.grossTotalIncome != null && f.totalDeductions != null) {
      f.taxableIncome = (f.grossTotalIncome as number) - (f.totalDeductions as number);
    }
    // Derive taxDue from netTaxLiability - tdsDeducted - advanceTaxPaid
    if (f.taxDue == null && f.netTaxLiability != null) {
      const paid = (f.tdsDeducted ?? 0) + (f.advanceTaxPaid ?? 0) + (f.selfAssessmentTax ?? 0);
      f.taxDue = Math.max(0, (f.netTaxLiability as number) - paid);
    }
  }

  return f;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function normalizeFields(raw: Record<string, any>, docType: string): Record<string, any> {
  let fields = raw;

  // Apply alias mapping based on doc type
  if (docType === "balance_sheet") fields = applyAliases(fields, BS_ALIASES);
  else if (docType === "profit_loss") fields = applyAliases(fields, PL_ALIASES);
  else if (docType === "banking") fields = applyAliases(fields, BANKING_ALIASES);
  else if (docType === "gstr") fields = applyAliases(fields, GSTR_ALIASES);
  else if (docType === "itr") fields = applyAliases(fields, ITR_ALIASES);

  // Apply inference rules
  fields = applyInferences(fields, docType);

  // Strip nulls to keep the object clean (app checks for undefined)
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== null && v !== undefined)
  );
}
