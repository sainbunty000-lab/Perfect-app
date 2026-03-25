/**
 * GST & ITR Document Parser
 * Extracts structured financial data from GSTR-1, GSTR-3B, ITR forms
 * Supports: PDF (text-extracted), Excel, Scanned Images (OCR), TXT
 *
 * Completely standalone — no dependency on WC or Banking modules.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GstrData {
  // GSTR-3B / GSTR-1 fields
  filingPeriod?: string;          // e.g. "Mar 2024" or "FY 2023-24"
  gstin?: string;
  legalName?: string;

  // Outward Supplies
  totalTaxableTurnover?: number;   // Total outward taxable supplies
  totalExemptSupplies?: number;    // Nil-rated / exempt
  totalNonGstSupplies?: number;

  // Tax Collected on Output
  igstCollected?: number;
  cgstCollected?: number;
  sgstCollected?: number;
  totalOutputTax?: number;

  // Input Tax Credit (ITC)
  itcIgstAvailable?: number;
  itcCgstAvailable?: number;
  itcSgstAvailable?: number;
  totalItcAvailable?: number;

  // ITC Utilized
  itcIgstUtilized?: number;
  itcCgstUtilized?: number;
  itcSgstUtilized?: number;
  totalItcUtilized?: number;

  // Net Tax Payable / Paid
  netTaxPayable?: number;
  taxPaidCash?: number;            // Paid via cash ledger
  interestPaid?: number;
  lateFee?: number;
}

export interface ItrData {
  assessmentYear?: string;         // e.g. "AY 2023-24"
  panNumber?: string;
  taxpayerName?: string;
  itrForm?: string;                // ITR-1, ITR-3, ITR-4 etc.

  // Income heads
  grossTotalIncome?: number;
  taxableIncome?: number;          // After deductions
  businessIncome?: number;         // Schedule BP / BP income
  housePropertyIncome?: number;
  capitalGains?: number;
  otherSourcesIncome?: number;
  salaryIncome?: number;

  // Deductions
  totalDeductions?: number;        // Chapter VI-A (80C, 80D etc.)

  // Tax computation
  taxPayable?: number;             // Before relief
  netTaxLiability?: number;        // After rebate / relief
  tdsDeducted?: number;
  advanceTaxPaid?: number;
  selfAssessmentTax?: number;
  totalTaxPaid?: number;

  // Refund / Due
  refundAmount?: number;
  taxDue?: number;
}

export interface GstItrResults {
  // Summary
  documentType: "GSTR" | "ITR" | "BOTH";
  gstr?: GstrData;
  itr?: ItrData;

  // Analysis Metrics
  itcUtilizationRatio?: number;     // ITC used / ITC available × 100
  taxBurdenRatio?: number;          // Net GST / Turnover × 100
  effectiveGstRate?: number;        // Total output tax / Taxable turnover × 100
  itcEfficiency?: number;           // ITC claimed / Output tax × 100
  effectiveTaxRate?: number;        // ITR: Tax payable / Total income × 100
  tdsCoverageRatio?: number;        // TDS / Net tax liability × 100
  businessIncomeRatio?: number;     // Business income / GTI × 100
  turnoverMatchScore?: number;      // GST turnover vs ITR income consistency (0–100)
  complianceScore?: number;         // Overall GST+ITR compliance rating (0–100)
  complianceGrade?: string;         // A / B / C / D
  flags: string[];                  // Red flags / observations
  strengths: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Number Parser — handles Indian format (1,23,456.00) + parentheses negatives
// ─────────────────────────────────────────────────────────────────────────────
function parseNum(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  const neg = /^\([\d,. ]+\)$/.test(s);
  const cleaned = s.replace(/[₹$€£]/g, "").replace(/\bRs\.?\b/gi, "")
    .replace(/\bINR\b/gi, "").replace(/\s/g, "").replace(/[()]/g, "")
    .replace(/,/g, "");
  const v = parseFloat(cleaned);
  if (isNaN(v)) return null;
  return neg ? -Math.abs(v) : v;
}

function extractNums(text: string): number[] {
  // Use parentheses for negatives only — avoids false matches in date strings like "31-03-2024"
  const m = text.match(/\([\d,]+(?:\.\d+)?\)|[\d,]+(?:\.\d+)?/g) || [];
  return m.map((s) => parseNum(s)).filter((n): n is number => n !== null && Math.abs(n) >= 0.01);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core line-by-line value finder
// ─────────────────────────────────────────────────────────────────────────────
function findVal(
  lines: string[],
  keywords: string[],
  opts?: { preferLast?: boolean; minVal?: number; excludeKw?: string[] }
): number | undefined {
  const { preferLast = false, minVal = 1, excludeKw = [] } = opts ?? {};
  const candidates: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (keywords.every((kw) => !lower.includes(kw.toLowerCase()))) continue;
    if (excludeKw.some((ex) => lower.includes(ex.toLowerCase()))) continue;

    const nums = extractNums(lines[i]).filter((n) => n >= minVal);
    if (nums.length > 0) {
      candidates.push(nums[nums.length - 1]);
    } else {
      // Check next 1–2 lines
      for (const d of [1, 2]) {
        if (i + d < lines.length) {
          const nNums = extractNums(lines[i + d]).filter((n) => n >= minVal);
          if (nNums.length > 0) { candidates.push(nNums[0]); break; }
        }
      }
    }
  }

  if (!candidates.length) return undefined;
  return preferLast ? candidates[candidates.length - 1] : candidates[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GSTR Text Parser
// Handles GSTR-3B and GSTR-1 text (from PDF/Excel/OCR)
// ─────────────────────────────────────────────────────────────────────────────
function parseGstrText(text: string): GstrData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullText = lines.join(" ").toLowerCase();
  const data: GstrData = {};

  // ── Filing period ──
  const periodMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* ?[-–]? ?20\d{2}\b/i)
    || text.match(/20\d{2}[-–]20?\d{2}/);
  if (periodMatch) data.filingPeriod = periodMatch[0].trim();

  // ── GSTIN ──
  const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
  if (gstinMatch) data.gstin = gstinMatch[0];

  // ── Outward Supplies / Turnover ──
  data.totalTaxableTurnover =
    findVal(lines, ["total taxable value", "taxable value", "outward taxable"]) ??
    findVal(lines, ["net taxable turnover", "taxable supplies", "gross turnover"], { preferLast: true }) ??
    findVal(lines, ["total turnover", "aggregate turnover"], { preferLast: true });

  data.totalExemptSupplies =
    findVal(lines, ["nil rated", "exempt supplies", "exempted supplies", "nil/exempt"]);

  // ── Output Tax Collected ──
  data.igstCollected =
    findVal(lines, ["igst", "integrated tax"], { excludeKw: ["itc", "credit", "eligible", "availed"] });
  data.cgstCollected =
    findVal(lines, ["cgst", "central tax"], { excludeKw: ["itc", "credit", "eligible", "availed"] });
  data.sgstCollected =
    findVal(lines, ["sgst", "state tax", "utgst", "state/ut tax"], { excludeKw: ["itc", "credit", "eligible", "availed"] });

  data.totalOutputTax =
    findVal(lines, ["total tax liability", "total output tax", "total tax on outward"], { preferLast: true }) ??
    ((data.igstCollected ?? 0) + (data.cgstCollected ?? 0) + (data.sgstCollected ?? 0) || undefined);

  // ── Input Tax Credit ──
  data.itcIgstAvailable =
    findVal(lines, ["itc", "igst"], { excludeKw: ["utilized", "balance", "payable"] });
  data.itcCgstAvailable =
    findVal(lines, ["itc", "cgst"], { excludeKw: ["utilized", "balance", "payable"] });
  data.itcSgstAvailable =
    findVal(lines, ["itc", "sgst", "state"], { excludeKw: ["utilized", "balance", "payable"] });

  data.totalItcAvailable =
    findVal(lines, ["total itc available", "total eligible itc", "total input tax credit available"], { preferLast: true }) ??
    findVal(lines, ["eligible itc", "available itc"], { preferLast: true });

  data.totalItcUtilized =
    findVal(lines, ["itc utilized", "total itc utilized", "itc used"], { preferLast: true }) ??
    findVal(lines, ["itc set off", "credit utilized"], { preferLast: true });

  // ── Net Tax / Paid ──
  data.netTaxPayable =
    findVal(lines, ["net tax payable", "tax payable", "net liability"], { preferLast: true });
  data.taxPaidCash =
    findVal(lines, ["cash ledger", "tax paid in cash", "paid from cash"], { preferLast: true });
  data.interestPaid =
    findVal(lines, ["interest paid", "interest on delayed", "interest liability"]);
  data.lateFee =
    findVal(lines, ["late fee", "late fees", "penalty paid"]);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITR Text Parser
// Handles ITR-1, ITR-3, ITR-4, Computation of Income sheets
// ─────────────────────────────────────────────────────────────────────────────
function parseItrText(text: string): ItrData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const data: ItrData = {};

  // ── Assessment Year ──
  const ayMatch = text.match(/a\.?y\.? ?20\d{2}[-–]20?\d{2}/i)
    || text.match(/assessment year[: ]+20\d{2}[-–]20?\d{2}/i);
  if (ayMatch) data.assessmentYear = ayMatch[0].replace(/assessment year[: ]*/i, "").trim();

  // ── PAN ──
  const panMatch = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  if (panMatch) data.panNumber = panMatch[0];

  // ── ITR Form ──
  const itrFormMatch = text.match(/\bitr[-‐– ]?[1-7u]\b/i);
  if (itrFormMatch) data.itrForm = itrFormMatch[0].toUpperCase().replace(/[-‐– ]/, "-");

  // ── Income heads ──
  data.salaryIncome =
    findVal(lines, ["income from salary", "salary income", "income under head salary", "gross salary"]) ??
    findVal(lines, ["salaries"]);

  data.businessIncome =
    findVal(lines, ["profit and gains from business", "profits and gains of business",
      "income from business", "business income", "net profit from business",
      "presumptive income", "income u/s 44", "income under section 44"]);

  data.housePropertyIncome =
    findVal(lines, ["income from house property", "house property income", "annual value"]);

  data.capitalGains =
    findVal(lines, ["capital gains", "income from capital gains", "short term capital", "long term capital"],
      { excludeKw: ["loss from capital"] });

  data.otherSourcesIncome =
    findVal(lines, ["income from other sources", "other sources", "income u/s 56"],
      { excludeKw: ["negative", "loss"] });

  data.grossTotalIncome =
    findVal(lines, ["gross total income", "total of income", "total income before deductions"], { preferLast: true }) ??
    findVal(lines, ["aggregate income", "total gross income"], { preferLast: true });

  data.totalDeductions =
    findVal(lines, ["total deductions", "deductions u/s 80", "total vi-a deductions",
      "deductions under chapter vi-a", "total chapter vi-a"], { preferLast: true });

  data.taxableIncome =
    findVal(lines, ["total taxable income", "taxable income", "net income", "income chargeable to tax"],
      { preferLast: true }) ??
    findVal(lines, ["total income (d)", "total income after deductions"], { preferLast: true });

  // ── Tax Computation ──
  data.taxPayable =
    findVal(lines, ["income tax payable", "tax on total income", "tax computed", "income tax on total"],
      { preferLast: true, excludeKw: ["rebate", "relief", "surcharge", "cess"] });

  data.netTaxLiability =
    findVal(lines, ["net tax liability", "total tax liability", "income tax liability after rebate",
      "tax liability after rebate", "total income tax payable after rebate"], { preferLast: true });

  data.tdsDeducted =
    findVal(lines, ["total tds", "tds deducted", "tax deducted at source", "tds credit",
      "tds/tcs credit", "tds claimed"], { preferLast: true });

  data.advanceTaxPaid =
    findVal(lines, ["advance tax", "advance tax paid", "advance tax deposited"]);

  data.selfAssessmentTax =
    findVal(lines, ["self assessment tax", "self-assessment tax paid"]);

  data.totalTaxPaid =
    findVal(lines, ["total taxes paid", "total tax paid", "total payment"], { preferLast: true }) ??
    ((data.tdsDeducted ?? 0) + (data.advanceTaxPaid ?? 0) + (data.selfAssessmentTax ?? 0) || undefined);

  data.refundAmount =
    findVal(lines, ["refund due", "refund amount", "refund payable", "tax refund"]);

  data.taxDue =
    findVal(lines, ["tax due", "balance tax", "tax payable after tds", "tax still due"]);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document type detector
