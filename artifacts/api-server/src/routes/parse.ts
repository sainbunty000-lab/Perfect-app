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

type DocType = "balance_sheet" | "profit_loss" | "banking" | "gstr" | "itr";

function buildFieldSchema(docType: DocType): string {
  switch (docType) {
    case "balance_sheet":
      return `{
  "totalCurrentAssets": number | null,
  "totalCurrentLiabilities": number | null,
  "inventory": number | null,
  "debtors": number | null,
  "cashAndBank": number | null,
  "fixedAssets": number | null,
  "totalAssets": number | null,
  "netWorth": number | null,
  "longTermLoans": number | null,
  "shortTermLoans": number | null,
  "bankOD": number | null,
  "sundryCreditors": number | null,
  "otherCurrentLiabilities": number | null,
  "investments": number | null,
  "loansAndAdvances": number | null,
  "totalLiabilities": number | null
}`;

    case "profit_loss":
      return `{
  "grossSales": number | null,
  "netSales": number | null,
  "costOfGoodsSold": number | null,
  "grossProfit": number | null,
  "operatingExpenses": number | null,
  "EBITDA": number | null,
  "depreciation": number | null,
  "EBIT": number | null,
  "interestExpenses": number | null,
  "netProfit": number | null,
  "otherIncome": number | null,
  "totalIncome": number | null,
  "totalExpenses": number | null,
  "tax": number | null,
  "purchases": number | null,
  "openingStock": number | null,
  "closingStock": number | null
}`;

    case "banking":
      return `{
  "bankName": string | null,
  "accountType": string | null,
  "sanctionedLimit": number | null,
  "outstandingBalance": number | null,
  "utilization": number | null,
  "dpValue": number | null,
  "securityValue": number | null,
  "creditRating": string | null,
  "interestRate": number | null,
  "tenure": string | null,
  "emiAmount": number | null,
  "npaStatus": string | null,
  "overdraftLimit": number | null,
  "cashCreditLimit": number | null,
  "termLoanOutstanding": number | null,
  "averageBalance": number | null,
  "peakBalance": number | null,
  "minimumBalance": number | null,
  "totalCredits": number | null,
  "totalDebits": number | null,
  "bouncedCheques": number | null,
  "emiBouncedCount": number | null
}`;

    case "gstr":
      return `{
  "gstinNumber": string | null,
  "filingPeriod": string | null,
  "totalTaxableValue": number | null,
  "totalIGST": number | null,
  "totalCGST": number | null,
  "totalSGST": number | null,
  "totalCess": number | null,
  "totalTax": number | null,
  "totalInvoices": number | null,
  "b2bTaxableValue": number | null,
  "b2cTaxableValue": number | null,
  "exportValue": number | null,
  "nilRatedValue": number | null,
  "exemptValue": number | null,
  "inputTaxCredit": number | null,
  "itcIGST": number | null,
  "itcCGST": number | null,
  "itcSGST": number | null,
  "itcUtilized": number | null,
  "netTaxPayable": number | null,
  "taxPaidCash": number | null,
  "taxPaidITC": number | null,
  "lateFee": number | null,
  "interest": number | null,
  "annualTurnover": number | null
}`;

    case "itr":
      return `{
  "assessmentYear": string | null,
  "panNumber": string | null,
  "grossTotalIncome": number | null,
  "deductions": number | null,
  "netTaxableIncome": number | null,
  "taxPayable": number | null,
  "taxPaid": number | null,
  "refundAmount": number | null,
  "salaryIncome": number | null,
  "businessIncome": number | null,
  "capitalGains": number | null,
  "otherIncome": number | null,
  "housePropertyIncome": number | null,
  "netTaxLiability": number | null,
  "tdsDeducted": number | null,
  "advanceTaxPaid": number | null,
  "selfAssessmentTax": number | null,
  "surcharge": number | null,
  "educationCess": number | null,
  "totalTaxWithCess": number | null
}`;
  }
}

