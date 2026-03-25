/**
 * Multi-Year Financial Analysis — calculation engine
 * Completely independent — no dependency on WC or Banking modules
 */

import type { WorkingCapitalData } from "./parser";
import { calculateWorkingCapital } from "./calculations";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface YearEntry {
  label: string;               // e.g. "FY 2022-23"
  data: WorkingCapitalData;
}

export interface YearMetrics {
  label: string;
  sales: number;
  netProfit: number;
  expenses: number;
  currentAssets: number;
  currentLiabilities: number;
  workingCapital: number;
  currentRatio: number;
  quickRatio: number;
  netProfitMargin: number;
  grossProfitMargin: number;
  eligibilityAmount: number;
}

export type TrendDirection = "Increasing" | "Decreasing" | "Fluctuating" | "Stable";

export interface MultiYearTrends {
  salesGrowthRates: number[];       // YoY % (index 0 = Y1→Y2)
  profitGrowthRates: number[];
  expenseGrowthRates: number[];
  avgSalesGrowth: number;
  avgProfitGrowth: number;
  avgExpenseGrowth: number;
  salesTrend: TrendDirection;
  profitTrend: TrendDirection;
  stabilityScore: number;           // 0–100
  consistencyScore: number;         // standard deviation proxy
}

export interface MultiYearEligibility {
  simpleAvgEligibility: number;     // straight average
  weightedEligibility: number;      // recent year weighted 2x
  growthAdjustedEligibility: number; // with growth bonus / penalty
  growthFactor: number;             // multiplier applied
  reasoning: string;
}

