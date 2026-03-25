import { Router, type IRouter } from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const geminiApiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "placeholder";

const ai = new GoogleGenAI({
  apiKey: geminiApiKey,
  ...(geminiBaseUrl ? { httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } } : {}),
});

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// ── Google Cloud Vision API ───────────────────────────────────────────────────

async function visionOcrImage(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");

  const base64 = buffer.toString("base64");
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        }],
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Vision API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as any;
  return data?.responses?.[0]?.fullTextAnnotation?.text ?? "";
}

async function visionOcrPdf(buffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");

  const base64 = buffer.toString("base64");
  const allTexts: string[] = [];

  for (let startPage = 1; startPage <= 100; startPage += 5) {
    const pages = [0, 1, 2, 3, 4].map((k) => startPage + k);

    const resp = await fetch(
      `https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            inputConfig: { content: base64, mimeType: "application/pdf" },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages,
          }],
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Vision API error ${resp.status}: ${err}`);
    }

    const data = await resp.json() as any;
    const pageResponses: any[] = data?.responses?.[0]?.responses ?? [];
    if (pageResponses.length === 0) break;

    for (const pr of pageResponses) {
      const t = pr?.fullTextAnnotation?.text ?? "";
      if (t.trim()) allTexts.push(t);
    }

    if (pageResponses.length < 5) break;
  }

  return allTexts.join("\n\n");
}

// ── Extract raw text from any file format ─────────────────────────────────────

async function extractRawText(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<{ text: string; format: string }> {
  const fn = filename.toLowerCase();

  const isPdf   = fn.endsWith(".pdf") || mimetype === "application/pdf";
  const isExcel = fn.endsWith(".xlsx") || fn.endsWith(".xls") ||
                  mimetype.includes("spreadsheet") || mimetype.includes("excel");
  const isImage = mimetype.startsWith("image/") ||
                  /\.(jpg|jpeg|png|webp|tiff|bmp)$/.test(fn);

  if (isPdf) {
    const text = await visionOcrPdf(buffer);
    return { text, format: "pdf" };
  }

  if (isExcel) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const sn of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false });
      if (csv.trim()) parts.push(`--- Sheet: ${sn} ---\n${csv}`);
    }
    return { text: parts.join("\n\n"), format: "excel" };
  }

  if (isImage) {
    const text = await visionOcrImage(buffer, mimetype || "image/jpeg");
    return { text, format: "image" };
  }

  return { text: buffer.toString("utf-8"), format: "text" };
}

// ── Gemini AI field extraction ────────────────────────────────────────────────
// All schema field names EXACTLY match the mobile app's data structures.
// This eliminates any name-mapping gap between API response and app logic.

type DocType = "balance_sheet" | "profit_loss" | "banking" | "gstr" | "itr";

