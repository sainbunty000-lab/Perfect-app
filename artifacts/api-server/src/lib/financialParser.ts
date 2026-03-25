/**
 * Server-side financial document parser.
 * Accepts raw extracted text (from pdftotext / Vision OCR) and returns
 * fully structured financial fields with high accuracy.
 *
 * Ported + enhanced from the web app's parser.ts — runs on the server so
 * Android / mobile gets the same quality as the web app.
 */

// ─── Number helpers ───────────────────────────────────────────────────────────

function parseIndianNumber(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim();
  const inParens = /^\([\d,. ]+\)$/.test(s);
  const cleaned = s
    .replace(/[₹$€£]/g, "")
    .replace(/\bRs\.?\b/gi, "")
    .replace(/\bINR\b/gi, "")
    .replace(/\s/g, "")
    .replace(/[()]/g, "")
    .replace(/,/g, "");
  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return inParens ? -Math.abs(val) : val;
}

function extractNumbers(text: string): number[] {
  const pattern = /\([\d,]+(?:\.\d+)?\)|[\d,]+(?:\.\d+)?/g;
  const results: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const v = parseIndianNumber(m[0]);
    if (v !== null && !isNaN(v)) results.push(v);
  }
  return results;
}

// ─── Position-aware field finder ──────────────────────────────────────────────
// Handles two-column Indian balance sheets correctly:
// "SUNDRY CREDITORS  1,43,827   SUNDRY DEBTORS  14,87,380"
// → takes the FIRST number AFTER the matched keyword, not the LAST on the line.

function makeLineFinder(lines: string[]) {
  return function findValue(
    keywords: string[],
    preferLast = false,
    excludeKeywords: string[] = [],
  ): number | undefined {
    const candidates: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      let matchPos = -1;
      let matchLen = 0;
      for (const kw of keywords) {
        const pos = lower.indexOf(kw.toLowerCase());
        if (pos !== -1) { matchPos = pos; matchLen = kw.length; break; }
      }
      if (matchPos === -1) continue;

      if (excludeKeywords.length > 0) {
        const exBefore = lower.slice(0, matchPos);
        const exAfter  = lower.slice(matchPos + matchLen);
        const skip = excludeKeywords.some((ex) => {
          const exL = ex.toLowerCase();
          if (exAfter.includes(exL)) return true;
          const idx = exBefore.lastIndexOf(exL);
          if (idx === -1) return false;
          return (matchPos - (idx + exL.length)) <= 20;
        });
        if (skip) continue;
      }

      const afterKeyword = line.slice(matchPos + matchLen);
      const numsAfter = extractNumbers(afterKeyword).filter((n) => Math.abs(n) >= 1);

      let val: number | undefined;
      if (numsAfter.length > 0) {
        val = numsAfter[0];
      } else {
        for (let d = 1; d <= 3; d++) {
          if (i + d >= lines.length) break;
          const nums = extractNumbers(lines[i + d]).filter((n) => Math.abs(n) >= 1);
          if (nums.length > 0) { val = Math.abs(nums[0]); break; }
        }
      }

      if (val !== undefined && !isNaN(val)) candidates.push(val);
    }

    if (candidates.length === 0) return undefined;
    return preferLast ? candidates[candidates.length - 1] : candidates[0];
  };
}

// ─── Balance Sheet extraction ─────────────────────────────────────────────────

export interface BalanceSheetFields {
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  debtors?: number;
  creditors?: number;
  cash?: number;
}

