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

  const inParens = /^\([\d,. ]+\)$/.test(s);

  let cleaned = s
    .replace(/[₹$€£]/g, "")
    .replace(/\bRs\.?\b/gi, "")
    .replace(/\bINR\b/gi, "")
    .replace(/\s/g, "")
    .replace(/\(|\)/g, "");

  cleaned = cleaned.replace(/,/g, "");

  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return inParens ? -Math.abs(val) : val;
}

function extractNumbers(text: string): number[] {
  // Matches: (1,43,827) for negatives  OR  1,43,827  or  1,43,827.00
  // Does NOT use leading minus sign — Indian documents use parentheses for negatives.
  // This avoids false matches in date strings like "31-03-2024" (where -03 is a date separator)
  const pattern = /\([\d,]+(?:\.\d+)?\)|[\d,]+(?:\.\d+)?/g;
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
// KEY FIX: Position-aware extraction
// In two-column Indian balance sheets, a single line may contain BOTH a
// liability label+value AND an asset label+value, e.g.:
//   "SUNDRY CREDITORS   1,43,827   SUNDRY DEBTORS   14,87,380"
//
// Old approach: take LAST number on line → picks 14,87,380 for creditors (WRONG)
// New approach: take the FIRST number that appears AFTER the matched keyword
//               position in the line → picks 1,43,827 for creditors (CORRECT)
//
// Also fixes "CURRENT ASSETS" showing only bank/cash by ALWAYS summing all
// asset components and taking whichever is larger (label vs sum).
// ─────────────────────────────────────────────────────────────────────────────
export function extractWorkingCapitalFromText(text: string): WorkingCapitalData {
  const data: WorkingCapitalData = {};

  const normalized = text.replace(/\t/g, "  ").replace(/ {3,}/g, "   ");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  /**
   * findValue — position-aware extraction
   *
   * For each line that matches a keyword:
   *  1. Find the character position of the matched keyword
   *  2. Extract numbers only from the text AFTER that position
   *  3. Take the FIRST number after the keyword (not the last on the line)
   *
   * This correctly handles two-column PDFs where the same line has
   * "CREDITOR_LABEL  value1   DEBTOR_LABEL  value2"
   */
  const findValue = (
    keywords: string[],
    preferLast = false,
    excludeKeywords: string[] = [],
  ): number | undefined => {
    const candidates: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (excludeKeywords.some((ex) => lower.includes(ex.toLowerCase()))) continue;

      // Find which keyword matched AND its position in the line
      let matchPos = -1;
      let matchLen = 0;
      for (const kw of keywords) {
        const pos = lower.indexOf(kw.toLowerCase());
        if (pos !== -1) {
          matchPos = pos;
          matchLen = kw.length;
          break;
        }
      }
      if (matchPos === -1) continue;

      // ── Position-aware: extract numbers from the text AFTER the keyword ──
      const afterKeyword = line.slice(matchPos + matchLen);
      const numsAfter = extractNumbers(afterKeyword);
      const sigAfter = numsAfter.filter((n) => Math.abs(n) >= 1);

      let val: number | undefined;

      if (sigAfter.length > 0) {
        // First significant number after the keyword = the value for THIS label
        val = sigAfter[0];
      } else if (numsAfter.length > 0) {
        val = numsAfter[0];
      } else {
        // Check next 1–3 lines (values sometimes on the line below in PDFs)
        for (let d = 1; d <= 3; d++) {
          if (i + d >= lines.length) break;
          const nums = extractNumbers(lines[i + d]);
          if (nums.length > 0) {
            val = Math.abs(nums[0]);
            break;
          }
        }
      }

      if (val !== undefined && !isNaN(val)) candidates.push(val);
    }

    if (candidates.length === 0) return undefined;
    return preferLast ? candidates[candidates.length - 1] : candidates[0];
  };

  // ── BALANCE SHEET FIELDS ──────────────────────────────────────────────────

  // --- Individual components (always computed for the sum approach) ---

  // Cash & Bank — exclude overdraft/OD lines which are liabilities, not assets
  const compCash = findValue([
    "bank and cash balance", "bank and cash balances",
    "cash and bank balance", "cash and bank balances", "cash and bank",
    "cash & bank", "cash and cash equivalents",
    "balance with bank", "bank balance", "cash in hand", "cash balance",
  ], false, ["overdraft", "od limit", "cc limit", "od balance", "cash credit"]);

  // Debtors — exclude bad debt provisions which are contra-items
  const compDebtors = findValue([
    "sundry debtors", "trade debtors", "trade receivables",
    "accounts receivable", "book debts",
    "debtors",
  ], false, ["bad debts", "provision for doubtful", "doubtful", "creditors"]);

  const compInventory = findValue([
    "closing stock", "closing inventory", "stock-in-trade",
    "stock in trade", "inventories", "finished goods",
    "raw material stock", "wip stock",
  ]);

  // Advances / Other CA — exclude liability-side loan terms
  const compAdvances = findValue([
    "loans & advances", "loans and advances",
    "tds and tcs receivable", "tds receivable", "tcs receivable",
    "advance to", "prepaid", "other current assets",
  ], false, ["secured loans", "unsecured loans", "term loan", "from bank", "from others", "long term"]);

  // Current Assets: take the MAX of (direct label) vs (sum of components)
  // because proprietary BS often labels "CURRENT ASSETS" for only bank/cash
  // while debtors and loans & advances are listed as separate sections
  const caLabel =
    findValue(["total current assets"], true) ??
    findValue(["net current assets"], true) ??
    findValue(["current assets"], true, ["non-current", "non current", "fixed assets"]);

  const caSum = (compCash || 0) + (compDebtors || 0) + (compInventory || 0) + (compAdvances || 0);

  data.currentAssets = caSum > (caLabel || 0) ? caSum : (caLabel || caSum || undefined);

  // --- Liabilities components ---

  // Creditors — exclude debtors keywords to avoid two-column cross-matches
  const compCreditors = findValue([
    "sundry creditors", "trade creditors",
    "trade payables", "accounts payable",
    "creditors",
  ], false, ["provision", "other payables", "debtors", "receivable"]);

  // Provisions / Other Current Liabilities
  // "OTHER PROVISION B/S" in Kalu Ram BS is the TOTAL; avoid double-counting sub-items
  const compProvisions = findValue([
    "other provision b/s", "other provision",
    "other current liabilities",
    "provisions",
    "accrued liabilities",
  ], false, ["for taxation", "for doubtful"]);

  const compOD = findValue(["bank overdraft", "od payable", "cash credit"]);

  // Salary payable, GST payable — only add if NO consolidated provision total found
  // (avoids adding 1,34,549 + 2,54,263 that are already summed in 7,16,275)
  const compSalaryPayable = compProvisions
    ? undefined
    : findValue(["salary payable", "salaries payable", "wages payable"]);
  const compGstPayable = compProvisions
    ? undefined
    : findValue(["gst payable", "gst liability", "taxes payable"]);
  const compFuelPayable = compProvisions
    ? undefined
    : findValue(["fuel payable", "fuel liability"]);

  const clLabel =
    findValue(["total current liabilities"], true) ??
    findValue(["current liabilities", "current liability"], true, ["non-current", "non current"]);

  const clSum =
    (compCreditors || 0) +
    (compProvisions || 0) +
    (compSalaryPayable || 0) +
    (compGstPayable || 0) +
    (compFuelPayable || 0) +
    (compOD || 0);

  data.currentLiabilities =
    clLabel ??
    (clSum > 0 ? clSum : undefined);

  // Inventory (set individually too)
  data.inventory = compInventory;

  // Debtors
  data.debtors = compDebtors;

  // Creditors
  data.creditors = compCreditors;

  // Cash
  data.cash = compCash;

  // ── P&L FIELDS ────────────────────────────────────────────────────────────

  // Revenue / Sales — try specific labels first, then generic
  data.sales =
    findValue(["net revenue from operations", "revenue from operations"], true) ??
    findValue(["gross receipts", "by gross receipts"], true) ??
    findValue(["net sales", "net turnover"], true) ??
    findValue(["total revenue", "gross revenue", "total income from operations"], true, [
      "other income", "finance income", "cost",
    ]) ??
    findValue(["total income"], true, [
      "other income", "non-operating", "finance income",
    ]) ??
    findValue(["sales"], true, [
      "cost of sales", "cost of goods sold", "cost of revenue",
      "purchase", "return", "other income",
    ]) ??
    findValue(["turnover"], true, ["inventory turnover", "asset turnover"]);

  // COGS — direct label first, then derive from purchases + stock changes
  data.cogs =
    findValue(["cost of goods sold", "cost of goods"], true) ??
    findValue(["cost of sales", "cost of revenue"], true) ??
    findValue(["cost of production", "direct costs", "manufacturing cost"], true) ??
    findValue(["cogs"]);

  // Purchases — used for creditor days and COGS approximation
  data.purchases =
    findValue(["purchases of stock-in-trade", "purchase of stock", "purchases of traded goods"], true) ??
    findValue(["raw material consumed", "material consumed", "raw materials consumed"], true) ??
    findValue(["purchases"], true, ["capital purchase", "asset purchase", "fixed asset"]);

  // Operating Expenses
  data.expenses =
    findValue(["total operating expenses", "total expenses"], true, ["cost of goods", "cost of sales"]) ??
    findValue(["operating expenses", "opex"], true) ??
    findValue(["indirect expenses", "administrative expenses", "general and administrative"], true);

  // Gross Profit (extract directly if available, helps when sales/COGS not explicit)
  const grossProfit =
    findValue(["gross profit"], true, ["gross profit margin", "gross profit %", "gross loss"]);

  // Net Profit — ordered from most specific to generic
  // "To Net Profit" / "To Net Profit c/d" — traditional Indian proprietary P&L
  // "Net Profit Transferred to Capital" — another common proprietary form
  data.netProfit =
    findValue(["profit for the period", "profit for the year"], true) ??
    findValue(["profit after tax (pat)", "profit after tax"], true) ??
    findValue(["net profit after tax"], true) ??
    findValue(["to net profit"], true) ??
    findValue(["net profit transferred to capital", "profit transferred to capital"], true) ??
    findValue(["net profit c/d", "net profit c/o"], true) ??
    findValue(["net profit"], true, ["gross profit", "operating profit", "before tax", "net profit margin"]) ??
    findValue(["net income"], true, ["gross income", "total income"]) ??
    findValue(["profit/(loss) for", "profit / (loss) for"], true) ??
    findValue(["surplus", "surplus for the year"], true, ["deficit", "accumulated"]);

  // Derive COGS from gross profit if not found directly:
  // COGS = Sales - Gross Profit
  if (!data.cogs && data.sales && grossProfit) {
    data.cogs = Math.max(0, data.sales - grossProfit);
  }

  // Derive COGS from purchases if we have opening/closing stock adjustments:
  // COGS ≈ Purchases + Opening Stock - Closing Stock
  // (simplified: if no stock data, use purchases as proxy)
  if (!data.cogs && data.purchases) {
    data.cogs = data.purchases;
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK STATEMENT CSV PARSER
// ─────────────────────────────────────────────────────────────────────────────

const LARGE_TXN_THRESHOLD = 500000;

const KEYWORD_MAPS = {
  upi: ["upi/", "upi-", "upi cr", "upi dr", "phonepe", "gpay", "googlepay",
        "paytm", "bhim", "amazon pay", "airtel money", "@ybl", "@okaxis",
        "@okhdfcbank", "@oksbi", "@axl", "@ptys", "cbdc"],
  rtgsNeft: ["rtgs", "neft", "imps", "inward neft", "outward rtgs",
             "rbi neft", "neft cr", "neft dr", "imps cr", "ft-", "fund transfer"],
  ecs: ["ecs", "nach", "ach d-", "ach cr", "si-", "standing instruction",
        "auto debit", "mandate", "si dr", "nach dr", "direct debit"],
  loan: ["loan repay", "loan emi", "hl emi", "car loan", "home loan",
         "term loan", "emi-", "loan-", "housing loan", "emi repay",
         "loan installment", "lic premium"],
  salary: ["salary", "sal credit", "sal cr", "payroll", "sal-", "wages",
           "staff salary", "employee pay"],
  chequeDeposit: ["clg", "clearing", "chq dep", "cheque dep", "chq cr",
                  "clg cr", "inward clg", "clearing credit"],
  chequeBounce: ["bounce", "returned", "chq ret", "cheque ret",
                 "dishonour", "dishonored", "insufficient", "inward ret",
                 "unpaid chq", "cheque return", "dishonourd"],
  cashDeposit: ["cash dep", "cash deposit", "cash cr", "atm dep",
                "counter dep", "cd-", "cash deposi", "atm deposit", "cash in"],
  cashWithdrawal: ["cash wdl", "cash withdrawal", "atm wd", "atm withdrawal",
                   "cash payment", "cw-", "atm-", "atm cash", "atm dr", "cash dr"],
  interestCredit: ["int cr", "interest cr", "interest credit", "int earned",
                   "savings interest", "fd interest", "interest on deposit",
                   "interest credited"],
  interestDebit: ["int dr", "interest dr", "interest debit", "int charged",
                  "od int dr", "interest on od", "interest on cc",
                  "loan interest", "int on loan"],
  bankCharges: ["sms charges", "maintenance charge", "annual fee",
                "demat charges", "service charge", "bank charge",
                "processing fee", "penalty", "gst charge", "locker charge",
                "dd charges", "chq book", "atm charge", "issuance fee",
                "annual maintenance"],
  gstTax: ["gst", "tds", "tax payment", "income tax", "advance tax",
           "cbdt", "customs duty", "service tax", "itns", "challan"],
  vendor: ["vendor", "supplier", "trade payment", "purchase payment",
           "party payment", "vendor pay"],
  inward: ["inward", "inward rem", "incoming", "transfer in", "fund rcvd",
           "money received", "inward transfer", "foreign inward"],
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
        const amtCol =
          !creditCol && !debitCol
            ? detectColumn(headers, ["amount", "transaction amount", "txn amount"])
            : undefined;
        const typeCol =
          amtCol
            ? detectColumn(headers, ["type", "dr/cr", "cr/dr", "txn type", "transaction type", "debit/credit"])
            : undefined;

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
            } else {
              debit = amt;
            }
          } else if (amtCol) {
            const raw = parseIndianNumber(row[amtCol] ?? "");
            if (raw !== null) {
              if (raw >= 0) credit = raw; else debit = Math.abs(raw);
            }
          }

          const rawBal = balCol ? parseIndianNumber(row[balCol] ?? "") : null;
          const bal = rawBal !== null ? rawBal : 0;
          if (bal !== 0 || balances.length > 0) balances.push(bal);
          if (bal < 0) overdraftUsage += Math.abs(bal);
          if (credit > LARGE_TXN_THRESHOLD || debit > LARGE_TXN_THRESHOLD) largeTransactions++;

          totalCredits += credit;
          totalDebits  += debit;

          const d = desc;
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
// BANK STATEMENT TEXT PARSER (PDF-extracted format)
// Handles HDFC, SBI, ICICI, Axis multi-line narration format
// ─────────────────────────────────────────────────────────────────────────────

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
    totalCredits: 0, totalDebits: 0,
    cashDeposits: 0, cashWithdrawals: 0,
    chequeDeposits: 0, chequeReturns: 0,
    ecsEmiPayments: 0, loanRepayments: 0,
    interestCredits: 0, interestDebits: 0,
    bankCharges: 0, upiTransactions: 0,
    rtgsNeftTransfers: 0, salaryCredits: 0,
    largeTransactions: 0,
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

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

  data.openingBalance = findSummary(["opening balance", "op bal", "op. balance", "balance b/f", "balance b/d"]);
  data.closingBalance = findSummary(["closing balance", "cl bal", "cl. balance", "balance c/f", "balance c/d"]);
  data.totalCredits   = findSummary(["total credits", "total cr", "total deposits", "total deposit"]);
  data.totalDebits    = findSummary(["total debits", "total dr", "total withdrawals", "total withdrawal"]);
  data.averageBalance = findSummary(["average balance", "avg balance", "avg bal", "average monthly balance"]);
  data.minimumBalance = findSummary(["minimum balance", "min balance", "min bal", "minimum monthly balance"]);
  data.overdraftUsage = findSummary(["overdraft", "od utilisation", "od limit used", "od availed"]);
  data.loanRepayments = findSummary(["loan repayment", "emi repaid", "loan emi"]);
  data.bankCharges    = findSummary(["bank charges", "service charges", "total charges"]);

  // Transaction-level parsing via balance-difference method
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

  const balances: number[] = [];
  if (data.openingBalance) balances.push(data.openingBalance);

  if (headerIdx >= 0) {
    const datePattern = /^\d{2}\/\d{2}\/\d{2,4}/;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (
        lower.includes("page no") || lower.includes("hdfc bank") ||
        lower.includes("registered office") || lower.includes("state account") ||
        lower.includes("contents of this") || lower.includes("account branch") ||
        lower.includes("from :") || lower.includes("statement of account")
      ) continue;

      if (!datePattern.test(line)) continue;

      const nums = extractNumbers(line);
      const amounts = nums.filter((n) => n >= 0.01 && n < 1e10);

      if (amounts.length >= 2) {
        const closingBal = amounts[amounts.length - 1];
        balances.push(closingBal);

        if (balances.length >= 2) {
          const prevBal = balances[balances.length - 2];
          const diff = closingBal - prevBal;
          const narration = line + (i + 1 < lines.length ? " " + lines[i + 1] : "");

          if (diff > 0) {
            const credit = Math.abs(diff);
            data.totalCredits! += credit;
            if (TEXT_NARRATION_PATTERNS.upi.test(narration)) data.upiTransactions! += credit;
            else if (TEXT_NARRATION_PATTERNS.neft.test(narration) || TEXT_NARRATION_PATTERNS.imps.test(narration)) data.rtgsNeftTransfers! += credit;
            else if (TEXT_NARRATION_PATTERNS.salary.test(narration)) data.salaryCredits! += credit;
            else if (TEXT_NARRATION_PATTERNS.chequeClr.test(narration)) data.chequeDeposits! += credit;
            else if (TEXT_NARRATION_PATTERNS.cashDep.test(narration)) data.cashDeposits! += credit;
            if (credit >= LARGE_TXN_THRESHOLD) data.largeTransactions!++;
          } else if (diff < 0) {
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

  if (balances.length > 0) {
    if (!data.openingBalance) data.openingBalance = balances[0];
    if (!data.closingBalance)  data.closingBalance  = balances[balances.length - 1];
    if (!data.minimumBalance)  data.minimumBalance  = Math.min(...balances);
    if (!data.averageBalance)  data.averageBalance  = Math.round(
      balances.reduce((a, b) => a + b, 0) / balances.length
    );
    const negBals = balances.filter(b => b < 0);
    if (!data.overdraftUsage && negBals.length > 0) {
      data.overdraftUsage = Math.abs(Math.min(...negBals));
    }
  }

  // Round all computed totals
  if (data.totalCredits) data.totalCredits = Math.round(data.totalCredits);
  if (data.totalDebits)  data.totalDebits  = Math.round(data.totalDebits);

  data.transactionFrequency = balances.length > 0 ? balances.length - 1 : 0;

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect format and dispatch to right parser
// ─────────────────────────────────────────────────────────────────────────────
export async function parseBankFile(file: File): Promise<Partial<BankingData>> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) return parseBankingCsv(file);

  const { extractTextFromFile } = await import("./fileReader");
  const text = await extractTextFromFile(file);

  const firstFewLines = text.split("\n").slice(0, 5).join("\n");
  const commaCount = (firstFewLines.match(/,/g) || []).length;
  const hasCsvHeader =
    commaCount >= 5 &&
    (firstFewLines.toLowerCase().includes("date") ||
     firstFewLines.toLowerCase().includes("narration") ||
     firstFewLines.toLowerCase().includes("debit") ||
     firstFewLines.toLowerCase().includes("credit"));

  if (hasCsvHeader) {
    const csvBlob = new File([text], "statement.csv", { type: "text/csv" });
    return parseBankingCsv(csvBlob);
  }

  return parseTextBankStatement(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-detect and parse Balance Sheet / P&L
// ─────────────────────────────────────────────────────────────────────────────
export async function parseFinancialFile(file: File): Promise<WorkingCapitalData> {
  const { extractTextFromFile } = await import("./fileReader");
  const text = await extractTextFromFile(file);
  return extractWorkingCapitalFromText(text);
}

export function parseFinancialText(text: string): WorkingCapitalData {
  return extractWorkingCapitalFromText(text);
}