function buildFieldSchema(docType: DocType): string {
  switch (docType) {

    // ── Balance Sheet ─────────────────────────────────────────────────────────
    // Field names match WorkingCapitalData in calculations.ts
    case "balance_sheet":
      return `{
  "currentAssets": number | null,
  "currentLiabilities": number | null,
  "inventory": number | null,
  "debtors": number | null,
  "cash": number | null,
  "creditors": number | null,
  "fixedAssets": number | null,
  "totalAssets": number | null,
  "netWorth": number | null,
  "longTermLoans": number | null,
  "shortTermLoans": number | null,
  "bankOD": number | null,
  "otherCurrentLiabilities": number | null,
  "investments": number | null,
  "loansAndAdvances": number | null,
  "totalLiabilities": number | null
}`;

    // ── Profit & Loss ─────────────────────────────────────────────────────────
    // Field names match WorkingCapitalData in calculations.ts
    case "profit_loss":
      return `{
  "sales": number | null,
  "cogs": number | null,
  "purchases": number | null,
  "openingStock": number | null,
  "closingStock": number | null,
  "grossProfit": number | null,
  "expenses": number | null,
  "EBITDA": number | null,
  "depreciation": number | null,
  "interestExpenses": number | null,
  "netProfit": number | null,
  "otherIncome": number | null,
  "totalIncome": number | null,
  "totalExpenses": number | null,
  "tax": number | null
}`;

    // ── Banking Statement / Sanction Letter ───────────────────────────────────
    // Field names match BankingData in calculations.ts
    case "banking":
      return `{
  "bankName": string | null,
  "accountType": string | null,
  "statementPeriod": string | null,
  "openingBalance": number | null,
  "closingBalance": number | null,
  "totalCredits": number | null,
  "totalDebits": number | null,
  "averageBalance": number | null,
  "minimumBalance": number | null,
  "peakBalance": number | null,
  "cashDeposits": number | null,
  "chequeReturns": number | null,
  "loanRepayments": number | null,
  "overdraftUsage": number | null,
  "ecsEmiPayments": number | null,
  "transactionFrequency": number | null,
  "salaryCredits": number | null,
  "interestCredits": number | null,
  "interestDebits": number | null,
  "bankCharges": number | null,
  "upiTransactions": number | null,
  "rtgsNeftTransfers": number | null,
  "sanctionedLimit": number | null,
  "outstandingBalance": number | null,
  "utilization": number | null,
  "dpValue": number | null,
  "creditRating": string | null,
  "interestRate": number | null,
  "npaStatus": string | null
}`;

    // ── GST Return ────────────────────────────────────────────────────────────
    // Field names match GstrFields interface in gst-itr.tsx
    case "gstr":
      return `{
  "gstin": string | null,
  "filingPeriod": string | null,
  "gstrForm": string | null,
  "totalTaxableTurnover": number | null,
  "totalOutputTax": number | null,
  "igstCollected": number | null,
  "cgstCollected": number | null,
  "sgstCollected": number | null,
  "cessCollected": number | null,
  "totalItcAvailable": number | null,
  "totalItcUtilized": number | null,
  "netTaxPayable": number | null,
  "taxPaidCash": number | null,
  "lateFee": number | null,
  "interestPaid": number | null,
  "totalInvoices": number | null,
  "b2bTaxableValue": number | null,
  "b2cTaxableValue": number | null,
  "exportValue": number | null,
  "nilRatedValue": number | null,
  "exemptValue": number | null,
  "annualTurnover": number | null
}`;

    // ── Income Tax Return ─────────────────────────────────────────────────────
    // Field names match ItrFields interface in gst-itr.tsx
    case "itr":
      return `{
  "assessmentYear": string | null,
  "panNumber": string | null,
  "itrForm": string | null,
  "grossTotalIncome": number | null,
  "taxableIncome": number | null,
  "businessIncome": number | null,
  "totalDeductions": number | null,
  "taxPayable": number | null,
  "netTaxLiability": number | null,
  "tdsDeducted": number | null,
  "advanceTaxPaid": number | null,
  "refundAmount": number | null,
  "taxDue": number | null,
  "salaryIncome": number | null,
  "capitalGains": number | null,
  "otherIncome": number | null,
  "housePropertyIncome": number | null,
  "selfAssessmentTax": number | null,
  "surcharge": number | null,
  "educationCess": number | null
}`;
  }
}

// ── Comprehensive keyword alias tables ────────────────────────────────────────
// Covers: Tally ERP / TallyPrime, Schedule VI, IND-AS, IGAAP, Busy, SAP B1,
// bank CMA formats, GST portal exports, ITR computation sheets.
// All aliases map to the EXACT field names in the schema above.