export function extractBalanceSheet(text: string): BalanceSheetFields {
  const normalized = text.replace(/\t/g, "  ").replace(/ {3,}/g, "   ");
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fv = makeLineFinder(lines);

  const compCash = fv([
    "bank and cash balance", "bank and cash balances",
    "cash and bank balance", "cash and bank balances", "cash and bank",
    "cash & bank", "cash and cash equivalents",
    "balance with bank", "bank balance", "cash in hand", "cash balance",
  ], false, ["overdraft", "od limit", "cc limit", "od balance", "cash credit"]);

  const compDebtors = fv([
    "sundry debtors", "trade debtors", "trade receivables",
    "accounts receivable", "book debts", "debtors",
  ], false, ["bad debts", "provision for doubtful", "doubtful", "creditors"]);

  const compInventory = fv([
    "closing stock", "closing inventory", "stock-in-trade",
    "stock in trade", "inventories", "finished goods",
    "raw material stock", "wip stock", "work-in-progress", "work in progress",
    "stores and spares", "stores & spares",
  ]);

  const compAdvances = fv([
    "loans & advances", "loans and advances",
    "tds and tcs receivable", "tds receivable", "advance to",
    "prepaid", "other current assets",
  ], false, ["secured loans", "unsecured loans", "term loan", "long term"]);

  const caLabel =
    fv(["total current assets"], true) ??
    fv(["net current assets"], true) ??
    fv(["current assets"], true, ["non-current", "non current", "fixed assets"]);

  const caSum = (compCash || 0) + (compDebtors || 0) + (compInventory || 0) + (compAdvances || 0);
  const currentAssets = caSum > (caLabel || 0) ? caSum : (caLabel || caSum || undefined);

  const compCreditors = fv([
    "sundry creditors", "trade creditors",
    "trade payables", "accounts payable", "creditors",
  ], false, ["debtors", "receivable"]);

  const compProvisions = fv([
    "other provision b/s", "other provision",
    "other current liabilities", "provisions", "accrued liabilities",
  ], false, ["for taxation", "taxation", "for doubtful", "income tax"]);

  const compOD = fv(["bank overdraft", "od payable", "cash credit"]);

  const compSalaryPayable = compProvisions ? undefined : fv(["salary payable", "salaries payable", "wages payable"]);
  const compGstPayable    = compProvisions ? undefined : fv(["gst payable", "gst liability", "taxes payable"]);

  const clLabel =
    fv(["total current liabilities"], true) ??
    fv(["current liabilities", "current liability"], true, ["non-current", "non current"]);

  const clSum =
    (compCreditors || 0) + (compProvisions || 0) +
    (compSalaryPayable || 0) + (compGstPayable || 0) + (compOD || 0);

  const currentLiabilities = clLabel ?? (clSum > 0 ? clSum : undefined);

  return {
    currentAssets,
    currentLiabilities,
    inventory: compInventory,
    debtors: compDebtors,
    creditors: compCreditors,
    cash: compCash,
  };
}

// ─── P&L extraction ───────────────────────────────────────────────────────────

export interface ProfitLossFields {
  sales?: number;
  cogs?: number;
  purchases?: number;
  expenses?: number;
  netProfit?: number;
}

export function extractProfitLoss(text: string): ProfitLossFields {
  const normalized = text.replace(/\t/g, "  ").replace(/ {3,}/g, "   ");
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fv = makeLineFinder(lines);

  const sales =
    fv(["net revenue from operations", "revenue from operations"], true) ??
    fv(["gross receipts", "by gross receipts"], true) ??
    fv(["net sales", "net turnover"], true) ??
    fv(["total revenue", "gross revenue", "total income from operations"], true, ["other income"]) ??
    fv(["total income"], true, ["other income"]) ??
    fv(["sales"], true, ["cost of sales", "cost of goods sold", "purchase", "return"]) ??
    fv(["turnover"], true, ["inventory turnover", "asset turnover"]);

  const cogs =
    fv(["cost of goods sold", "cost of goods"], true) ??
    fv(["cost of sales", "cost of revenue"], true) ??
    fv(["cost of production", "direct costs", "manufacturing cost"], true) ??
    fv(["cogs"]);

  const purchases =
    fv(["purchases of stock-in-trade", "purchase of stock", "purchases of traded goods"], true) ??
    fv(["raw material consumed", "material consumed", "raw materials consumed"], true) ??
    fv(["purchases"], true, ["capital purchase", "asset purchase"]);

  const expenses =
    fv(["total operating expenses", "total expenses"], true, ["cost of goods", "cost of sales"]) ??
    fv(["operating expenses", "opex"], true) ??
    fv(["indirect expenses", "administrative expenses", "general and administrative"], true);

  const grossProfit = fv(["gross profit"], true, ["gross profit margin", "gross profit %"]);

  const netProfit =
    fv(["profit for the period", "profit for the year"], true) ??
    fv(["profit after tax (pat)", "profit after tax"], true) ??
    fv(["net profit after tax"], true) ??
    fv(["to net profit"], true) ??
    fv(["net profit transferred to capital", "profit transferred to capital"], true) ??
    fv(["net profit c/d", "net profit c/o"], true) ??
    fv(["net profit"], true, ["gross profit", "operating profit", "before tax", "net profit margin"]) ??
    fv(["net income"], true, ["gross income", "total income"]) ??
    fv(["profit/(loss) for", "profit / (loss) for"], true) ??
    fv(["surplus", "surplus for the year"], true, ["deficit", "accumulated"]);

  const derivedCogs =
    cogs ??
    (!cogs && sales && grossProfit ? Math.max(0, sales - grossProfit) : undefined) ??
    (!cogs && purchases ? purchases : undefined);

  return { sales, cogs: derivedCogs, purchases, expenses, netProfit };
}

