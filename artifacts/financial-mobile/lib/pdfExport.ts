/**
 * PDF export for mobile — generates a styled HTML report and
 * converts it to PDF using expo-print, then shares via expo-sharing.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { WorkingCapitalData, WorkingCapitalResults } from "./calculations";
import type { BankingData, BankingResults } from "./calculations";

const BRAND_COLOR = "#20B2AA";
const NAVY = "#0D1B2A";

const css = `
  body { font-family: Helvetica, Arial, sans-serif; background: #fff; color: #1a1a2e; margin: 0; padding: 0; }
  .header { background: ${NAVY}; color: white; padding: 28px 32px 20px; }
  .brand { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: ${BRAND_COLOR}; margin-bottom: 6px; }
  .title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #8BA8C0; margin: 0; }
  .section { padding: 20px 32px; border-bottom: 1px solid #eef0f4; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${BRAND_COLOR}; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .metric { background: #f7f9fc; border-radius: 8px; padding: 12px 14px; }
  .metric-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #7a8fa6; margin-bottom: 4px; }
  .metric-value { font-size: 17px; font-weight: 700; color: ${NAVY}; }
  .metric-value.good { color: #16a34a; }
  .metric-value.warn { color: #d97706; }
  .metric-value.bad  { color: #dc2626; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f2f5; }
  .row-label { font-size: 11px; color: #6b7280; }
  .row-value { font-size: 11px; font-weight: 600; color: ${NAVY}; }
  .highlight { background: ${BRAND_COLOR}; color: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
  .hl-label { font-size: 11px; opacity: 0.85; }
  .hl-value { font-size: 20px; font-weight: 700; }
  .score-box { background: ${NAVY}; color: white; border-radius: 8px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
  .score-num { font-size: 40px; font-weight: 700; color: ${BRAND_COLOR}; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .badge { background: #f0fdf4; color: #15803d; border-radius: 6px; padding: 4px 10px; font-size: 10px; font-weight: 600; }
  .badge.warn { background: #fffbeb; color: #92400e; }
  .badge.bad  { background: #fef2f2; color: #991b1b; }
  .footer { background: #f7f9fc; padding: 16px 32px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
`;

function INR(n?: number) {
  if (n === undefined) return "—";
  return "₹" + Math.abs(n).toLocaleString("en-IN");
}
function PCT(n?: number) {
  return n !== undefined ? n.toFixed(1) + "%" : "—";
}
function today() {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Working Capital PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function exportWorkingCapitalPDF(
  clientName: string,
  data: WorkingCapitalData,
  results: WorkingCapitalResults
) {
  const cr = results.currentRatio ?? 0;
  const qr = results.quickRatio ?? 0;
  const it = results.inventoryTurnover ?? 0;
  const dd = results.debtorDays ?? 0;
  const cd = results.creditorDays ?? 0;
  const wcc = results.workingCapitalCycle ?? 0;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="header">
      <div class="brand">Dhanush Enterprises</div>
      <div class="title">Working Capital Analysis</div>
      <div class="subtitle">${clientName} &nbsp;·&nbsp; ${today()}</div>
    </div>

    <div class="section">
      <div class="section-title">Eligibility Summary</div>
      <div class="highlight">
        <div><div class="hl-label">Eligibility Amount</div><div class="hl-value">${INR(results.eligibilityAmount)}</div></div>
        <div><div class="hl-label">Net Working Capital</div><div class="hl-value">${INR(results.workingCapitalAmount)}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Key Ratios</div>
      <div class="grid">
        <div class="metric"><div class="metric-label">Current Ratio</div>
          <div class="metric-value ${cr >= 1.33 ? "good" : cr >= 1 ? "warn" : "bad"}">${cr.toFixed(2)}x</div></div>
        <div class="metric"><div class="metric-label">Quick Ratio</div>
          <div class="metric-value ${qr >= 1 ? "good" : "warn"}">${qr.toFixed(2)}x</div></div>
        <div class="metric"><div class="metric-label">Inv. Turnover</div>
          <div class="metric-value ${it >= 4 ? "good" : "warn"}">${it.toFixed(2)}x</div></div>
        <div class="metric"><div class="metric-label">Debtor Days</div>
          <div class="metric-value ${dd <= 90 ? "good" : "warn"}">${dd.toFixed(0)}d</div></div>
        <div class="metric"><div class="metric-label">Creditor Days</div>
          <div class="metric-value">${cd.toFixed(0)}d</div></div>
        <div class="metric"><div class="metric-label">WC Cycle</div>
          <div class="metric-value ${wcc < 60 ? "good" : "warn"}">${wcc.toFixed(0)}d</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Profitability</div>
      <div class="grid">
        <div class="metric"><div class="metric-label">Gross Margin</div>
          <div class="metric-value ${(results.grossProfitMargin ?? 0) >= 20 ? "good" : "warn"}">${PCT(results.grossProfitMargin)}</div></div>
        <div class="metric"><div class="metric-label">Net Margin</div>
          <div class="metric-value ${(results.netProfitMargin ?? 0) >= 10 ? "good" : "warn"}">${PCT(results.netProfitMargin)}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Balance Sheet Data</div>
      ${[
        ["Current Assets", INR(data.currentAssets)],
        ["Current Liabilities", INR(data.currentLiabilities)],
        ["Inventory", INR(data.inventory)],
        ["Debtors", INR(data.debtors)],
        ["Creditors", INR(data.creditors)],
        ["Cash & Bank", INR(data.cash)],
      ].map(([l, v]) => `<div class="row"><span class="row-label">${l}</span><span class="row-value">${v}</span></div>`).join("")}
    </div>

    <div class="section">
      <div class="section-title">P&L Data</div>
      ${[
        ["Sales / Revenue", INR(data.sales)],
        ["Cost of Goods Sold", INR(data.cogs)],
        ["Purchases", INR(data.purchases)],
        ["Operating Expenses", INR(data.expenses)],
        ["Net Profit", INR(data.netProfit)],
      ].map(([l, v]) => `<div class="row"><span class="row-label">${l}</span><span class="row-value">${v}</span></div>`).join("")}
    </div>

    <div class="footer">
      <span>Dhanush Enterprises — Confidential</span>
      <span>Generated: ${today()}</span>
    </div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `WC Analysis — ${clientName}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Banking PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function exportBankingPDF(
  clientName: string,
  data: BankingData,
  results: BankingResults
) {
  const s = results.overallScore;
  const scoreClass = s >= 75 ? "good" : s >= 55 ? "warn" : "bad";

  const badgeClass = (v: string) =>
    ["Strong", "Positive", "Low", "Adequate", "Stable", "Disciplined"].includes(v)
      ? "" : ["Weak", "Negative", "High"].includes(v) ? "bad" : "warn";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="header">
      <div class="brand">Dhanush Enterprises</div>
      <div class="title">Banking Performance Analysis</div>
      <div class="subtitle">${clientName} &nbsp;·&nbsp; ${today()}</div>
    </div>

    <div class="section">
      <div class="section-title">Overall Score</div>
      <div class="score-box">
        <div>
          <div style="font-size:13px;color:#8BA8C0;margin-bottom:4px;">Credit Risk Assessment</div>
          <div style="font-size:17px;font-weight:700;">${results.creditRiskAssessment}</div>
          <div style="font-size:12px;margin-top:6px;color:#8BA8C0;">Risk Level: ${results.riskLevel}</div>
        </div>
        <div class="score-num">${s}<span style="font-size:18px;color:#8BA8C0;">/100</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Assessment Parameters</div>
      <div class="badges">
        ${[
          ["Working Capital", results.workingCapitalPosition],
          ["Liquidity", results.liquidityPosition],
          ["Cash Flow", results.cashFlowPosition],
          ["Creditworthiness", results.creditworthiness],
          ["Repayment Capacity", results.repaymentCapacity],
          ["Financial Stability", results.financialStability],
          ["Banking Behavior", results.bankingBehavior],
        ].map(([l, v]) => `<span class="badge ${badgeClass(v ?? "")}">${l}: ${v ?? "—"}</span>`).join("")}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Statement Data</div>
      ${[
        ["Total Credits", INR(data.totalCredits)],
        ["Total Debits", INR(data.totalDebits)],
        ["Average Balance", INR(data.averageBalance)],
        ["Minimum Balance", INR(data.minimumBalance)],
        ["Opening Balance", INR(data.openingBalance)],
        ["Closing Balance", INR(data.closingBalance)],
        ["Cash Deposits", INR(data.cashDeposits)],
        ["Cheque Bounces", String(data.chequeReturns ?? 0)],
        ["Loan Repayments", INR(data.loanRepayments)],
        ["ECS / EMI", INR(data.ecsEmiPayments)],
        ["Overdraft Usage", INR(data.overdraftUsage)],
        ["Transactions", String(data.transactionFrequency ?? 0)],
      ].map(([l, v]) => `<div class="row"><span class="row-label">${l}</span><span class="row-value">${v}</span></div>`).join("")}
    </div>

    <div class="footer">
      <span>Dhanush Enterprises — Confidential</span>
      <span>Generated: ${today()}</span>
    </div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Banking Analysis — ${clientName}` });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GST & ITR PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function exportGstItrPDF(clientName: string, analysisText: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}
    pre { font-size: 12px; line-height: 1.6; white-space: pre-wrap; color: #1a1a2e; }
  </style></head><body>
    <div class="header">
      <div class="brand">Dhanush Enterprises</div>
      <div class="title">GST & ITR Analysis Report</div>
      <div class="subtitle">${clientName} &nbsp;·&nbsp; ${today()}</div>
    </div>
    <div class="section">
      <pre>${analysisText}</pre>
    </div>
    <div class="footer">
      <span>Dhanush Enterprises — Confidential</span>
      <span>Generated: ${today()}</span>
    </div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `GST-ITR Analysis — ${clientName}` });
  }
}