function buildKeywordGuide(docType: DocType): string {
  switch (docType) {

    case "balance_sheet": return `
MAP THESE DOCUMENT LABELS TO EACH SCHEMA FIELD:

currentAssets:
  → "Total Current Assets", "Current Assets", "Total CA", "Short Term Assets",
    "Circulating Assets", "Working Assets", "Floating Assets",
    "(A) Current Assets", "CURRENT ASSETS TOTAL", "Total (A)"

currentLiabilities:
  → "Total Current Liabilities", "Current Liabilities", "Total CL",
    "Short Term Liabilities", "(B) Current Liabilities and Provisions",
    "Current Liabilities & Provisions", "CURRENT LIABILITIES TOTAL", "Total (B)"

inventory:
  → "Inventories", "Stock", "Closing Stock", "Stock-in-Trade",
    "Raw Materials", "Work-in-Progress", "WIP", "Finished Goods",
    "Stores and Spares", "Stock in Hand", "Trading Stock",
    "Merchandise Inventory", "Stock of Materials",
    "Goods-in-Transit", "Opening Stock" (use closing stock if both exist)

debtors:
  → "Sundry Debtors", "Trade Receivables", "Debtors", "Accounts Receivable",
    "Bills Receivable", "Book Debts", "Trade Debtors", "Receivables",
    "Outstanding Debtors", "Net Debtors", "Gross Debtors",
    "Debtors (Net of Provision)", "Customer Balances",
    "Debtors > 6 months + Debtors < 6 months" (sum both)

cash:
  → "Cash and Cash Equivalents", "Cash & Bank Balances", "Cash and Bank",
    "Cash in Hand", "Cash at Bank", "Bank Balance", "Cash Balance",
    "Balance with Banks", "Current Account Balance",
    "Liquid Cash", "Cash on Hand", "Petty Cash", "Cash + Bank"

creditors:
  → "Sundry Creditors", "Trade Payables", "Creditors", "Accounts Payable",
    "Bills Payable", "Trade Creditors", "Supplier Balances", "Payables",
    "Outstanding Creditors", "Due to Suppliers", "Net Creditors",
    "Creditors for Goods", "Creditors for Expenses"

fixedAssets:
  → "Fixed Assets", "Net Block", "Gross Block minus Depreciation",
    "Property Plant & Equipment", "PP&E", "Tangible Assets",
    "Capital Work-in-Progress", "CWIP", "Plant & Machinery",
    "Land & Building", "Furniture & Fixtures", "Vehicles"

totalAssets:
  → "Total Assets", "Total of Assets Side", "Assets Total",
    "Grand Total (Assets)", "Total Application of Funds"

netWorth:
  → "Net Worth", "Shareholders Funds", "Shareholders' Equity",
    "Share Capital + Reserves & Surplus", "Capital Account",
    "Partners' Capital", "Proprietor's Capital", "Owner's Equity",
    "Equity Share Capital", "Paid-up Capital", "Reserves & Surplus",
    "Capital & Reserves", "Capital Fund", "Total Equity"

longTermLoans:
  → "Long Term Borrowings", "Secured Loans", "Term Loans from Banks",
    "Term Loan", "Non-Current Borrowings", "Debentures", "Bonds",
    "Mortgage Loan", "NBFC Loans", "Bank Term Loan",
    "Unsecured Loans (Long-term)", "Vehicle Loan", "Machinery Loan"

shortTermLoans:
  → "Short Term Borrowings", "Short-term Loans", "Working Capital Loans",
    "Unsecured Loans (Short-term)", "Loans from Directors",
    "Inter-Corporate Deposits", "Loans from Related Parties"

bankOD:
  → "Bank Overdraft", "Overdraft", "OD Account", "Cash Credit",
    "CC Limit", "CC Account", "Working Capital Demand Loan", "WCDL",
    "Bank OD", "Pre-shipment Credit", "Packing Credit", "PCFC",
    "Bills Discounted", "Channel Finance"

otherCurrentLiabilities:
  → "Other Current Liabilities", "Provisions", "Advance from Customers",
    "Outstanding Expenses", "Accrued Liabilities", "Statutory Dues",
    "TDS Payable", "GST Payable", "Salary Payable", "Other Payables"

investments:
  → "Investments", "Non-current Investments", "Current Investments",
    "Mutual Funds", "Shares", "Fixed Deposits", "NSC", "PPF"

loansAndAdvances:
  → "Loans and Advances", "Advances", "Prepaid Expenses",
    "Advance to Suppliers", "Advance Tax", "Security Deposits",
    "Staff Advances", "Refundable Deposits"

totalLiabilities:
  → "Total Liabilities", "Total Funds Employed", "Liabilities Total",
    "Grand Total (Liabilities Side)", "Total Sources of Funds"`;

    case "profit_loss": return `
MAP THESE DOCUMENT LABELS TO EACH SCHEMA FIELD:

sales (Revenue/Turnover — USE THIS as the primary revenue figure):
  → "Sales", "Revenue", "Turnover", "Net Sales", "Gross Sales",
    "Revenue from Operations", "Net Revenue from Operations",
    "Sales of Products", "Sales of Services", "Sales of Goods",
    "Operating Revenue", "Total Revenue", "Income from Business",
    "Gross Turnover", "Sales Turnover", "Billing Amount",
    "Service Income", "Contract Revenue", "Job Work Income",
    "Export Sales + Domestic Sales" (sum), "Total Sales",
    "Sales (Net of Returns)", "Sales & Services"

cogs (Cost of Goods Sold / Direct Cost):
  → "Cost of Goods Sold", "COGS", "Cost of Sales",
    "Opening Stock + Purchases − Closing Stock" (compute if needed),
    "Direct Costs", "Cost of Production", "Manufacturing Cost",
    "Material Consumed", "Cost of Revenue", "Raw Material Consumed",
    "Direct Material + Direct Labour + Direct Overheads",
    "Purchase of Stock-in-Trade (net of stock change)"

purchases:
  → "Purchases", "Purchase of Stock-in-Trade", "Purchase of Raw Materials",
    "Raw Material Purchased", "Net Purchases", "Total Purchases",
    "Cost of Materials Purchased"

openingStock:
  → "Opening Stock", "Stock at Beginning", "Opening Inventory",
    "O/S", "Opening Balance (Stock)"

closingStock:
  → "Closing Stock", "Stock at End", "Closing Inventory",
    "C/S", "Closing Balance (Stock)"

grossProfit:
  → "Gross Profit", "GP", "Trading Profit",
    "Gross Margin", "Gross Profit on Trading Account"

expenses (Operating/Indirect Expenses — EXCLUDE interest & depreciation):
  → "Operating Expenses", "Indirect Expenses", "Overheads",
    "Selling & Distribution Expenses", "Administrative Expenses",
    "G&A Expenses", "Staff Costs", "Employee Benefit Expenses",
    "Payroll", "Rent", "Repairs & Maintenance",
    "Selling Expenses", "Marketing Expenses", "Printing & Stationery",
    "Travelling Expenses", "Communication Expenses",
    "Total Operating Expenses", "Operating Costs", "Total Overheads"

EBITDA:
  → "EBITDA", "Earnings Before Interest Tax Depreciation Amortization",
    "Operating Profit (before D&A)", "PBDIT",
    "Profit Before Depreciation Interest Tax", "Gross Operating Profit"

depreciation:
  → "Depreciation", "Depreciation & Amortization", "D&A",
    "Amortization", "Depreciation on Fixed Assets", "Depreciation Charged"

interestExpenses:
  → "Interest", "Finance Charges", "Finance Costs",
    "Interest on Term Loan", "Interest on CC/OD", "Bank Charges",
    "Interest on Borrowings", "Interest Paid", "Bank Interest",
    "Interest & Finance Charges", "Financial Expenses"

netProfit (BOTTOM LINE — after all deductions including tax):
  → "Net Profit", "Net Profit After Tax", "PAT", "Profit After Tax",
    "Net Income", "Profit for the Year", "Profit for the Period",
    "Net Earnings", "Net Surplus", "Net Profit / (Loss)",
    "Profit / (Loss) After Tax", "Surplus"

otherIncome:
  → "Other Income", "Non-operating Income", "Miscellaneous Income",
    "Interest Income", "Dividend Income", "Rental Income",
    "Profit on Sale of Assets", "Discount Received", "Commission Income",
    "Sundry Income", "Scrap Sales"

totalIncome:
  → "Total Income", "Gross Income", "Net Sales + Other Income",
    "Total Receipts", "Revenue + Other Income"

totalExpenses:
  → "Total Expenses", "Total Expenditure", "Total Costs"

tax:
  → "Tax", "Income Tax", "Provision for Tax", "Current Tax",
    "Deferred Tax", "MAT", "Tax Expense", "Taxes on Income"`;

    case "banking": return `
MAP THESE DOCUMENT LABELS TO EACH SCHEMA FIELD:

bankName:
  → "Bank Name", "Banker", "Name of Bank", "Bank", "Lending Institution"

accountType:
  → "Account Type", "Type of Facility", "Facility Type",
    "Nature of Account", "Cash Credit", "CC", "Overdraft", "OD",
    "Term Loan", "Working Capital", "Savings Account", "Current Account"

statementPeriod:
  → "Statement Period", "Period", "For the Period", "Statement From ... To",
    "Month", "Quarter", "Reporting Period", "Account Period"

openingBalance:
  → "Opening Balance", "Balance B/F", "Balance Brought Forward",
    "Balance at Start", "Opening Credit Balance", "Balance on Opening Date"

closingBalance:
  → "Closing Balance", "Balance C/F", "Balance Carried Forward",
    "Balance at End", "Closing Credit Balance", "Balance as on Date",
    "Balance as at", "Outstanding Balance"

totalCredits (all money coming IN):
  → "Total Credits", "Total Deposits", "Credit Turnover",
    "Total Receipts", "Total Credit Transactions",
    "Total Inflow", "Total Inwards", "Sum of Credits",
    "Total Amount Credited"

totalDebits (all money going OUT):
  → "Total Debits", "Total Withdrawals", "Debit Turnover",
    "Total Payments", "Total Debit Transactions",
    "Total Outflow", "Total Outwards", "Sum of Debits",
    "Total Amount Debited"

averageBalance:
  → "Average Balance", "Average Monthly Balance", "ABB",
    "Avg. Credit Balance", "Monthly Average Balance", "MAB",
    "Average Daily Balance", "Average Quarterly Balance",
    "Average Credit Balance"

minimumBalance:
  → "Minimum Balance", "Lowest Balance", "Minimum Credit Balance",
    "Minimum Month-End Balance"

peakBalance:
  → "Peak Balance", "Maximum Balance", "Highest Balance",
    "Maximum Credit Balance"

cashDeposits:
  → "Cash Deposits", "Cash Credited", "Cash Deposit Amount",
    "Cash Transactions (Credit)", "Currency Deposits"

chequeReturns (bounced cheques + ECS/NACH returns — COUNT not amount):
  → "Cheque Returns", "Bounced Cheques", "Returned Cheques",
    "Cheque Bounces", "Cheque Dishonour", "Outward Cheque Returns",
    "Inward Cheque Returns", "ECS Returns", "NACH Returns",
    "Return Count", "Bounce Count", "Dishonoured Cheques",
    "No. of Cheque Bounces", "EMI Bounce Count"

loanRepayments:
  → "Loan Repayments", "Loan EMI", "Term Loan EMI",
    "Principal Repayment", "Loan Instalment",
    "Repayment to Bank", "Loan Debit", "EMI Paid"

overdraftUsage:
  → "Overdraft Usage", "OD Used", "OD Utilized",
    "CC Utilized", "Cash Credit Used", "Overdraft Amount",
    "Maximum OD/CC Balance", "Peak OD Utilization"

ecsEmiPayments:
  → "ECS", "NACH Debit", "Standing Instruction", "SI Debit",
    "Auto Debit", "ECS EMI", "NACH EMI", "Monthly EMI (ECS)",
    "Recurring Debit", "Auto Pay"

transactionFrequency:
  → "Transaction Count", "No. of Transactions",
    "Total Transactions", "Number of Entries",
    "No. of Credits + No. of Debits" (sum both)

salaryCredits:
  → "Salary Credits", "Salary Received", "Salary Income",
    "Regular Salary", "Monthly Salary", "Wages Credited"

interestCredits:
  → "Interest Credited", "Interest Income", "Savings Interest",
    "Bank Interest Received"

interestDebits:
  → "Interest Debited", "Interest Charged", "Bank Interest Charged",
    "Interest on OD/CC", "Finance Charges Debited"

bankCharges:
  → "Bank Charges", "Service Charges", "Maintenance Charges",
    "Account Maintenance Fee", "Processing Charges"

upiTransactions:
  → "UPI Credits", "UPI Debits", "UPI Transactions",
    "UPI Amount", "BHIM UPI"

rtgsNeftTransfers:
  → "RTGS", "NEFT", "IMPS", "Wire Transfer",
    "Online Transfer", "Fund Transfer"

sanctionedLimit:
  → "Sanctioned Limit", "CC Limit", "OD Limit",
    "Approved Limit", "Drawing Power Limit", "Credit Limit"

outstandingBalance:
  → "Outstanding Balance", "Amount Outstanding", "Balance Outstanding",
    "Principal Outstanding", "Loan Outstanding"

utilization:
  → "Utilization", "% Utilization", "Utilization Percentage"

dpValue:
  → "Drawing Power", "DP", "DP Value", "Eligible DP"

creditRating:
  → "Credit Rating", "CIBIL Score", "CIBIL Rating",
    "Internal Rating", "Risk Rating", "Asset Classification"

interestRate:
  → "Interest Rate", "Rate of Interest", "ROI", "MCLR + Spread",
    "Applicable Rate", "Lending Rate", "% p.a."

npaStatus:
  → "NPA Status", "Asset Classification", "Account Status",
    "Standard / Sub-standard / Doubtful / Loss",
    "SMA-0", "SMA-1", "SMA-2", "Performing / Non-Performing"`;

    case "gstr": return `
MAP THESE DOCUMENT LABELS TO EACH SCHEMA FIELD:

gstin:
  → "GSTIN", "GST Number", "GST Identification Number", "GSTIN No.", "GST Reg. No."

filingPeriod:
  → "Tax Period", "Return Period", "Filing Period", "Month", "Quarter",
    "Period of Return", "For the Month of"

gstrForm:
  → "Form Type", "GSTR Form", "GSTR-1", "GSTR-3B", "GSTR-9", "GSTR-9C",
    "Return Type"

totalTaxableTurnover (turnover BEFORE GST is applied):
  → "Total Taxable Value", "Taxable Turnover", "Taxable Value",
    "Aggregate Turnover", "Gross Taxable Turnover",
    "Total Value of Taxable Supplies", "Turnover as per Books",
    "Net Taxable Supply", "Total Outward Taxable Supplies"

totalOutputTax (total GST charged on sales = IGST + CGST + SGST):
  → "Total Tax", "Total GST", "Output Tax", "Total Output Tax",
    "Net GST", "Gross GST Liability", "Tax Amount",
    "Total Tax Payable (before ITC)"

igstCollected:
  → "IGST", "Integrated GST", "IGST Amount", "Total IGST",
    "IGST Collected", "IGST Payable", "Integrated Tax", "IGST on Supplies"

cgstCollected:
  → "CGST", "Central GST", "CGST Amount", "Total CGST",
    "CGST Collected", "CGST Payable", "Central Tax"

sgstCollected:
  → "SGST", "State GST", "SGST Amount", "Total SGST",
    "SGST/UTGST", "UTGST", "SGST Collected", "SGST Payable",
    "State Tax", "Union Territory Tax"

cessCollected:
  → "Cess", "Total Cess", "GST Cess", "Compensation Cess", "Cess Amount"

totalItcAvailable (total ITC you can claim as input credit):
  → "Input Tax Credit", "ITC", "ITC Available", "Total ITC",
    "Eligible ITC", "ITC as per Books",
    "Total Input Tax Credit", "ITC on Inward Supplies",
    "ITC (IGST + CGST + SGST)"

totalItcUtilized (ITC actually used to offset output tax):
  → "ITC Utilized", "ITC Availed", "ITC Used",
    "ITC Set Off", "Input Tax Set Off"

netTaxPayable (cash payment after ITC deduction):
  → "Net Tax Payable", "Tax to be Paid in Cash",
    "Balance Tax Payable", "Tax Payable after ITC",
    "Net GST Liability", "Tax Payable (Cash Ledger)"

taxPaidCash:
  → "Tax Paid in Cash", "Cash Payment", "Tax Paid through Cash Ledger",
    "Taxes Paid (Cash)", "GST Paid (Cash)"

lateFee:
  → "Late Fee", "Late Fees Paid", "Late Filing Fee", "Penalty"

interestPaid:
  → "Interest", "Interest on Delayed Payment", "Interest Paid",
    "Interest Liability", "Interest Charged"

totalInvoices:
  → "Number of Invoices", "Total Invoices", "Invoice Count",
    "No. of Transactions"

b2bTaxableValue:
  → "B2B Supplies", "B2B Taxable Value", "Business to Business",
    "Supplies to Registered Persons"

b2cTaxableValue:
  → "B2C Supplies", "B2C Taxable Value", "Business to Consumer",
    "Supplies to Unregistered Persons", "B2CS", "B2CL"

exportValue:
  → "Export Supplies", "Exports", "Zero Rated Supplies",
    "Export of Goods", "Export of Services", "SEZ Supplies"

nilRatedValue / exemptValue:
  → "Nil Rated Supplies", "Exempt Supplies",
    "Non-taxable Supplies", "Exempted Turnover"

annualTurnover:
  → "Annual Turnover", "Aggregate Annual Turnover",
    "Total Annual Turnover", "Turnover for Registration"`;

    case "itr": return `
MAP THESE DOCUMENT LABELS TO EACH SCHEMA FIELD:

assessmentYear:
  → "Assessment Year", "AY", "A.Y.", "AY 20XX-XX", "Year of Assessment"

panNumber:
  → "PAN", "Permanent Account Number", "PAN No.", "PAN Number"

itrForm:
  → "ITR Form", "ITR-1", "ITR-2", "ITR-3", "ITR-4",
    "Form Type", "Return Type"

grossTotalIncome (BEFORE Chapter VI-A deductions):
  → "Gross Total Income", "GTI", "Total Income (before deductions)",
    "Gross Income", "Total of all heads of income",
    "Total Income (Schedule Part B-TI)"

taxableIncome (AFTER deductions — net chargeable income):
  → "Net Taxable Income", "Taxable Income",
    "Total Income (Taxable)", "Net Income",
    "Total Income as per Return", "Chargeable Income",
    "Assessed Income", "Income after Deductions"

businessIncome:
  → "Business Income", "Profit from Business",
    "Income from Business or Profession",
    "Net Profit from Business", "Income under PGBP",
    "Profits and Gains of Business or Profession"

totalDeductions (Chapter VI-A deductions like 80C, 80D):
  → "Deductions", "Chapter VI-A Deductions", "Total Deductions",
    "Sec 80C", "80C + 80D + 80G + other deductions",
    "Deduction under Chapter VI-A", "Total of deductions"

taxPayable (computed tax BEFORE cess/surcharge/rebate):
  → "Tax Payable", "Tax on Total Income", "Income Tax",
    "Tax Computed at Applicable Rates", "Tax before Surcharge and Cess"

netTaxLiability (FINAL tax due including cess + surcharge, after rebate):
  → "Net Tax Liability", "Tax Due", "Net Tax Payable",
    "Total Tax Payable", "Tax Payable (after relief and rebate)",
    "Tax Payable after Rebate u/s 87A",
    "Tax + Surcharge + Cess - Relief"

tdsDeducted:
  → "TDS", "Tax Deducted at Source", "Total TDS", "TDS Deducted",
    "TDS Credit", "Tax Deducted", "TDS as per 26AS", "TDS as per AIS"

advanceTaxPaid:
  → "Advance Tax", "Advance Tax Paid", "Advance Tax Installments"

refundAmount:
  → "Refund", "Refund Due", "Refund Amount",
    "Amount Refundable", "Refund Claimed", "Excess Tax Paid"

taxDue (balance tax payable after TDS, advance tax, etc.):
  → "Tax Due", "Balance Tax Payable", "Tax Remaining",
    "Self Assessment Tax Due", "Net Tax Due"

salaryIncome:
  → "Salary", "Income from Salary", "Salaries", "Wages",
    "Income under Head Salaries", "Gross Salary"

capitalGains:
  → "Capital Gains", "Short Term Capital Gains", "STCG",
    "Long Term Capital Gains", "LTCG",
    "Income from Capital Gains"

otherIncome:
  → "Other Income", "Income from Other Sources",
    "Interest Income (IFOS)", "Dividend Income",
    "FD Interest", "Lottery Income"

housePropertyIncome:
  → "House Property Income", "Income from House Property",
    "Rental Income", "Net Annual Value",
    "Income under Head House Property"

selfAssessmentTax:
  → "Self Assessment Tax", "SAT", "Self Assessment Tax Paid"

surcharge:
  → "Surcharge", "Surcharge on Tax",
    "Surcharge @ 10%", "Surcharge @ 15%"

educationCess:
  → "Education Cess", "Cess", "Health and Education Cess",
    "Cess @ 4%", "Education & Secondary Cess"`;
  }
}