// ─────────────────────────────────────────────────────────────────────────────
function detectDocType(text: string): "GSTR" | "ITR" | "BOTH" | "UNKNOWN" {
  const lower = text.toLowerCase();
  const hasGst = lower.includes("gstr") || lower.includes("gst3b") || lower.includes("gstin")
    || lower.includes("outward supplies") || lower.includes("input tax credit")
    || lower.includes("itc availed") || lower.includes("gst return");
  const hasItr = lower.includes("income tax return") || lower.includes("assessment year")
    || lower.includes("itr-") || lower.includes("income chargeable to tax")
    || lower.includes("gross total income") || lower.includes("advance tax")
    || lower.includes("tax deducted at source") || lower.includes("pan:");
  if (hasGst && hasItr) return "BOTH";
  if (hasGst) return "GSTR";
  if (hasItr) return "ITR";
  return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Engine
// ─────────────────────────────────────────────────────────────────────────────
export function analyzeGstItr(gstr?: GstrData, itr?: ItrData): GstItrResults {
  const flags: string[] = [];
  const strengths: string[] = [];
  let score = 60;

  // ── GST Metrics ──
  let itcUtilizationRatio: number | undefined;
  let taxBurdenRatio: number | undefined;
  let effectiveGstRate: number | undefined;
  let itcEfficiency: number | undefined;

  if (gstr) {
    const turnover = gstr.totalTaxableTurnover ?? 0;
    const outputTax = gstr.totalOutputTax ?? 0;
    const itcAvail = gstr.totalItcAvailable ?? 0;
    const itcUsed = gstr.totalItcUtilized ?? itcAvail;
    const netGst = gstr.netTaxPayable ?? 0;

    if (itcAvail > 0) {
      itcUtilizationRatio = Math.min(100, (itcUsed / itcAvail) * 100);
      if (itcUtilizationRatio >= 90) { strengths.push("High ITC utilization — minimal credit wastage."); score += 8; }
      else if (itcUtilizationRatio < 50) { flags.push("Low ITC utilization — potential credit loss."); score -= 5; }
    }

    if (turnover > 0 && outputTax > 0) {
      effectiveGstRate = (outputTax / turnover) * 100;
      taxBurdenRatio = (netGst / turnover) * 100;
      itcEfficiency = itcAvail > 0 ? Math.min(100, (itcAvail / outputTax) * 100) : 0;

      if (effectiveGstRate < 5) strengths.push("Low effective GST rate — favorable tax position.");
      if (itcEfficiency >= 80) { strengths.push("Strong ITC coverage against output liability."); score += 5; }
    }

    if ((gstr.lateFee ?? 0) > 0) { flags.push("Late fee paid — indicates delayed filing."); score -= 8; }
    else strengths.push("No late fees — compliant GST filing.");

    if ((gstr.interestPaid ?? 0) > 0) { flags.push("Interest paid on delayed payment."); score -= 5; }

    if (turnover > 0 && netGst > 0 && netGst / turnover > 0.18) {
      flags.push("High cash outflow for GST — review ITC claims.");
      score -= 5;
    }
  }

  // ── ITR Metrics ──
  let effectiveTaxRate: number | undefined;
  let tdsCoverageRatio: number | undefined;
  let businessIncomeRatio: number | undefined;
  let turnoverMatchScore: number | undefined;

  if (itr) {
    const gti = itr.grossTotalIncome ?? 0;
    const taxable = itr.taxableIncome ?? gti;
    const taxPay = itr.netTaxLiability ?? itr.taxPayable ?? 0;
    const tds = itr.tdsDeducted ?? 0;
    const bizIncome = itr.businessIncome ?? 0;

    if (taxable > 0 && taxPay > 0) {
      effectiveTaxRate = (taxPay / taxable) * 100;
      if (effectiveTaxRate < 5) strengths.push("Low effective income tax rate.");
      else if (effectiveTaxRate > 30) { flags.push("Very high effective tax rate — review deductions."); score -= 5; }
    }

    if (taxPay > 0 && tds > 0) {
      tdsCoverageRatio = Math.min(100, (tds / taxPay) * 100);
      if (tdsCoverageRatio >= 90) strengths.push("TDS covers most of the tax liability.");
      else if (tdsCoverageRatio < 30) { flags.push("Low TDS coverage — high cash tax payment required."); score -= 3; }
    }

    if (gti > 0 && bizIncome > 0) {
      businessIncomeRatio = (bizIncome / gti) * 100;
    }

    if ((itr.taxDue ?? 0) > 50000) { flags.push("Significant tax due — cash flow impact."); score -= 5; }
    if ((itr.refundAmount ?? 0) > 0) strengths.push("Tax refund due — overpaid advance tax or TDS.");

    // ── GST vs ITR Turnover consistency check ──
    if (gstr && gstr.totalTaxableTurnover && gti > 0) {
      const gstTurnover = gstr.totalTaxableTurnover;
      const itrIncome = itr.businessIncome ?? itr.grossTotalIncome ?? 0;
      const variance = Math.abs(gstTurnover - itrIncome) / Math.max(gstTurnover, itrIncome);
      turnoverMatchScore = Math.round((1 - variance) * 100);
      if (turnoverMatchScore >= 80) strengths.push("GST turnover closely matches ITR declared income — consistent records.");
      else if (turnoverMatchScore < 50) {
        flags.push("Significant gap between GST turnover and ITR income — reconciliation needed.");
        score -= 10;
      }
    }
  }

  // Final scoring
  score = Math.max(10, Math.min(100, score));
  const complianceGrade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";

  if (flags.length === 0) strengths.push("No major compliance issues detected.");

  const docType: "GSTR" | "ITR" | "BOTH" = gstr && itr ? "BOTH" : itr ? "ITR" : "GSTR";

  return {
    documentType: docType,
    gstr,
    itr,
    itcUtilizationRatio: itcUtilizationRatio !== undefined ? +itcUtilizationRatio.toFixed(1) : undefined,
    taxBurdenRatio: taxBurdenRatio !== undefined ? +taxBurdenRatio.toFixed(2) : undefined,
    effectiveGstRate: effectiveGstRate !== undefined ? +effectiveGstRate.toFixed(2) : undefined,
    itcEfficiency: itcEfficiency !== undefined ? +itcEfficiency.toFixed(1) : undefined,
    effectiveTaxRate: effectiveTaxRate !== undefined ? +effectiveTaxRate.toFixed(1) : undefined,
    tdsCoverageRatio: tdsCoverageRatio !== undefined ? +tdsCoverageRatio.toFixed(1) : undefined,
    businessIncomeRatio: businessIncomeRatio !== undefined ? +businessIncomeRatio.toFixed(1) : undefined,
    turnoverMatchScore,
    complianceScore: score,
    complianceGrade,
    flags,
    strengths,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — parse any file
// ─────────────────────────────────────────────────────────────────────────────
export async function parseGstItrFile(file: File): Promise<{
  type: "GSTR" | "ITR" | "BOTH" | "UNKNOWN";
  gstr?: GstrData;
  itr?: ItrData;
}> {
  const { extractTextFromFile } = await import("./fileReader");
  const text = await extractTextFromFile(file);
  const type = detectDocType(text);

  const gstr = (type === "GSTR" || type === "BOTH") ? parseGstrText(text) : undefined;
  const itr  = (type === "ITR"  || type === "BOTH") ? parseItrText(text)  : undefined;

  // If unknown, try both parsers — user may have uploaded a computation sheet
  if (type === "UNKNOWN") {
    const g = parseGstrText(text);
    const i = parseItrText(text);
    const hasGstData = g.totalTaxableTurnover || g.totalOutputTax || g.totalItcAvailable;
    const hasItrData = i.grossTotalIncome || i.taxableIncome || i.taxPayable;
    return {
      type: hasGstData || hasItrData ? (hasGstData && hasItrData ? "BOTH" : hasGstData ? "GSTR" : "ITR") : "UNKNOWN",
      gstr: hasGstData ? g : undefined,
      itr: hasItrData ? i : undefined,
    };
  }

  return { type, gstr, itr };
}
