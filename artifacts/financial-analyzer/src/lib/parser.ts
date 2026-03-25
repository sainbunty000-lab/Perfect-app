import Papa from "papaparse";

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

export interface BankingData {
  openingBalance?: number;
  closingBalance?: number;
  cashDeposits?: number;
  cashWithdrawals?: number;
  chequeDeposits?: number;
  chequeReturns?: number;
  ecsEmiPayments?: number;
  loanRepayments?: number;
  interestCredits?: number;
  interestDebits?: number;
  bankCharges?: number;
  averageBalance?: number;
  minimumBalance?: number;
  overdraftUsage?: number;
  transactionFrequency?: number;
  largeTransactions?: number;
  inwardRemittances?: number;
  outwardPayments?: number;
  salaryCredits?: number;
  vendorPayments?: number;
  gstTaxPayments?: number;
  upiTransactions?: number;
  rtgsNeftTransfers?: number;
  totalCredits?: number;
  totalDebits?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Number Parsing
// Handles: 1,23,456  /  1,23,456.00  /  (12,345) = negative  /  -12,345
// ─────────────────────────────────────────────────────────────────────────────
function parseIndianNumber(raw: string): number | null {
  if (!raw) return null;
  const s = raw.trim();

  // Parentheses notation → negative: (12,345) or (12,345.00)
  const inParens = /^\([\d,. ]+\)$/.test(s);

  // Strip currency symbols, INR, Rs, ₹, parentheses, spaces
  let cleaned = s
    .replace(/[₹$€£]/g, "")
    .replace(/\bRs\.?\b/gi, "")
    .replace(/\bINR\b/gi, "")
    .replace(/\s/g, "")
    .replace(/\(|\)/g, "");

  // Remove ALL commas (handles both 1,23,456 and 1,234,567)
  cleaned = cleaned.replace(/,/g, "");

  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return inParens ? -Math.abs(val) : val;
}

// Extract all numbers from a string (handles Indian format + parens)
function extractNumbers(text: string): number[] {
  // Match: (1,23,456.00) or -1,23,456.00 or 1,23,456.00
  const pattern = /\([\d,]+(?:\.\d+)?\)|-?[\d,]+(?:\.\d+)?/g;
  const results: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const v = parseIndianNumber(m[0]);
    if (v !== null && !isNaN(v)) results.push(v);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE SHEET & P&L TEXT PARSER
//
// Real Indian financial statements come in many formats:
// 1. Companies Act Schedule III  →  "Total Current Assets" as a summary line
// 2. Proprietary/Partnership BS  →  Items listed individually, no summary line
// 3. Trading & P&L Account       →  "By Gross Receipts", "To Net Profit" etc.
// 4. Statement of Accounts       →  Combined income/expense with "By"/"To" prefix
//
// Strategy:
//  - Try most specific / longest keyword match first
//  - Check same line (rightmost significant number = value in right-aligned tables)
//  - Check next 1–3 lines (values often follow label in PDF extraction)
//  - For "total" lines use LAST match (totals appear after sub-items)
//  - For items without "total" use FIRST match
// ─────────────────────────────────────────────────────────────────────────────
export function extractWorkingCapitalFromText(text: string): WorkingCapitalData {
  const data: WorkingCapitalData = {};

  // Normalize: collapse multiple spaces, remove tab chars
  const normalized = text.replace(/\t/g, "  ").replace(/ {3,}/g, "   ");

  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  /**
   * findValue - core extraction function
   * @param keywords       Ordered list of phrases to look for (case-insensitive)
   * @param preferLast     Return the LAST candidate (useful for "total" lines)
   * @param excludeKeywords Skip lines containing these phrases
   * @param prefixFilter   Only match lines starting with this prefix (e.g. "by ", "to ")
   */
  const findValue = (
    keywords: string[],
    preferLast = false,
    excludeKeywords: string[] = [],
    prefixFilter?: string
  ): number | undefined => {
    const candidates: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // Prefix filter (e.g. lines starting with "by " in P&L credit side)
      if (prefixFilter && !lower.startsWith(prefixFilter.toLowerCase())) {
        // Also allow "   by gross receipts" (indented)
        if (!lower.includes(prefixFilter.toLowerCase())) continue;
      }

      // Skip exclusion keywords
      if (excludeKeywords.some((ex) => lower.includes(ex.toLowerCase()))) continue;

      // Check if any keyword matches
      const matched = keywords.some((kw) => lower.includes(kw.toLowerCase()));
      if (!matched) continue;

      // Extract numbers from current line
      const numsOnLine = extractNumbers(line);

      // Also check next 1–3 lines (PDF text extraction often splits value to next line)
      const nextLines = [1, 2, 3]
        .map((d) => (i + d < lines.length ? lines[i + d] : ""))
        .filter(Boolean);

      let val: number | undefined;

      if (numsOnLine.length > 0) {
        // Use rightmost significant number (right-aligned accounting tables)
        const sig = numsOnLine.filter((n) => Math.abs(n) >= 1);
        val = sig.length > 0 ? sig[sig.length - 1] : numsOnLine[numsOnLine.length - 1];
      } else {
        // Look in next lines
        for (const nl of nextLines) {
          const nums = extractNumbers(nl);
          if (nums.length > 0) {
            val = Math.abs(nums[0]);
            break;
          }
        }
      }

      if (val !== undefined && !isNaN(val)) {
        candidates.push(val);
      }
    }

    if (candidates.length === 0) return undefined;
    return preferLast ? candidates[candidates.length - 1] : candidates[0];
  };

  // ── BALANCE SHEET FIELDS ────────────────────────────────────────────────────

  // Current Assets
  // Try totals first (more specific), then individual labels
  data.currentAssets =
    findValue(["total current assets"], true) ??
    findValue(["net current assets"], true) ??
    findValue(["current assets", "ca "], true, [
      "non-current", "non current", "fixed assets", "nca",
    ]);

  // If current assets still not found, try summing components
  // (for proprietary balance sheets that don't have a "Total CA" line)
  if (!data.currentAssets) {
    const cash   = findValue(["bank and cash", "cash & bank", "cash and bank", "bank balance", "cash in hand", "cash equivalents"]);
    const drs    = findValue(["sundry debtors", "trade receivables", "accounts receivable", "book debts", "debtors"]);
    const inv    = findValue(["closing stock", "inventories", "inventory", "stock-in-trade"]);
    const adv    = findValue(["loans & advances", "loans and advances", "advance to", "prepaid", "other current assets", "tds receivable", "tcs receivable"]);
    if (cash || drs || inv) {
      data.currentAssets = (cash || 0) + (drs || 0) + (inv || 0) + (adv || 0);
    }
  }

  // Current Liabilities
  data.currentLiabilities =
    findValue(["total current liabilities"], true) ??
    findValue(["current liabilities", "current liability"], true, [
      "non-current", "non current",
    ]);

  // If not found, sum creditors + provisions (proprietary balance sheets)
  if (!data.currentLiabilities) {
    const cr    = findValue(["sundry creditors", "trade payables", "accounts payable", "creditors"]);
    const prov  = findValue(["other provision", "other current liabilities", "salary payable", "gst payable", "provisions", "accrued liabilities"]);
    const od    = findValue(["bank overdraft", "od payable", "cash credit"]);
    if (cr) {
      data.currentLiabilities = (cr || 0) + (prov || 0) + (od || 0);
    }
  }

  // Inventory
  data.inventory =
    findValue(["closing stock", "closing inventory"]) ??
    findValue(["stock-in-trade", "stock in trade"]) ??
    findValue(["inventories", "finished goods", "raw material stock", "wip stock"], true) ??
    findValue(["inventory"], true, ["plant", "equipment", "fixed"]);

  // Debtors / Accounts Receivable
  data.debtors =
    findValue(["sundry debtors"]) ??        // Most common in Indian BS
    findValue(["trade debtors"]) ??
    findValue(["trade receivables"]) ??
    findValue(["accounts receivable"]) ??
    findValue(["book debts"]) ??
    findValue(["debtors"], false, ["bad debts", "provision for doubtful", "doubtful"]);

  // Creditors / Accounts Payable
  data.creditors =
    findValue(["sundry creditors"]) ??      // Most common in Indian BS
    findValue(["trade creditors"]) ??
    findValue(["trade payables"]) ??
    findValue(["accounts payable"]) ??
    findValue(["creditors"], false, ["provision", "other payables"]);

  // Cash & Bank Balance
  data.cash =
    findValue(["bank and cash balances", "bank and cash balance"]) ??
    findValue(["cash and bank balances", "cash and bank balance", "cash and bank"]) ??
    findValue(["cash & bank balances", "cash & bank"]) ??
    findValue(["cash and cash equivalents"]) ??
    findValue(["balance with bank", "bank balance"]) ??
    findValue(["cash in hand"]) ??
    findValue(["cash balance"]);

  // ── P&L / INCOME STATEMENT FIELDS ────────────────────────────────────────

  // Revenue / Sales
  // Real Indian formats: "By Gross Receipts", "Net Revenue from Operations",
  //                      "Net Sales", "Turnover", "Revenue from Operations"
  data.sales =
    findValue(["net revenue from operations", "revenue from operations"], true) ??
    findValue(["gross receipts"], true) ??          // Proprietor P&L: "By Gross Receipts"
    findValue(["by gross receipts"], true) ??        // Explicit "By" prefix format
    findValue(["net sales", "net turnover"], true) ??
    findValue(["total revenue", "gross revenue", "total income from operations"], true, [
      "other income", "finance income", "cost",
    ]) ??
    findValue(["sales"], true, [
      "cost of sales", "cost of goods sold", "cost of revenue",
      "purchase", "return", "other income",
    ]) ??
    findValue(["turnover"], true, ["inventory turnover", "asset turnover"]);

  // COGS
  data.cogs =
    findValue(["cost of goods sold", "cost of goods"], true) ??
    findValue(["cost of sales", "cost of revenue"], true) ??
    findValue(["cost of production", "direct costs", "manufacturing cost"], true) ??
    findValue(["cogs"]);

  // Purchases
  data.purchases =
    findValue(["purchases of stock-in-trade", "purchase of stock", "purchases of traded goods"], true) ??
    findValue(["raw material consumed", "material consumed", "raw materials consumed"], true) ??
    findValue(["purchases"], true, ["capital purchase", "asset purchase", "fixed asset"]);

  // Operating Expenses / Total Expenses
  data.expenses =
    findValue(["total operating expenses", "total expenses"], true, ["cost of goods", "cost of sales"]) ??
    findValue(["operating expenses", "opex"], true) ??
    findValue(["indirect expenses", "administrative expenses", "general expenses"], true);

  // Net Profit
  // Formats: "To Net Profit", "Profit after Tax", "Net Profit", "PAT"
  data.netProfit =
    findValue(["profit for the period", "profit for the year"], true) ??
    findValue(["profit after tax (pat)", "profit after tax"], true) ??
    findValue(["net profit after tax"], true) ??
    findValue(["to net profit"], true) ??           // Proprietary P&L: "To Net Profit"
    findValue(["net profit"], true, ["gross profit", "operating profit", "before tax"]) ??
    findValue(["net income"], true, ["gross"]) ??
    findValue(["profit/(loss) for", "profit / (loss) for"], true);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK STATEMENT CSV PARSER
// Handles multiple bank CSV formats (HDFC, SBI, ICICI, Axis, etc.)
// ─────────────────────────────────────────────────────────────────────────────

const LARGE_TXN_THRESHOLD = 500000; // ₹5 Lakh

// Transaction classification keyword maps
// Based on real Indian bank statement narration formats
const KEYWORD_MAPS = {
  // UPI transactions (very common)
  upi: ["upi/", "upi-", "upi cr", "upi dr", "phonepe", "gpay", "googlepay",
        "paytm", "bhim", "amazon pay", "airtel money", "@ybl", "@okaxis",
        "@okhdfcbank", "@oksbi", "@axl", "@ptys", "cbdc"],

  // RTGS / NEFT / IMPS transfers
  rtgsNeft: ["rtgs", "neft", "imps", "inward neft", "outward rtgs",
             "rbi neft", "neft cr", "neft dr", "imps cr", "ft-", "fund transfer"],

  // ECS / NACH / EMI auto-debits
  ecs: ["ecs", "nach", "ach d-", "ach cr", "si-", "standing instruction",
        "auto debit", "mandate", "si dr", "nach dr", "direct debit"],

  // Loan repayments
  loan: ["loan repay", "loan emi", "hl emi", "car loan", "home loan",
         "term loan", "emi-", "loan-", "housing loan", "emi repay",
         "loan installment", "lic premium"],

  // Salary credits
  salary: ["salary", "sal credit", "sal cr", "payroll", "sal-", "wages",
           "staff salary", "employee pay"],

  // Cheque clearing deposits (inward clearing)
  chequeDeposit: ["clg", "clearing", "chq dep", "cheque dep", "chq cr",
                  "clg cr", "inward clg", "clearing credit"],

  // Cheque returns / bounces
  chequeBounce: ["bounce", "returned", "chq ret", "cheque ret",
                 "dishonour", "dishonored", "insufficient", "inward ret",
                 "unpaid chq", "cheque return", "dishonourd"],

  // Cash deposits
  cashDeposit: ["cash dep", "cash deposit", "cash cr", "atm dep",
                "counter dep", "cd-", "cash deposi", "atm deposit",
                "cash in"],

  // Cash withdrawals / ATM
  cashWithdrawal: ["cash wdl", "cash withdrawal", "atm wd", "atm withdrawal",
                   "cash payment", "cw-", "atm-", "atm cash", "atm dr",
                   "cash dr"],

  // Interest credits (received by customer)
  interestCredit: ["int cr", "interest cr", "interest credit", "int earned",
                   "savings interest", "fd interest", "interest on deposit",
                   "interest credited"],

  // Interest debits (charged to customer — OD/loan interest)
  interestDebit: ["int dr", "interest dr", "interest debit", "int charged",
                  "od int dr", "interest on od", "interest on cc",
                  "loan interest", "int on loan"],

  // Bank service charges / fees
  bankCharges: ["sms charges", "maintenance charge", "annual fee",
                "demat charges", "service charge", "bank charge",
                "processing fee", "penalty", "gst charge", "locker charge",
                "dd charges", "chq book", "atm charge", "issuance fee",
                "annual maintenance"],

  // GST / Tax payments
  gstTax: ["gst", "tds", "tax payment", "income tax", "advance tax",
           "cbdt", "customs duty", "service tax", "itns", "challan",
           "gst payable", "tds payable"],

  // Vendor / supplier payments
  vendor: ["vendor", "supplier", "trade payment", "purchase payment",
           "party payment", "vendor pay"],

  // Inward remittances / transfers in
  inward: ["inward", "inward rem", "incoming", "transfer in", "fund rcvd",
           "money received", "inward transfer", "foreign inward"],

  // Outward payments / transfers out
  outward: ["outward", "outward rem", "outgoing", "transfer out",
            "payment to", "outward transfer"],
};

function descriptionMatches(desc: string, keywords: string[]): boolean {
  const lower = desc.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function detectColumn(headers: string[], candidates: string[]): string | undefined {
  return headers.find((h) =>
    candidates.some((c) => h.toLowerCase().trim().includes(c.toLowerCase()))
  );
}

function toNum(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const v = parseIndianNumber(String(val));
  return v !== null && !isNaN(v) ? Math.abs(v) : 0;
}

export function parseBankingCsv(file: File): Promise<BankingData> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/\*/g, ""),
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          reject(new Error("No data found in CSV"));
          return;
        }