function buildGeminiPrompt(text: string, docType: DocType): string {
  const schema   = buildFieldSchema(docType);
  const keywords = buildKeywordGuide(docType);

  const docLabel: Record<DocType, string> = {
    balance_sheet: "Balance Sheet / Statement of Financial Position (Schedule VI / IND-AS / IGAAP / Tally / Busy / SAP)",
    profit_loss:   "Profit & Loss Statement / Trading & P&L Account / Income Statement",
    banking:       "Bank Statement / Bank CMA / Sanction Letter / Account Statement",
    gstr:          "GST Return — GSTR-1 / GSTR-3B / GSTR-9 / GSTR-9C / GST Portal Extract",
    itr:           "Income Tax Return — ITR-1 / ITR-2 / ITR-3 / ITR-4 / Computation of Income Sheet",
  };

  return `You are an expert Indian financial document parser with 20+ years of experience reading Tally-generated reports, Schedule VI statements, IND-AS financials, IGAAP statements, GST portal exports, ITR computation sheets, and bank CMA formats.

DOCUMENT TYPE: ${docLabel[docType]}

TASK: Extract ALL financial values from the document text below and return ONLY a valid JSON object matching the EXACT schema provided.

━━━ CRITICAL RULES ━━━

1. Return ONLY the JSON object — no explanation, no markdown, no code fences, no comments.

2. Use EXACTLY the field names given in the schema — do NOT rename, abbreviate, or add extra fields.

3. MONETARY VALUES — always plain numbers (never strings):
   • Indian comma format: 1,43,827 → 143827 | 12,34,56,789 → 123456789
   • Unit headers apply to ALL values in the document:
     – "₹ in Lakhs" or "Rs. in Lakhs" or "(Lakhs)" → multiply each value by 100000
     – "₹ in Crores" or "(Crores)" → multiply by 10000000
     – "₹ in Thousands" → multiply by 1000
   • Parentheses = negative: (15,000) → -15000
   • Values with "Dr" suffix may be positive; "Cr" suffix is usually positive for assets
   • "Nil" or "–" or "N/A" → null; "Zero" → 0

4. LAYOUT HANDLING:
   • Two-column Balance Sheet: Left = Assets; Right = Liabilities/Capital
   • Tally reports: look for group totals and parent-child indentation
   • Schedules/Notes: use the schedule total that matches the balance sheet reference
   • ALWAYS use CURRENT YEAR values — IGNORE the previous year column
   • If two year columns exist, take the FIRST/CURRENT year value (leftmost or top)

5. INFERENCE RULES:
   • If "cogs" is not explicitly stated but "openingStock", "purchases", and "closingStock" are present:
     compute cogs = openingStock + purchases - closingStock
   • If "sales" is not explicit, use "Revenue from Operations" or "Net Sales"
   • If "currentAssets" total is missing, SUM the individual current asset line items
   • If "currentLiabilities" total is missing, SUM the individual current liability line items

6. For percentage fields (utilization, interestRate), return the number only (e.g. 75.5 not "75.5%").

7. String fields: return the actual text value as-is, trimmed.

━━━ KEYWORD RECOGNITION TABLE ━━━
(All labels/headings in the document that map to each schema field)
${keywords}

━━━ EXACT SCHEMA TO RETURN ━━━
${schema}

━━━ DOCUMENT TEXT ━━━
${text.slice(0, 24000)}`;
}