// ─── Banking text extraction ──────────────────────────────────────────────────

export interface BankingFields {
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
  ecsEmiPayments?: number;
  transactionFrequency?: number;
  bankName?: string;
  accountNumber?: string;
  statementPeriod?: string;
}

export function extractBanking(text: string): BankingFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ── CSV detection ──
  const isCSV = text.includes(",") && lines[0]?.split(",").length >= 3;
  if (isCSV) return extractBankingCsv(lines);

  // ── Text / PDF extraction ──
  const fv = makeLineFinder(lines);

  // Strip date tokens before number matching to avoid false positives
  function stripDates(line: string): string {
    return line
      .replace(/\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/g, "")
      .replace(/\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{2,4}\b/gi, "");
  }

  // Multi-line accumulation for split-line amounts
  function getTotal(keywords: string[]): number | undefined {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (!keywords.some((k) => lower.includes(k))) continue;
      // Look for the amount on same or next 3 lines
      for (let d = 0; d <= 3; d++) {
        const target = lines[i + d];
        if (!target) break;
        const stripped = stripDates(target);
        const nums = extractNumbers(stripped).filter((n) => Math.abs(n) >= 100);
        if (nums.length > 0) return Math.abs(nums[nums.length - 1]);
      }
    }
    return undefined;
  }

  const totalCredits =
    getTotal(["total credit", "total amount credit", "total cr", "total inflow", "total deposits"]) ??
    fv(["total credits", "total credit"], true);

  const totalDebits =
    getTotal(["total debit", "total amount debit", "total dr", "total outflow", "total withdrawals"]) ??
    fv(["total debits", "total debit"], true);

  const averageBalance =
    fv(["average monthly balance", "monthly average balance", "average daily balance"], true) ??
    fv(["average balance", "avg balance"], true);

  const minimumBalance = fv(["minimum balance", "min balance", "minimum daily balance"], true);

  const openingBalance =
    fv(["opening balance", "balance b/f", "balance brought forward"], false);

  const closingBalance =
    fv(["closing balance", "balance c/f", "balance carried forward", "balance as on"], true);

  const chequeReturns = fv(["cheque return", "chq return", "bounce", "dishonour", "dishonored"]);
  const loanRepayments = fv(["loan repayment", "emi paid", "loan emi", "loan installment"]);
  const overdraftUsage = fv(["overdraft", "od usage", "od balance"]);
  const ecsEmiPayments = fv(["ecs", "nach", "emi payment", "auto debit"]);
  const cashDeposits = fv(["cash deposit", "cash deposited", "cash in"]);

  // Transaction count — look for "No. of transactions" or count rows
  const txnFreq = fv(["no. of transactions", "number of transactions", "total transactions"]);

  // Bank name detection
  let bankName: string | undefined;
  const bankPatterns = [
    { name: "HDFC Bank", kw: ["hdfc"] }, { name: "SBI", kw: ["state bank of india", "sbi"] },
    { name: "ICICI Bank", kw: ["icici"] }, { name: "Axis Bank", kw: ["axis bank"] },
    { name: "Kotak Bank", kw: ["kotak"] }, { name: "PNB", kw: ["punjab national", "pnb"] },
    { name: "Bank of Baroda", kw: ["bank of baroda"] }, { name: "Canara Bank", kw: ["canara"] },
    { name: "Union Bank", kw: ["union bank"] }, { name: "Yes Bank", kw: ["yes bank"] },
    { name: "IndusInd Bank", kw: ["indusind"] }, { name: "Federal Bank", kw: ["federal bank"] },
  ];
  const fullText = text.toLowerCase();
  for (const { name, kw } of bankPatterns) {
    if (kw.some((k) => fullText.includes(k))) { bankName = name; break; }
  }

  // Account number
  const accMatch = text.match(/(?:account\s*(?:no|number|num|#)[\s:]*|a\/c\s*no[\s:]*)[:\s]*([0-9Xx*]{6,20})/i);
  const accountNumber = accMatch?.[1]?.replace(/[Xx*]+/, "****");

  // Statement period
  const periodMatch = text.match(
    /(?:statement\s+(?:period|for|from))[\s:]*(\d{1,2}[-\/\s]\w+[-\/\s]\d{2,4})\s*(?:to|–|-)\s*(\d{1,2}[-\/\s]\w+[-\/\s]\d{2,4})/i
  );
  const statementPeriod = periodMatch ? `${periodMatch[1]} – ${periodMatch[2]}` : undefined;

  return {
    totalCredits, totalDebits, averageBalance, minimumBalance,
    openingBalance, closingBalance, cashDeposits, chequeReturns,
    loanRepayments, overdraftUsage, ecsEmiPayments,
    transactionFrequency: txnFreq,
    bankName, accountNumber, statementPeriod,
  };
}

function extractBankingCsv(lines: string[]): BankingFields {
  if (lines.length < 2) return {};

  const rawHeaders = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());

  const findCol = (...candidates: string[]) =>
    rawHeaders.findIndex((h) => candidates.some((c) => h.includes(c)));

  const crIdx  = findCol("credit", "deposit", "cr amount", "money in", "inflow");
  const drIdx  = findCol("debit", "withdrawal", "dr amount", "money out", "outflow");
  const balIdx = findCol("balance", "closing bal", "running bal");
  const descIdx = findCol("description", "particulars", "narration", "remarks", "details");
  const amtIdx = crIdx === -1 && drIdx === -1 ? findCol("amount", "transaction amount") : -1;
  const typeIdx = amtIdx !== -1 ? findCol("type", "dr/cr", "cr/dr", "txn type") : -1;

  let totalCredits = 0, totalDebits = 0;
  let cashDeposits = 0, chequeReturns = 0, loanRepayments = 0, ecsEmiPayments = 0;
  const balances: number[] = [];
  let txnCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
    if (cols.length < 2) continue;
    txnCount++;

    const toNum = (v: string) => Math.abs(parseFloat(v.replace(/,/g, "")) || 0);

    let cr = 0, dr = 0;
    if (crIdx !== -1 || drIdx !== -1) {
      cr = crIdx !== -1 ? toNum(cols[crIdx] ?? "") : 0;
      dr = drIdx !== -1 ? toNum(cols[drIdx] ?? "") : 0;
    } else if (amtIdx !== -1) {
      const amt = toNum(cols[amtIdx] ?? "");
      const t = typeIdx !== -1 ? (cols[typeIdx] ?? "").toLowerCase() : "";
      if (["cr", "credit", "c", "in", "deposit"].some((x) => t === x || t.startsWith(x))) cr = amt;
      else dr = amt;
    }

    totalCredits += cr;
    totalDebits  += dr;

    if (balIdx !== -1 && cols[balIdx]) {
      const b = toNum(cols[balIdx]);
      if (b > 0) balances.push(b);
    }

    const desc = descIdx !== -1 ? (cols[descIdx] ?? "").toLowerCase() : "";
    if (["cash dep", "cash deposit", "atm dep", "cash in"].some((k) => desc.includes(k))) cashDeposits += cr;
    if (["bounce", "returned", "dishonour", "chq ret", "cheque ret"].some((k) => desc.includes(k))) chequeReturns++;
    if (["emi", "loan repay", "loan emi"].some((k) => desc.includes(k))) loanRepayments += dr;
    if (["ecs", "nach", "auto debit", "mandate"].some((k) => desc.includes(k))) ecsEmiPayments += dr;
  }

  return {
    totalCredits:       Math.round(totalCredits) || undefined,
    totalDebits:        Math.round(totalDebits) || undefined,
    openingBalance:     balances[0],
    closingBalance:     balances[balances.length - 1],
    averageBalance:     balances.length ? Math.round(balances.reduce((a, b) => a + b, 0) / balances.length) : undefined,
    minimumBalance:     balances.length ? Math.round(Math.min(...balances)) : undefined,
    cashDeposits:       Math.round(cashDeposits) || undefined,
    chequeReturns:      chequeReturns || undefined,
    loanRepayments:     Math.round(loanRepayments) || undefined,
    ecsEmiPayments:     Math.round(ecsEmiPayments) || undefined,
    transactionFrequency: txnCount || undefined,
  };
}