// ── Comprehensive keyword alias tables ────────────────────────────────────────
// Covers: Tally-generated reports, Schedule VI, IND-AS, IGAAP, CA-prepared
// statements, bank CMA formats, GST portal exports, ITR computation sheets,
// Tally ERP 9, TallyPrime, Busy, Miracle, SAP B1 India exports.

function buildKeywordGuide(docType: DocType): string {
  switch (docType) {

    case "balance_sheet": return `
BALANCE SHEET KEYWORD ALIASES — use ANY of these labels to identify each field:

totalCurrentAssets (sum of all short-term assets):
  → "Total Current Assets", "Current Assets", "Total CA", "Short Term Assets",
    "Circulating Assets", "Working Assets", "Floating Assets",
    "(A) Current Assets", "CURRENT ASSETS TOTAL", "Total (A)",
    "Net Current Assets" (if liabilities not deducted yet)

totalCurrentLiabilities (short-term obligations due within 1 year):
  → "Total Current Liabilities", "Current Liabilities", "Total CL",
    "Short Term Liabilities", "Short-term Borrowings + Trade Payables + Other CL",
    "(B) Current Liabilities and Provisions", "Current Liabilities & Provisions",
    "CURRENT LIABILITIES TOTAL", "Total (B)"

inventory (goods / raw material / WIP / finished goods):
  → "Inventories", "Stock", "Closing Stock", "Stock-in-Trade", "Opening Stock",
    "Raw Materials", "Work-in-Progress", "WIP", "Finished Goods",
    "Goods-in-Transit", "Stores and Spares", "Stock of Materials",
    "Stock in Hand", "Trading Stock", "Merchandise Inventory",
    "Packing Material", "Consumables", "Stock (at cost or NRV)"

debtors (money owed by customers):
  → "Sundry Debtors", "Trade Receivables", "Debtors", "Accounts Receivable",
    "Bills Receivable", "Book Debts", "Debtors (Net of Provision)",
    "Trade Debtors", "Receivables", "Outstanding Debtors",
    "Net Debtors", "Gross Debtors", "Customer Balances",
    "Debtors > 6 months", "Debtors < 6 months" (use total of both)

cashAndBank (liquid cash and bank account balances):
  → "Cash and Cash Equivalents", "Cash & Bank Balances", "Cash and Bank",
    "Cash in Hand", "Cash at Bank", "Bank Balance", "Cash Balance",
    "Balance with Banks", "Current Account Balance", "Savings Account",
    "Fixed Deposits (< 3 months)", "Liquid Cash", "Cash on Hand",
    "Petty Cash", "Cash + Bank", "Cash & Bank (Schedule X)"

fixedAssets (long-term physical assets):
  → "Fixed Assets", "Net Block", "Gross Block minus Depreciation",
    "Property Plant & Equipment", "PP&E", "Tangible Assets",
    "Intangible Assets", "Capital Work-in-Progress", "CWIP",
    "Plant & Machinery", "Land & Building", "Furniture & Fixtures",
    "Vehicles", "Office Equipment", "Non-Current Assets (Fixed)"

totalAssets (everything owned by the business):
  → "Total Assets", "Total of Assets Side", "Assets Total",
    "Grand Total (Assets)", "Total Application of Funds",
    "Total Fixed Assets + Current Assets + Other Assets"

netWorth (owner's equity / capital):
  → "Net Worth", "Shareholders Funds", "Shareholders' Equity",
    "Share Capital + Reserves & Surplus", "Capital Account",
    "Partners' Capital", "Proprietor's Capital", "Owner's Equity",
    "Equity Share Capital", "Paid-up Capital", "Reserves & Surplus",
    "General Reserve", "Retained Earnings", "Surplus in P&L",
    "Total Equity", "Owned Funds", "Capital & Reserves",
    "Capital Fund", "Capital Employed (Equity portion)"

longTermLoans (borrowings repayable after 1 year):
  → "Long Term Borrowings", "Secured Loans", "Term Loans from Banks",
    "Term Loan", "Non-Current Borrowings", "Long-term Liabilities",
    "Debentures", "Bonds", "Mortgage Loan", "NBFC Loans",
    "Bank Term Loan", "Unsecured Loans (Long-term)", "Vehicle Loan",
    "Equipment Finance Loan", "Machinery Loan"

shortTermLoans (borrowings repayable within 1 year):
  → "Short Term Borrowings", "Short-term Loans", "Working Capital Loans",
    "Unsecured Loans (Short-term)", "Loans from Directors",
    "Inter-Corporate Deposits", "Loans from Related Parties",
    "Short-term Bank Loans (not CC/OD)"

bankOD (overdraft / cash credit facilities):
  → "Bank Overdraft", "Overdraft", "OD Account", "Cash Credit",
    "CC Limit", "CC Account", "Working Capital Demand Loan", "WCDL",
    "Bank OD", "Secured OD", "Pre-shipment Credit", "Packing Credit",
    "PCFC", "Book Debt Finance", "Bills Discounted", "Channel Finance",
    "Buyer's Credit", "Supplier's Credit"

sundryCreditors (money owed to suppliers):
  → "Sundry Creditors", "Trade Payables", "Creditors", "Accounts Payable",
    "Bills Payable", "Trade Creditors", "Supplier Balances",
    "Payables", "Outstanding Creditors", "Due to Suppliers",
    "Net Creditors", "Creditors for Goods", "Creditors for Expenses"

otherCurrentLiabilities:
  → "Other Current Liabilities", "Provisions", "Advance from Customers",
    "Customer Advances", "Outstanding Expenses", "Accrued Liabilities",
    "Statutory Dues", "TDS Payable", "GST Payable", "ESI Payable",
    "PF Payable", "Salary Payable", "Audit Fees Payable",
    "Income Tax Payable", "Unclaimed Dividends", "Other Payables"

investments (financial investments):
  → "Investments", "Non-current Investments", "Current Investments",
    "Quoted Investments", "Unquoted Investments", "Mutual Funds",
    "Shares", "Debentures (Investment)", "Subsidiary Investment",
    "FD (> 3 months)", "Fixed Deposits", "NSC", "PPF"

loansAndAdvances:
  → "Loans and Advances", "Advances", "Prepaid Expenses",
    "Advance to Suppliers", "Advance Tax", "Security Deposits",
    "Deposits", "Staff Advances", "Advance Income Tax",
    "Refundable Deposits", "Earnest Money Deposit"

totalLiabilities:
  → "Total Liabilities", "Total Funds Employed", "Total Sources of Funds",
    "Liabilities Total", "Grand Total (Liabilities Side)"`;

    case "profit_loss": return `
PROFIT & LOSS / TRADING ACCOUNT KEYWORD ALIASES:

grossSales / netSales (revenue from operations):
  → "Sales", "Revenue", "Turnover", "Net Sales", "Gross Sales",
    "Revenue from Operations", "Net Revenue from Operations",
    "Sales of Products", "Sales of Services", "Sales of Goods",
    "Operating Revenue", "Total Revenue", "Income from Business",
    "Gross Turnover", "Sales Turnover", "Billing Amount",
    "Service Income", "Contract Revenue", "Job Work Income",
    "Export Sales", "Domestic Sales", "Total Sales",
    "Sales (Net of Returns)", "Sales & Services"

purchases (raw material / goods purchased):
  → "Purchases", "Purchase of Stock-in-Trade", "Purchase of Raw Materials",
    "Raw Material Consumed", "Material Cost", "Cost of Materials Consumed",
    "Purchase of Goods", "Goods Purchased", "Trading Purchases",
    "Net Purchases", "Total Purchases"

openingStock:
  → "Opening Stock", "Stock at Beginning", "Opening Inventory",
    "Stock at Commencement", "O/S", "Opening Balance (Stock)"

closingStock:
  → "Closing Stock", "Stock at End", "Closing Inventory",
    "Stock at Close", "C/S", "Closing Balance (Stock)"

costOfGoodsSold (direct cost of producing/selling):
  → "Cost of Goods Sold", "COGS", "Cost of Sales",
    "Opening Stock + Purchases - Closing Stock",
    "Direct Costs", "Cost of Production",
    "Manufacturing Cost", "Material Consumed",
    "Direct Material + Direct Labour + Direct Overheads",
    "Cost of Revenue", "Cost of Services"

grossProfit:
  → "Gross Profit", "GP", "Trading Profit",
    "Sales minus COGS", "Gross Margin",
    "Gross Profit on Trading", "Profit on Trading Account"

operatingExpenses (overheads excluding COGS):
  → "Operating Expenses", "Indirect Expenses", "Overheads",
    "Selling & Distribution Expenses", "Administrative Expenses",
    "General & Administrative Expenses", "G&A Expenses",
    "Staff Costs", "Employee Benefit Expenses", "Payroll",
    "Rent", "Repairs & Maintenance", "Selling Expenses",
    "Marketing Expenses", "Printing & Stationery",
    "Travelling Expenses", "Communication Expenses",
    "Total Operating Expenses", "Operating Costs"

EBITDA:
  → "EBITDA", "Earnings Before Interest Tax Depreciation Amortization",
    "Operating Profit (before D&A)", "PBDIT", "Profit Before Depreciation Interest Tax",
    "Cash Profit (approx)", "Gross Operating Profit"

depreciation:
  → "Depreciation", "Depreciation & Amortization", "D&A",
    "Amortization", "Depletion", "Depreciation on Fixed Assets",
    "Depreciation Charged", "Depreciation (Schedule)"

EBIT:
  → "EBIT", "Earnings Before Interest and Tax",
    "Operating Profit", "Profit from Operations",
    "Net Operating Profit", "PBIT", "Profit Before Interest and Tax"

interestExpenses (finance charges):
  → "Interest", "Finance Charges", "Finance Costs",
    "Interest on Term Loan", "Interest on CC/OD", "Bank Charges",
    "Interest on Borrowings", "Interest Paid",
    "Interest & Finance Charges", "Financial Expenses",
    "Interest on Working Capital Loan", "Interest Expense",
    "Bank Interest", "Loan Interest"

netProfit (bottom line):
  → "Net Profit", "Net Profit After Tax", "PAT", "Profit After Tax",
    "Net Income", "Profit for the Year", "Profit for the Period",
    "Net Earnings", "Net Profit (after tax and appropriations)",
    "Surplus", "Net Surplus", "Net Profit / (Loss)",
    "Profit / (Loss) After Tax", "PBT minus Tax",
    "Profit Transferred to Balance Sheet"

otherIncome:
  → "Other Income", "Non-operating Income", "Miscellaneous Income",
    "Interest Income", "Dividend Income", "Rental Income",
    "Profit on Sale of Assets", "Foreign Exchange Gain",
    "Discount Received", "Commission Income", "Sundry Income",
    "Insurance Claim", "Scrap Sales", "Grant Income"

totalIncome:
  → "Total Income", "Total Revenue", "Gross Income",
    "Net Sales + Other Income", "Total Receipts",
    "Revenue + Other Income"

totalExpenses:
  → "Total Expenses", "Total Expenditure", "Total Costs",
    "COGS + Operating Expenses + Interest + Depreciation"

tax (income tax / provision for tax):
  → "Tax", "Income Tax", "Provision for Tax",
    "Current Tax", "Deferred Tax", "MAT",
    "Minimum Alternate Tax", "Tax Expense",
    "Income Tax Expense", "Taxes on Income"`;

    case "banking": return `
BANKING STATEMENT / SANCTION LETTER / CMA DATA KEYWORD ALIASES:

bankName:
  → "Bank Name", "Banker", "Name of Bank", "Lending Institution",
    "Financer", "Lender", "Bank", "FI Name", "Financial Institution"

accountType:
  → "Account Type", "Type of Facility", "Facility Type",
    "Nature of Account", "Type of Credit", "Loan Type",
    "Cash Credit", "CC", "Overdraft", "OD", "Term Loan", "TL",
    "Working Capital", "WCDL", "Letter of Credit", "LC",
    "Bank Guarantee", "BG", "Packing Credit", "PCFC",
    "Bills Purchase", "Bills Discounting", "Mortgage Loan"

sanctionedLimit (approved credit limit):
  → "Sanctioned Limit", "Sanctioned Amount", "Approved Limit",
    "CC Limit", "OD Limit", "Drawing Power Limit",
    "Limit Sanctioned", "Credit Limit", "Total Limit",
    "Facility Amount", "Loan Amount Sanctioned",
    "Aggregate Limit", "Fund-based Limit", "WC Limit"

outstandingBalance (amount currently drawn):
  → "Outstanding Balance", "Outstanding Amount", "Balance Outstanding",
    "Amount Outstanding", "Utilised Amount", "Amount Drawn",
    "Current Balance", "Debit Balance", "Closing Balance",
    "Amount Availed", "Balance as on Date", "Loan Outstanding",
    "Principal Outstanding", "O/S Balance"

utilization (% of limit used):
  → "Utilization", "Utilisation", "% Utilization",
    "Utilization Percentage", "% of Limit Used",
    "Drawing Power Utilized", "Limit Utilized",
    "(Outstanding / Limit) × 100"

dpValue (drawing power):
  → "Drawing Power", "DP", "DP Value", "Eligible DP",
    "Computed DP", "Drawing Power as per Stock Statement",
    "DP as per Latest Stock Statement"

securityValue (collateral value):
  → "Security Value", "Collateral Value", "Market Value of Security",
    "Value of Primary Security", "Value of Collateral",
    "Mortgage Value", "Property Value", "Security (Primary + Collateral)",
    "Total Security", "Value of Hypothecation"

creditRating:
  → "Credit Rating", "Internal Rating", "External Rating",
    "CIBIL Score", "CIBIL Rating", "CRIF Score",
    "Experian Score", "Equifax Score", "Risk Rating",
    "Borrower Rating", "Asset Classification",
    "Standard / Sub-standard / Doubtful / Loss"

interestRate:
  → "Interest Rate", "Rate of Interest", "ROI",
    "Applicable Rate", "MCLR + Spread", "RLLR + Spread",
    "Repo Rate + Spread", "Base Rate + Spread",
    "Effective Interest Rate", "Lending Rate", "% p.a."

tenure:
  → "Tenure", "Loan Tenure", "Repayment Period",
    "Loan Period", "Duration", "Term", "Maturity",
    "Repayment Schedule", "Loan Term"

emiAmount:
  → "EMI", "Monthly Instalment", "Monthly Repayment",
    "Instalment Amount", "EMI Amount", "Monthly EMI",
    "Equated Monthly Instalment", "Monthly Payment"

npaStatus:
  → "NPA Status", "Asset Classification", "Account Status",
    "Standard Asset", "Sub-standard Asset", "Doubtful Asset",
    "Loss Asset", "NPA", "Special Mention Account", "SMA",
    "SMA-0", "SMA-1", "SMA-2", "Performing / Non-Performing"

overdraftLimit / cashCreditLimit:
  → "Overdraft Limit", "OD Limit", "Cash Credit Limit",
    "CC Limit", "Sanctioned CC/OD", "Working Capital Limit"

termLoanOutstanding:
  → "Term Loan Outstanding", "TL Outstanding", "Principal Outstanding",
    "Term Loan Balance", "Loan Outstanding (Term)"

averageBalance:
  → "Average Balance", "Average Monthly Balance", "ABB",
    "Avg. Credit Balance", "Monthly Average Balance", "MAB",
    "Average Quarterly Balance", "Average Daily Balance"

peakBalance / minimumBalance:
  → "Peak Balance", "Maximum Balance", "Highest Balance",
    "Minimum Balance", "Lowest Balance"

totalCredits / totalDebits:
  → "Total Credits", "Total Deposits", "Credit Turnover",
    "Total Debits", "Total Withdrawals", "Debit Turnover",
    "Total Credit Transactions", "Total Debit Transactions"

bouncedCheques / emiBouncedCount:
  → "Bounced Cheques", "Cheque Returns", "Returned Cheques",
    "No. of Cheque Bounces", "Cheque Dishonour", "ECS Returns",
    "NACH Returns", "Inward Cheque Returns", "Outward Cheque Returns",
    "EMI Bounce", "Bounce Count", "Return Count"`;

    case "gstr": return `
GST RETURN (GSTR-1 / GSTR-3B / GSTR-9 / GSTR-9C) KEYWORD ALIASES:

gstinNumber:
  → "GSTIN", "GST Number", "GST Identification Number",
    "GSTIN No.", "Registration Number", "GST Reg. No."

filingPeriod:
  → "Tax Period", "Return Period", "Filing Period",
    "Month", "Quarter", "Financial Year",
    "Period of Return", "For the Month of"

totalTaxableValue (turnover before GST):
  → "Total Taxable Value", "Taxable Turnover", "Taxable Value",
    "Aggregate Turnover", "Gross Taxable Turnover",
    "Total Value of Taxable Supplies", "Turnover as per Books",
    "Net Taxable Supply", "Total Outward Taxable Supplies",
    "Taxable Value of Supplies"

totalIGST:
  → "IGST", "Integrated GST", "IGST Amount", "Total IGST",
    "IGST Collected", "IGST Payable", "IGST (Outward)",
    "Integrated Tax", "IGST on Supplies"

totalCGST:
  → "CGST", "Central GST", "CGST Amount", "Total CGST",
    "CGST Collected", "CGST Payable", "Central Tax",
    "CGST on Supplies"

totalSGST:
  → "SGST", "State GST", "SGST Amount", "Total SGST",
    "SGST/UTGST", "UTGST", "SGST Collected", "SGST Payable",
    "State Tax", "Union Territory Tax", "SGST on Supplies"

totalCess:
  → "Cess", "Total Cess", "GST Cess", "Compensation Cess",
    "Cess Payable", "Cess Amount"

totalTax (total GST = IGST + CGST + SGST):
  → "Total Tax", "Total GST", "Output Tax",
    "Total Output Tax", "Net GST", "Gross GST Liability",
    "Tax Amount", "Total Tax Payable (before ITC)"

totalInvoices:
  → "Number of Invoices", "Total Invoices", "Invoice Count",
    "No. of Transactions", "No. of Records"

b2bTaxableValue:
  → "B2B Supplies", "B2B Taxable Value", "Business to Business",
    "Supplies to Registered Persons", "B2B Invoice Value"

b2cTaxableValue:
  → "B2C Supplies", "B2C Taxable Value", "Business to Consumer",
    "Supplies to Unregistered Persons", "B2CS", "B2CL"

exportValue:
  → "Export Supplies", "Exports", "Zero Rated Supplies",
    "Export of Goods", "Export of Services",
    "SEZ Supplies", "IGST on Exports"

nilRatedValue / exemptValue:
  → "Nil Rated Supplies", "Exempt Supplies",
    "Non-taxable Supplies", "Nil Supplies",
    "Exempted Turnover"

inputTaxCredit (ITC available):
  → "Input Tax Credit", "ITC", "ITC Available", "Total ITC",
    "Eligible ITC", "ITC as per Books", "Total Input Tax Credit",
    "ITC on Inward Supplies", "ITC (IGST + CGST + SGST)"

itcIGST / itcCGST / itcSGST:
  → "ITC - IGST", "ITC - CGST", "ITC - SGST",
    "Input IGST", "Input CGST", "Input SGST"

itcUtilized:
  → "ITC Utilized", "ITC Availed", "ITC Used",
    "ITC Set Off", "Input Tax Set Off"

netTaxPayable:
  → "Net Tax Payable", "Tax to be Paid in Cash",
    "Balance Tax Payable", "Tax Payable after ITC",
    "Net GST Liability", "Tax Payable (Cash Ledger)"

taxPaidCash / taxPaidITC:
  → "Tax Paid in Cash", "Cash Payment", "Tax Paid through Cash Ledger",
    "Tax Paid through ITC", "Taxes Paid", "GST Paid"

lateFee:
  → "Late Fee", "Late Fees Paid", "Late Filing Fee",
    "Penalty", "Late Fee CGST", "Late Fee SGST"

interest:
  → "Interest", "Interest on Delayed Payment",
    "Interest Paid", "Interest Liability"

annualTurnover:
  → "Annual Turnover", "Aggregate Annual Turnover",
    "Total Annual Turnover", "Turnover for Registration",
    "Turnover in Preceding Financial Year"`;

    case "itr": return `
INCOME TAX RETURN / COMPUTATION SHEET KEYWORD ALIASES:

assessmentYear:
  → "Assessment Year", "AY", "A.Y.", "AY 20XX-XX",
    "Year of Assessment", "Financial Year (for which return filed)"

panNumber:
  → "PAN", "Permanent Account Number", "PAN No.", "PAN Number"

grossTotalIncome (before deductions):
  → "Gross Total Income", "GTI", "Total Income (before deductions)",
    "Income before Chapter VI-A deductions",
    "Gross Income", "Total of all heads of income",
    "Total Income (Schedule Part B-TI)"

deductions (Section 80 deductions):
  → "Deductions", "Chapter VI-A Deductions",
    "Total Deductions", "Sec 80C", "Section 80C",
    "80C + 80D + 80G + other deductions",
    "Deduction under Chapter VI-A",
    "Total of deductions", "80C Investments"

netTaxableIncome (after deductions):
  → "Net Taxable Income", "Taxable Income",
    "Total Income (Taxable)", "Net Income",
    "Total Income as per Return", "Chargeable Income",
    "Assessed Income", "Income after Deductions"

taxPayable (before relief):
  → "Tax Payable", "Tax on Total Income",
    "Income Tax", "Income Tax Payable",
    "Tax Computed at Applicable Rates",
    "Tax before Surcharge and Cess",
    "Tax (before Relief)"

netTaxLiability:
  → "Net Tax Liability", "Tax Due", "Net Tax Payable",
    "Total Tax Payable", "Tax Payable (after relief and rebate)",
    "Tax Payable after Rebate u/s 87A",
    "Tax + Surcharge + Cess - Relief"

taxPaid (taxes paid already):
  → "Tax Paid", "Total Tax Paid", "Advance Tax + TDS + SAT",
    "Taxes already Paid", "Tax Credits"

refundAmount:
  → "Refund", "Refund Due", "Refund Amount",
    "Amount Refundable", "Refund Claimed",
    "Tax Refund", "Excess Tax Paid"

salaryIncome:
  → "Salary", "Income from Salary", "Salaries",
    "Wages", "Income under Head Salaries",
    "Gross Salary", "Net Salary (after std deduction)"

businessIncome:
  → "Business Income", "Profit from Business",
    "Income from Business or Profession",
    "Net Profit from Business", "Income under PGBP",
    "Profits and Gains of Business or Profession",
    "Business Profit", "Net Business Income",
    "Income from Profession"

capitalGains:
  → "Capital Gains", "Short Term Capital Gains", "STCG",
    "Long Term Capital Gains", "LTCG",
    "Gain on Sale of Capital Assets",
    "Income from Capital Gains"

otherIncome:
  → "Other Income", "Income from Other Sources",
    "Interest Income", "Dividend Income",
    "Savings Interest", "FD Interest",
    "Lottery Income", "Winning Income",
    "Income from Other Sources (IFOS)"

housePropertyIncome:
  → "House Property Income", "Income from House Property",
    "Rental Income", "Net Annual Value",
    "Income under Head House Property",
    "Deemed Let Out", "Self-occupied Property"

tdsDeducted:
  → "TDS", "Tax Deducted at Source", "Total TDS",
    "TDS Deducted", "TDS Credit",
    "Tax Deducted", "TDS as per 26AS",
    "TDS as per AIS", "TDS Claimed"

advanceTaxPaid:
  → "Advance Tax", "Advance Tax Paid",
    "Self Assessment Tax", "SAT",
    "Advance Tax Installments",
    "Self Assessment Tax Paid"

surcharge:
  → "Surcharge", "Surcharge on Tax",
    "Surcharge @ 10%", "Surcharge @ 15%", "Marginal Relief"

educationCess:
  → "Education Cess", "Cess", "Health and Education Cess",
    "Cess @ 4%", "Education & Secondary Cess"

totalTaxWithCess:
  → "Total Tax + Cess", "Tax + Surcharge + Cess",
    "Total Tax Liability", "Gross Tax Payable",
    "Tax after Cess"`;
  }
}