async function geminiExtractFields(text: string, docType: DocType): Promise<Record<string, any>> {
  const prompt = buildGeminiPrompt(text, docType);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const raw     = response.text ?? "{}";
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return {};
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/parse-document", upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ message: "No file uploaded" }); return; }

  try {
    const { text, format } = await extractRawText(
      req.file.buffer, req.file.mimetype, req.file.originalname ?? "",
    );
    res.json({ text, format });
  } catch (err) {
    req.log.error({ err }, "parse-document failed");
    res.status(500).json({ message: "Failed to parse document" });
  }
});

router.post("/parse-financial", upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ message: "No file uploaded" }); return; }

  const docType = (req.body?.docType ?? "") as DocType;
  const validTypes: DocType[] = ["balance_sheet", "profit_loss", "banking", "gstr", "itr"];
  if (!validTypes.includes(docType)) {
    res.status(400).json({ message: `Invalid docType. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  try {
    const { text, format } = await extractRawText(
      req.file.buffer, req.file.mimetype, req.file.originalname ?? "",
    );

    if (!text.trim()) {
      res.status(422).json({ message: "Could not extract any text from the document. Please ensure the file is readable." });
      return;
    }

    const fields = await geminiExtractFields(text, docType);
    res.json({ text, format, fields });

  } catch (err) {
    req.log.error({ err }, "parse-financial failed");
    res.status(500).json({ message: "Failed to parse financial document" });
  }
});

export default router;