// ─── GSTR extraction ──────────────────────────────────────────────────────────

export interface GstrFields {
  gstin?: string;
  filingPeriod?: string;
  totalTaxableTurnover?: number;
  totalOutputTax?: number;
  igstCollected?: number;
  cgstCollected?: number;
  sgstCollected?: number;
  totalItcAvailable?: number;
  totalItcUtilized?: number;
  netTaxPayable?: number;
  taxPaidCash?: number;
  lateFee?: number;
  interestPaid?: number;
  gstrForm?: string;
}

export function extractGstr(text: string): GstrFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fv = makeLineFinder(lines);

  const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/);
  const periodMatch =
    text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i) ??
    text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*[-–]?\s*20\d{2}\b/i) ??
    text.match(/20\d{2}[-–]20?\d{2}/);
  const formMatch = text.match(/\bGSTR[-‐– ]?[139ABc]\b/i);

  const igst = fv(["igst", "integrated goods and services tax", "integrated tax"]);
  const cgst = fv(["cgst", "central goods and services tax", "central tax"], false, ["igst"]);
  const sgst = fv(["sgst", "state goods and services tax", "state tax", "utgst"], false, ["igst", "cgst"]);
  const outputTax =
    fv(["total tax liability", "total output tax", "total gst liability"]) ??
    (igst || cgst || sgst ? (igst ?? 0) + (cgst ?? 0) + (sgst ?? 0) : undefined);

  return {
    gstin:                fv(["gstin"]) !== undefined ? undefined : gstinMatch?.[0],  // prefer direct
    filingPeriod:         periodMatch?.[0],
    gstrForm:             formMatch?.[0]?.toUpperCase().replace(/[-‐– ]/, "-"),
    totalTaxableTurnover: fv(["total taxable value", "outward taxable", "taxable turnover", "taxable supplies", "total turnover", "net taxable turnover"], true),
    igstCollected:        igst,
    cgstCollected:        cgst,
    sgstCollected:        sgst,
    totalOutputTax:       outputTax,
    totalItcAvailable:    fv(["total itc available", "eligible itc", "itc available"], true),
    totalItcUtilized:     fv(["itc utilized", "total itc utilized", "itc set-off"], true),
    netTaxPayable:        fv(["net tax payable", "tax payable", "tax to be paid"], true),
    taxPaidCash:          fv(["cash ledger", "paid in cash", "cash payment", "tax paid through cash"]),
    lateFee:              fv(["late fee", "late fees"]),
    interestPaid:         fv(["interest paid", "interest on delayed", "interest payable"]),
  };
}