function buildGeminiPrompt(text: string, docType: DocType): string {
  const schema    = buildFieldSchema(docType);
  const keywords  = buildKeywordGuide(docType);

  const docLabel: Record<DocType, string> = {
    balance_sheet: "Balance Sheet / Statement of Financial Position (Schedule VI / IND-AS / IGAAP / Tally / Busy / SAP)",
    profit_loss:   "Profit & Loss Statement / Trading & P&L Account / Income Statement",
    banking:       "Bank Statement / Bank CMA / Sanction Letter / Credit Facility Statement / Account Statement",
    gstr:          "GST Return — GSTR-1 / GSTR-3B / GSTR-9 / GSTR-9C / GST Portal Extract",
    itr:           "Income Tax Return — ITR-1 / ITR-2 / ITR-3 / ITR-4 / Computation of Income Sheet",
  };

  return `You are an expert Indian financial document parser with 20+ years of experience reading Indian accounting documents including Tally-generated reports, Schedule VI statements, IND-AS financials, IGAAP statements, GST portal exports, ITR computation sheets, and bank CMA formats.

DOCUMENT TYPE: ${docLabel[docType]}

TASK: Extract ALL financial values from the document text below and return ONLY a valid JSON object matching the exact schema provided.

━━━ EXTRACTION RULES ━━━

1. Return ONLY the JSON object. No explanation, no markdown, no code fences, no comments.

2. MONETARY VALUES — always plain numbers (never strings):
   • Indian comma format: 1,43,827 → 143827 | 12,34,56,789 → 123456789
   • Units in document header apply to ALL values:
     - "₹ in Lakhs" or "Rs. in Lakhs" or "(Lakhs)" → multiply each value by 100000
     - "₹ in Crores" or "(Crores)" → multiply by 10000000
     - "₹ in Thousands" → multiply by 1000
   • Parentheses = negative: (15,000) → -15000 | (1,23,456) → -123456
   • Values followed by "Dr" or "Cr": Dr = debit (could be negative), Cr = credit (positive)
   • Words: "Nil" or "–" or "N/A" → null; "Zero" → 0

3. LAYOUT HANDLING:
   • Horizontal (two-column) layouts: left side is usually Assets or Income; right side is Liabilities or Expenses
   • Vertical layouts: read top-to-bottom
   • Tally-generated reports: look for group totals, parent-child indentation
   • Schedules / Notes: the schedule values must match the referenced schedule number
   • Previous year column: IGNORE previous year values; always use CURRENT YEAR values
   • If two values exist for same field (current + previous year), take the FIRST / CURRENT year value

4. If a field is genuinely not present anywhere in the document, return null.

5. For percentage fields (utilization, interestRate), return the decimal number only — e.g. 75.5 not "75.5%".

6. String fields: return the actual text value as-is (clean, no leading/trailing spaces).

━━━ COMPREHENSIVE KEYWORD ALIASES ━━━
(Use ANY of these labels/headings to identify and map each field)
${keywords}

━━━ SCHEMA TO FILL ━━━
${schema}

━━━ DOCUMENT TEXT ━━━
${text.slice(0, 22000)}`;
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

  const raw = response.text ?? "{}";
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
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  try {
    const { text, format } = await extractRawText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname ?? "",
    );
    res.json({ text, format });
  } catch (err) {
    req.log.error({ err }, "parse-document failed");
    res.status(500).json({ message: "Failed to parse document" });
  }
});

router.post("/parse-financial", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const docType = (req.body?.docType ?? "") as DocType;
  const validTypes: DocType[] = ["balance_sheet", "profit_loss", "banking", "gstr", "itr"];
  if (!validTypes.includes(docType)) {
    res.status(400).json({
      message: `Invalid docType. Must be one of: ${validTypes.join(", ")}`,
    });
    return;
  }

  try {
    const { text, format } = await extractRawText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname ?? "",
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