        const headers = Object.keys(results.data[0]);

        // ── Column Detection (handles many bank formats) ─────────────────
        const creditCol = detectColumn(headers, [
          "credit", "credits", "deposit", "deposits", "cr amount",
          "credit amount", "cr amt", "deposit amt", "deposit amount",
          "money in", "amount cr",
        ]);
        const debitCol = detectColumn(headers, [
          "debit", "debits", "withdrawal", "withdrawals", "dr amount",
          "debit amount", "dr amt", "withdrawal amt", "withdrawal amount",
          "money out", "amount dr",
        ]);
        const balCol = detectColumn(headers, [
          "balance", "closing balance", "running balance", "bal",
          "closing bal", "available balance",
        ]);
        const descCol = detectColumn(headers, [
          "description", "particulars", "narration", "remarks",
          "transaction details", "details", "transaction narration",
          "transaction remark", "narration/chq. no.",
        ]);
        // Single amount column fallback (some banks have one signed amount column)
        const amtCol =
          !creditCol && !debitCol
            ? detectColumn(headers, ["amount", "transaction amount", "txn amount"])
            : undefined;
        const typeCol =
          amtCol
            ? detectColumn(headers, ["type", "dr/cr", "cr/dr", "txn type", "transaction type", "debit/credit"])
            : undefined;