// ─── ITR extraction ───────────────────────────────────────────────────────────

export interface ItrFields {
  assessmentYear?: string;
  panNumber?: string;
  itrForm?: string;
  grossTotalIncome?: number;
  taxableIncome?: number;
  businessIncome?: number;
  totalDeductions?: number;
  taxPayable?: number;
  netTaxLiability?: number;
  tdsDeducted?: number;
  advanceTaxPaid?: number;
  refundAmount?: number;
  taxDue?: number;
}

export function extractItr(text: string): ItrFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fv = makeLineFinder(lines);

  const ayMatch = text.match(/(?:assessment\s+year|a\.?y\.?)\s*[:\-]?\s*(20\d{2}\s*[-–]\s*20?\d{2})/i);
  const panMatch = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  const itrFormMatch = text.match(/\bITR[-‐– ]?[1-7U]\b/i);

  return {
    assessmentYear: ayMatch?.[1]?.trim(),
    panNumber:      panMatch?.[0],
    itrForm:        itrFormMatch?.[0]?.toUpperCase().replace(/[-‐– ]/, "-"),

    grossTotalIncome: fv(["gross total income", "total of income", "total income before deduction"], true),
    businessIncome:   fv(["profit and gains from business", "business income", "income from business", "presumptive income", "business or profession"], true),
    totalDeductions:  fv(["total deductions under chapter vi", "total deductions", "deductions u/s 80", "total vi-a"], true),
    taxableIncome:    fv(["total taxable income", "taxable income", "net income", "income chargeable to tax"], true),
    taxPayable:       fv(["income tax payable", "tax on total income", "tax payable"], true),
    netTaxLiability:  fv(["net tax liability", "total tax liability", "total tax payable"], true),
    tdsDeducted:      fv(["total tds", "tds deducted", "tax deducted at source", "total tax deducted"], true),
    advanceTaxPaid:   fv(["advance tax paid", "advance tax", "self assessment tax"], true),
    refundAmount:     fv(["refund due", "refund amount", "refund payable"], true),
    taxDue:           fv(["tax due", "balance tax payable", "tax still due"], true),
  };
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

export type DocType = "balance_sheet" | "profit_loss" | "banking" | "gstr" | "itr";

export type FinancialFields =
  | (BalanceSheetFields & { docType: "balance_sheet" })
  | (ProfitLossFields   & { docType: "profit_loss" })
  | (BankingFields      & { docType: "banking" })
  | (GstrFields         & { docType: "gstr" })
  | (ItrFields          & { docType: "itr" });

export function parseFinancialDocument(text: string, docType: DocType): FinancialFields {
  switch (docType) {
    case "balance_sheet": return { docType, ...extractBalanceSheet(text) };
    case "profit_loss":   return { docType, ...extractProfitLoss(text) };
    case "banking":       return { docType, ...extractBanking(text) };
    case "gstr":          return { docType, ...extractGstr(text) };
    case "itr":           return { docType, ...extractItr(text) };
  }
}