export interface MultiYearResults {
  yearMetrics: YearMetrics[];
  trends: MultiYearTrends;
  eligibility: MultiYearEligibility;
  overallHealth: "Excellent" | "Good" | "Moderate" | "Weak";
  flags: string[];
  strengths: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function growthRate(prev: number, curr: number): number {
  if (!prev || prev === 0) return 0;
  return +((( curr - prev) / Math.abs(prev)) * 100).toFixed(1);
}

function detectTrend(values: number[]): TrendDirection {
  if (values.length < 2) return "Stable";
  const diffs = values.slice(1).map((v, i) => v - values[i]);
  const allUp   = diffs.every((d) => d > 0);
  const allDown = diffs.every((d) => d < 0);
  if (allUp) return "Increasing";
  if (allDown) return "Decreasing";
  // Fluctuating: at least one reversal
  let reversals = 0;
  for (let i = 1; i < diffs.length; i++) {
    if ((diffs[i] > 0 && diffs[i - 1] < 0) || (diffs[i] < 0 && diffs[i - 1] > 0)) reversals++;
  }
  return reversals > 0 ? "Fluctuating" : "Stable";
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main calculation
// ─────────────────────────────────────────────────────────────────────────────

export function calculateMultiYear(entries: YearEntry[]): MultiYearResults {
  if (entries.length === 0) throw new Error("No year data provided");

  // Build per-year metrics
  const yearMetrics: YearMetrics[] = entries.map((entry) => {
    const wc = calculateWorkingCapital(entry.data);
    const sales   = entry.data.sales   || 0;
    const profit  = entry.data.netProfit || 0;
    const expenses = entry.data.expenses || (sales - profit);
    return {
      label: entry.label,
      sales,
      netProfit: profit,
      expenses,
      currentAssets:      entry.data.currentAssets      || 0,
      currentLiabilities: entry.data.currentLiabilities || 0,
      workingCapital:     wc.workingCapitalAmount,
      currentRatio:       wc.currentRatio,
      quickRatio:         wc.quickRatio,
      netProfitMargin:    wc.netProfitMargin,
      grossProfitMargin:  wc.grossProfitMargin,
      eligibilityAmount:  wc.eligibilityAmount,
    };
  });

  // Trend calculations
  const salesValues   = yearMetrics.map((y) => y.sales);
  const profitValues  = yearMetrics.map((y) => y.netProfit);
  const expenseValues = yearMetrics.map((y) => y.expenses);

  const salesGrowthRates   = salesValues.slice(1).map((v, i) => growthRate(salesValues[i], v));
  const profitGrowthRates  = profitValues.slice(1).map((v, i) => growthRate(profitValues[i], v));
  const expenseGrowthRates = expenseValues.slice(1).map((v, i) => growthRate(expenseValues[i], v));

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgSalesGrowth   = +avg(salesGrowthRates).toFixed(1);
  const avgProfitGrowth  = +avg(profitGrowthRates).toFixed(1);
  const avgExpenseGrowth = +avg(expenseGrowthRates).toFixed(1);

  const salesTrend  = detectTrend(salesValues);
  const profitTrend = detectTrend(profitValues);

  // Stability score: based on consistency of growth
  const salesSD = stdDev(salesGrowthRates);
  let stabilityScore = 100;
  stabilityScore -= Math.min(40, salesSD * 2);         // penalise high volatility
  if (salesTrend === "Decreasing")   stabilityScore -= 20;
  if (profitTrend === "Decreasing")  stabilityScore -= 15;
  if (avgSalesGrowth < 0)            stabilityScore -= 10;
  stabilityScore = Math.max(10, Math.min(100, Math.round(stabilityScore)));

  // Consistency score (inverted CV)
  const consistencyScore = Math.max(0, Math.min(100, Math.round(100 - salesSD)));

  const trends: MultiYearTrends = {
    salesGrowthRates,
    profitGrowthRates,
    expenseGrowthRates,
    avgSalesGrowth,
    avgProfitGrowth,
    avgExpenseGrowth,
    salesTrend,
    profitTrend,
    stabilityScore,
    consistencyScore,
  };

  // Eligibility calculation
  const eligibilities = yearMetrics.map((y) => y.eligibilityAmount);
  const n = eligibilities.length;

  // Simple average
  const simpleAvgEligibility = Math.round(avg(eligibilities));

  // Weighted: most recent year gets 2 weight, others 1
  let weightedSum = 0, totalWeight = 0;
  eligibilities.forEach((e, i) => {
    const w = i === n - 1 ? 2 : 1;
    weightedSum += e * w;
    totalWeight += w;
  });
  const weightedEligibility = Math.round(weightedSum / totalWeight);

  // Growth factor: strong growth = up to +15% bonus; decline = up to -20% penalty
  let growthFactor = 1.0;
  let reasoning = "";
  if (avgSalesGrowth >= 20) {
    growthFactor = 1.15;
    reasoning = "Strong consistent growth (≥20% p.a.) adds 15% to eligibility.";
  } else if (avgSalesGrowth >= 10) {
    growthFactor = 1.08;
    reasoning = "Healthy growth (10–20% p.a.) adds 8% to eligibility.";
  } else if (avgSalesGrowth >= 0) {
    growthFactor = 1.0;
    reasoning = "Stable sales — eligibility maintained at weighted average.";
  } else if (avgSalesGrowth >= -10) {
    growthFactor = 0.9;
    reasoning = "Moderate decline (0–10% p.a.) reduces eligibility by 10%.";
  } else {
    growthFactor = 0.75;
    reasoning = "Significant decline (>10% p.a.) reduces eligibility by 25%.";
  }

  // Stability bonus
  if (stabilityScore >= 80) {
    growthFactor = +(growthFactor * 1.05).toFixed(2);
    reasoning += " High stability adds further 5%.";
  } else if (stabilityScore < 50) {
    growthFactor = +(growthFactor * 0.95).toFixed(2);
    reasoning += " Volatile performance reduces by 5%.";
  }

  const growthAdjustedEligibility = Math.round(weightedEligibility * growthFactor);

  const eligibility: MultiYearEligibility = {
    simpleAvgEligibility,
    weightedEligibility,
    growthAdjustedEligibility,
    growthFactor,
    reasoning,
  };

  // Flags and strengths
  const flags: string[] = [];
  const strengths: string[] = [];

  if (salesTrend === "Decreasing") flags.push("Sales declining over the period — investigate market/product issues.");
  if (profitTrend === "Decreasing") flags.push("Profitability declining — review cost structure and margins.");
  if (avgExpenseGrowth > avgSalesGrowth + 5) flags.push("Expenses growing faster than sales — margin compression risk.");
  if (stabilityScore < 50) flags.push("Volatile performance — high fluctuation in key metrics.");

  if (salesTrend === "Increasing") strengths.push("Consistent sales growth demonstrates business momentum.");
  if (profitTrend === "Increasing") strengths.push("Improving profitability trend — strong operational leverage.");
  if (avgSalesGrowth >= 15) strengths.push(`High average growth rate (${avgSalesGrowth}% p.a.) strengthens credit profile.`);
  if (stabilityScore >= 75) strengths.push("Stable financial performance over multiple years.");
  if (!strengths.length) strengths.push("Multi-year data available for informed credit assessment.");

  // Overall health
  let overallHealth: MultiYearResults["overallHealth"] = "Moderate";
  const healthScore =
    (salesTrend === "Increasing" ? 30 : salesTrend === "Stable" ? 20 : 5) +
    (profitTrend === "Increasing" ? 30 : profitTrend === "Stable" ? 20 : 5) +
    (stabilityScore >= 75 ? 20 : stabilityScore >= 50 ? 10 : 0) +
    (avgSalesGrowth >= 10 ? 20 : avgSalesGrowth >= 0 ? 10 : 0);

  if (healthScore >= 80) overallHealth = "Excellent";
  else if (healthScore >= 60) overallHealth = "Good";
  else if (healthScore >= 35) overallHealth = "Moderate";
  else overallHealth = "Weak";

  return { yearMetrics, trends, eligibility, overallHealth, flags, strengths };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary paragraph generator
// Used by dashboard to dynamically describe the combined financial picture
// ─────────────────────────────────────────────────────────────────────────────

export interface SummaryInputs {
  wcEligibility?: number;
  wcCurrentRatio?: number;
  wcCycle?: number;
  bankingScore?: number;
  bankingRisk?: string;
  bankingGrade?: string;
  multiYearGrowth?: number;
  multiYearTrend?: string;
  multiYearEligibility?: number;
  multiYearHealth?: string;
}

export function generateSummaryParagraph(inputs: SummaryInputs): string {
  const {
    wcEligibility, wcCurrentRatio, wcCycle,
    bankingScore, bankingRisk, bankingGrade,
    multiYearGrowth, multiYearTrend, multiYearEligibility, multiYearHealth,
  } = inputs;

  const hasWC      = wcEligibility !== undefined;
  const hasBanking = bankingScore  !== undefined;
  const hasMulti   = multiYearEligibility !== undefined;

  if (!hasWC && !hasBanking && !hasMulti) {
    return "No analysis data available yet. Complete at least one module (Working Capital, Banking, or Multi-Year) to generate the financial summary.";
  }

  const parts: string[] = [];

  // WC sentence
  if (hasWC) {
    const ratioLabel = (wcCurrentRatio || 0) >= 2 ? "strong" : (wcCurrentRatio || 0) >= 1.33 ? "adequate" : "tight";
    const cycleLabel = (wcCycle || 0) <= 30 ? "efficient" : (wcCycle || 0) <= 90 ? "moderate" : "extended";
    parts.push(
      `The business demonstrates a ${ratioLabel} working capital position with a current ratio of ${(wcCurrentRatio || 0).toFixed(2)}x and a ${cycleLabel} working capital cycle of ${wcCycle || 0} days.`
    );
    if (wcEligibility > 0) {
      parts.push(
        `Based on the balance sheet analysis, estimated working capital eligibility stands at ₹${wcEligibility.toLocaleString("en-IN")}.`
      );
    }
  }

  // Banking sentence
  if (hasBanking) {
    const riskLabel = bankingRisk === "Low" ? "low credit risk" : bankingRisk === "High" ? "elevated credit risk" : "moderate credit risk";
    parts.push(
      `Banking analysis indicates ${riskLabel} with an overall score of ${bankingScore}/100 (${bankingGrade || ""}). ${
        bankingRisk === "Low"
          ? "The banking behavior is disciplined with stable cash flows."
          : bankingRisk === "High"
          ? "Some irregularities noted — recommend additional due diligence."
          : "Banking patterns are regular with scope for improvement."
      }`
    );
  }

  // Multi-year sentence
  if (hasMulti) {
    const trendLabel = multiYearTrend === "Increasing" ? "consistent upward" : multiYearTrend === "Decreasing" ? "declining" : "fluctuating";
    const growthStr  = multiYearGrowth !== undefined ? ` at an average of ${multiYearGrowth}% per annum` : "";
    parts.push(
      `Multi-year analysis reveals a ${trendLabel} sales trend${growthStr}. The business health is rated ${multiYearHealth || "Moderate"}, with a multi-year adjusted eligibility of ₹${(multiYearEligibility || 0).toLocaleString("en-IN")}.`
    );
  }

  // Combined eligibility
  const eligibilities = [
    hasWC   ? wcEligibility!   : null,
    hasMulti ? multiYearEligibility! : null,
  ].filter((v): v is number => v !== null);

  if (eligibilities.length > 1) {
    const combined = Math.round(eligibilities.reduce((a, b) => a + b, 0) / eligibilities.length);
    const riskAdj  = bankingRisk === "High" ? Math.round(combined * 0.85) : combined;
    parts.push(
      `Taking all modules into account, the combined indicative eligibility is estimated at ₹${riskAdj.toLocaleString("en-IN")}${bankingRisk === "High" ? " (adjusted for banking risk)" : ""}.`
    );
  }

  // Closing assessment
  const overallPositive = (bankingRisk === "Low" || !hasBanking) && (hasWC ? (wcCurrentRatio || 0) >= 1.33 : true) && (hasMulti ? multiYearHealth !== "Weak" : true);
  parts.push(
    overallPositive
      ? "Overall financial health is satisfactory. The profile is suitable for working capital credit facilities."
      : "Overall financial health requires attention. A detailed due diligence is recommended before sanctioning credit."
  );

  return parts.join(" ");
}