        // ── Accumulators ─────────────────────────────────────────────────
        let totalCredits = 0, totalDebits = 0;
        let cashDeposits = 0, cashWithdrawals = 0;
        let chequeDeposits = 0, chequeReturns = 0;
        let ecsEmiPayments = 0, loanRepayments = 0;
        let interestCredits = 0, interestDebits = 0;
        let bankCharges = 0;
        let inwardRemittances = 0, outwardPayments = 0;
        let salaryCredits = 0, vendorPayments = 0;
        let gstTaxPayments = 0;
        let upiTransactions = 0, rtgsNeftTransfers = 0;
        let largeTransactions = 0, overdraftUsage = 0;

        const balances: number[] = [];

        results.data.forEach((row) => {
          const desc = descCol ? (row[descCol] ?? "") : "";

          let credit = 0, debit = 0;

          if (creditCol || debitCol) {
            credit = toNum(creditCol ? row[creditCol] : undefined);
            debit  = toNum(debitCol  ? row[debitCol]  : undefined);
          } else if (amtCol && typeCol) {
            const amt  = Math.abs(toNum(row[amtCol]));
            const type = (row[typeCol] ?? "").toLowerCase().trim();
            if (["cr", "credit", "c", "in", "deposit"].some(t => type === t || type.startsWith(t))) {
              credit = amt;
            } else if (["dr", "debit", "d", "out", "withdrawal"].some(t => type === t || type.startsWith(t))) {
              debit = amt;
            }
          } else if (amtCol) {
            const raw = parseIndianNumber(row[amtCol] ?? "");
            if (raw !== null) {
              if (raw >= 0) credit = raw; else debit = Math.abs(raw);
            }
          }

          // Balance
          const rawBal = balCol ? parseIndianNumber(row[balCol] ?? "") : null;
          const bal = rawBal !== null ? rawBal : 0;
          if (bal !== 0 || balances.length > 0) balances.push(bal);

          // Overdraft detection (negative balance)
          if (bal < 0) overdraftUsage += Math.abs(bal);

          // Large transactions
          if (credit > LARGE_TXN_THRESHOLD || debit > LARGE_TXN_THRESHOLD) {
            largeTransactions++;
          }

          totalCredits += credit;
          totalDebits  += debit;

          // ── Classify by description ───────────────────────────────────
          const d = desc; // original case for matching

          if (descriptionMatches(d, KEYWORD_MAPS.salary))        salaryCredits    += credit;
          if (descriptionMatches(d, KEYWORD_MAPS.ecs))           ecsEmiPayments   += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.loan))          loanRepayments   += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.chequeDeposit)) chequeDeposits   += credit;
          if (descriptionMatches(d, KEYWORD_MAPS.chequeBounce))  chequeReturns++;
          if (descriptionMatches(d, KEYWORD_MAPS.cashDeposit))   cashDeposits     += credit;
          if (descriptionMatches(d, KEYWORD_MAPS.cashWithdrawal))cashWithdrawals  += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.interestCredit))interestCredits  += credit;
          if (descriptionMatches(d, KEYWORD_MAPS.interestDebit)) interestDebits   += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.bankCharges))   bankCharges      += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.upi))           upiTransactions  += credit > 0 ? credit : debit;
          if (descriptionMatches(d, KEYWORD_MAPS.rtgsNeft))      rtgsNeftTransfers+= credit > 0 ? credit : debit;
          if (descriptionMatches(d, KEYWORD_MAPS.gstTax))        gstTaxPayments   += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.vendor))        vendorPayments   += debit;
          if (descriptionMatches(d, KEYWORD_MAPS.inward))        inwardRemittances+= credit;
          if (descriptionMatches(d, KEYWORD_MAPS.outward))       outwardPayments  += debit;
        });

        // ── Balance Stats ─────────────────────────────────────────────────
        const openingBalance = balances.length > 0 ? balances[0] : 0;
        const closingBalance = balances.length > 0 ? balances[balances.length - 1] : 0;
        const minimumBalance = balances.length > 0 ? Math.min(...balances) : 0;
        const averageBalance =
          balances.length > 0 ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;

        resolve({
          openingBalance:    Math.round(openingBalance),
          closingBalance:    Math.round(closingBalance),
          cashDeposits:      Math.round(cashDeposits),
          cashWithdrawals:   Math.round(cashWithdrawals),
          chequeDeposits:    Math.round(chequeDeposits),
          chequeReturns,
          ecsEmiPayments:    Math.round(ecsEmiPayments),
          loanRepayments:    Math.round(loanRepayments),
          interestCredits:   Math.round(interestCredits),
          interestDebits:    Math.round(interestDebits),
          bankCharges:       Math.round(bankCharges),
          averageBalance:    Math.round(averageBalance),
          minimumBalance:    Math.round(minimumBalance),
          overdraftUsage:    Math.round(overdraftUsage),
          transactionFrequency: results.data.length,
          largeTransactions,
          inwardRemittances: Math.round(inwardRemittances),
          outwardPayments:   Math.round(outwardPayments),
          salaryCredits:     Math.round(salaryCredits),
          vendorPayments:    Math.round(vendorPayments),
          gstTaxPayments:    Math.round(gstTaxPayments),
          upiTransactions:   Math.round(upiTransactions),
          rtgsNeftTransfers: Math.round(rtgsNeftTransfers),
          totalCredits:      Math.round(totalCredits),
          totalDebits:       Math.round(totalDebits),
        });
      },
      error: (err) => reject(err),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK STATEMENT TEXT PARSER (PDF-extracted text format)
// Handles HDFC, SBI, ICICI, Axis, PNB multi-line narration format
//
// Real HDFC text format:
//   Date | Narration | Ref No | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance
//
// Key challenge: narrations span multiple lines in PDF extraction
// Strategy: detect header row, then parse each transaction block
// ─────────────────────────────────────────────────────────────────────────────

// Bank-specific narration patterns for text statements
const TEXT_NARRATION_PATTERNS = {
  upi:          /\bupi[-/]/i,
  imps:         /\bimps[-/]/i,
  neft:         /\bneft\b/i,
  rtgs:         /\brtgs\b/i,
  ach:          /\bach [dc][-/]|\bnach\b|\becs\b/i,
  chequeClr:    /\bclg\b|\bclearing\b|\bchq\b/i,
  chequeBounce: /\bbounce\b|\breturned\b|\bdishonour/i,
  cashDep:      /cash dep|atm dep|cd-/i,
  cashWdl:      /cash wdl|atm wd|atm-/i,
  salary:       /salary|payroll|sal cr/i,
  interest:     /int cr|int dr|interest/i,
  ft:           /\bft-\b|\bfund transfer\b/i,
  cbdc:         /\bcbdc\b/i,
};

function parseTextBankStatement(text: string): Partial<BankingData> {
  const data: Partial<BankingData> = {
    totalCredits: 0,
    totalDebits: 0,
    cashDeposits: 0,
    cashWithdrawals: 0,
    chequeDeposits: 0,
    chequeReturns: 0,
    ecsEmiPayments: 0,
    loanRepayments: 0,
    interestCredits: 0,
    interestDebits: 0,
    bankCharges: 0,
    upiTransactions: 0,
    rtgsNeftTransfers: 0,
    salaryCredits: 0,
    largeTransactions: 0,
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ── Method 1: Look for labeled totals (summary section in statement) ──
  const findSummary = (keywords: string[]): number | undefined => {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        const nums = extractNumbers(lines[i]);
        const pos = nums.filter((n) => n > 0);
        if (pos.length > 0) return pos[pos.length - 1];
        if (i + 1 < lines.length) {
          const nNums = extractNumbers(lines[i + 1]);
          if (nNums.length > 0) return Math.abs(nNums[0]);
        }
      }
    }
    return undefined;
  };

  data.openingBalance   = findSummary(["opening balance", "op bal", "op. balance", "balance b/f", "balance b/d"]);
  data.closingBalance   = findSummary(["closing balance", "cl bal", "cl. balance", "balance c/f", "balance c/d"]);
  data.totalCredits     = findSummary(["total credits", "total cr", "total deposits", "total deposit"]);
  data.totalDebits      = findSummary(["total debits", "total dr", "total withdrawals", "total withdrawal"]);
  data.averageBalance   = findSummary(["average balance", "avg balance", "avg bal", "average monthly balance"]);
  data.minimumBalance   = findSummary(["minimum balance", "min balance", "min bal", "minimum monthly balance"]);
  data.overdraftUsage   = findSummary(["overdraft", "od utilisation", "od limit used", "od availed"]);
  data.loanRepayments   = findSummary(["loan repayment", "emi repaid", "loan emi"]);
  data.bankCharges      = findSummary(["bank charges", "service charges", "total charges"]);

  // ── Method 2: Transaction-level parsing ───────────────────────────────
  // Look for rows that have amounts in withdrawal/deposit columns
  // HDFC format: Date ... Withdrawal Amt. ... Deposit Amt. ... Closing Balance
  // Pattern: detect header row with "withdrawal" and "deposit" or similar
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      (lower.includes("withdrawal") || lower.includes("debit")) &&
      (lower.includes("deposit") || lower.includes("credit")) &&
      (lower.includes("balance") || lower.includes("narration"))
    ) {
      headerIdx = i;
      break;
    }
  }

  // If header found, try to parse transactions
  const balances: number[] = [];

  if (data.openingBalance) balances.push(data.openingBalance);

  if (headerIdx >= 0) {
    // Parse lines after header looking for transaction amounts
    // HDFC: amount patterns are large numbers. Date is DD/MM/YY format.
    const datePattern = /^\d{2}\/\d{2}\/\d{2,4}/;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // Skip page headers, footers, bank metadata
      if (
        lower.includes("page no") ||
        lower.includes("hdfc bank") ||
        lower.includes("registered office") ||
        lower.includes("state account") ||
        lower.includes("contents of this") ||
        lower.includes("account branch") ||
        lower.includes("from :") ||
        lower.includes("statement of account")
      ) continue;

      // A transaction line starts with a date
      const isDateLine = datePattern.test(line);

      if (isDateLine) {
        const nums = extractNumbers(line);

        // For HDFC text: date line has ref no (long digit string) + amounts
        // Filter: transaction amounts are usually > 1 (exclude ref numbers which are huge)
        // Closing balance is the LAST significant number on the line
        const amounts = nums.filter((n) => n >= 0.01 && n < 1e10);

        if (amounts.length >= 2) {
          // Last number = closing balance
          const closingBal = amounts[amounts.length - 1];
          balances.push(closingBal);

          // Try to detect if it's a debit or credit
          // If balance increased → credit; if decreased → debit
          if (balances.length >= 2) {
            const prevBal = balances[balances.length - 2];
            const diff = closingBal - prevBal;
            const narration = line + (i + 1 < lines.length ? " " + lines[i + 1] : "");

            if (diff > 0) {
              // Credit transaction
              const credit = Math.abs(diff);
              data.totalCredits! += credit;

              if (TEXT_NARRATION_PATTERNS.upi.test(narration)) data.upiTransactions! += credit;
              else if (TEXT_NARRATION_PATTERNS.neft.test(narration) || TEXT_NARRATION_PATTERNS.imps.test(narration)) data.rtgsNeftTransfers! += credit;
              else if (TEXT_NARRATION_PATTERNS.salary.test(narration)) data.salaryCredits! += credit;
              else if (TEXT_NARRATION_PATTERNS.chequeClr.test(narration)) data.chequeDeposits! += credit;
              else if (TEXT_NARRATION_PATTERNS.cashDep.test(narration)) data.cashDeposits! += credit;
              else if (TEXT_NARRATION_PATTERNS.interest.test(narration) && /int cr|interest cr/i.test(narration)) data.interestCredits! += credit;

              if (credit >= LARGE_TXN_THRESHOLD) data.largeTransactions!++;
            } else if (diff < 0) {
              // Debit transaction
              const debit = Math.abs(diff);
              data.totalDebits! += debit;

              if (TEXT_NARRATION_PATTERNS.upi.test(narration)) data.upiTransactions! += debit;
              else if (TEXT_NARRATION_PATTERNS.ach.test(narration)) data.ecsEmiPayments! += debit;
              else if (TEXT_NARRATION_PATTERNS.cashWdl.test(narration)) data.cashWithdrawals! += debit;
              else if (TEXT_NARRATION_PATTERNS.interest.test(narration)) data.interestDebits! += debit;
              else if (TEXT_NARRATION_PATTERNS.chequeBounce.test(narration)) data.chequeReturns!++;

              if (debit >= LARGE_TXN_THRESHOLD) data.largeTransactions!++;
            }
          }
        }
      }
    }
  }

  // Compute balance stats from collected balances
  if (balances.length > 0) {
    if (!data.openingBalance) data.openingBalance = balances[0];
    if (!data.closingBalance)  data.closingBalance  = balances[balances.length - 1];
    if (!data.minimumBalance)  data.minimumBalance  = Math.min(...balances);
    if (!data.averageBalance)  data.averageBalance  = Math.round(
      balances.reduce((a, b) => a + b, 0) / balances.length
    );
    // Check for overdraft
    const negBals = balances.filter(b => b < 0);
    if (!data.overdraftUsage && negBals.length > 0) {
      data.overdraftUsage = Math.abs(Math.min(...negBals));
    }
  }

  data.transactionFrequency = balances.length > 0 ? balances.length - 1 : 0;

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect format and dispatch to right parser
// ─────────────────────────────────────────────────────────────────────────────
export async function parseBankFile(file: File): Promise<Partial<BankingData>> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return parseBankingCsv(file);
  }

  const text = await file.text();

  // Detect CSV-like structure: header row with commas
  const firstFewLines = text.split("\n").slice(0, 5).join("\n");
  const commaCount = (firstFewLines.match(/,/g) || []).length;
  const hasCsvHeader =
    commaCount >= 5 &&
    (firstFewLines.toLowerCase().includes("date") ||
     firstFewLines.toLowerCase().includes("narration") ||
     firstFewLines.toLowerCase().includes("debit") ||
     firstFewLines.toLowerCase().includes("credit"));

  if (hasCsvHeader) {
    // Parse as CSV via blob
    const csvBlob = new File([text], "statement.csv", { type: "text/csv" });
    return parseBankingCsv(csvBlob);
  }

  // Plain text / PDF-extracted text
  return parseTextBankStatement(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect and parse Balance Sheet / P&L
// ─────────────────────────────────────────────────────────────────────────────
export async function parseFinancialFile(file: File): Promise<WorkingCapitalData> {
  const text = await file.text();
  return extractWorkingCapitalFromText(text);
}
