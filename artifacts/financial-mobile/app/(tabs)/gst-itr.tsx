import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { parseFileViaApi, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportGstItrPDF } from "@/lib/pdfExport";

const C = Colors.light;
const PURPLE = "#A855F7";

// ─── Lightweight GST/ITR parsers (mobile version) ─────────────────────────────

function getNum(lines: string[], keywords: string[]): number | undefined {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      const nums = line.match(/-?[\d,]+(?:\.\d+)?/g);
      if (nums) {
        const v = parseFloat(nums[nums.length - 1].replace(/,/g, ""));
        if (!isNaN(v) && Math.abs(v) >= 1) return Math.abs(v);
      }
    }
  }
  return undefined;
}

interface GstrFields {
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
}

interface ItrFields {
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

interface AnalysisResult {
  docType: string;
  gstr?: GstrFields;
  itr?: ItrFields;
  complianceScore: number;
  complianceGrade: string;
  itcUtilizationRatio?: number;
  effectiveGstRate?: number;
  effectiveTaxRate?: number;
  tdsCoverageRatio?: number;
  turnoverMatchScore?: number;
  flags: string[];
  strengths: string[];
}

function parseGstr(text: string): GstrFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const g = getNum.bind(null, lines);
  const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
  const periodMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* ?[-–]? ?20\d{2}\b/i) || text.match(/20\d{2}[-–]20?\d{2}/);
  return {
    gstin: gstinMatch?.[0],
    filingPeriod: periodMatch?.[0],
    totalTaxableTurnover: g(["total taxable value", "outward taxable", "taxable turnover", "total turnover"]),
    igstCollected: g(["igst", "integrated tax"]),
    cgstCollected: g(["cgst", "central tax"]),
    sgstCollected: g(["sgst", "state tax", "utgst"]),
    totalOutputTax: g(["total tax liability", "total output tax"]),
    totalItcAvailable: g(["total itc available", "eligible itc"]),
    totalItcUtilized: g(["itc utilized", "total itc utilized"]),
    netTaxPayable: g(["net tax payable", "tax payable"]),
    taxPaidCash: g(["cash ledger", "paid in cash"]),
    lateFee: g(["late fee", "late fees"]),
    interestPaid: g(["interest paid", "interest on delayed"]),
  };
}

function parseItr(text: string): ItrFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const g = getNum.bind(null, lines);
  const ayMatch = text.match(/a\.?y\.? ?20\d{2}[-–]20?\d{2}/i);
  const panMatch = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  const itrFormMatch = text.match(/\bitr[-‐– ]?[1-7u]\b/i);
  return {
    assessmentYear: ayMatch?.[0],
    panNumber: panMatch?.[0],
    itrForm: itrFormMatch?.[0]?.toUpperCase().replace(/[-‐– ]/, "-"),
    grossTotalIncome: g(["gross total income", "total of income"]),
    businessIncome: g(["profit and gains from business", "business income", "income from business", "presumptive income"]),
    totalDeductions: g(["total deductions", "deductions u/s 80", "total vi-a"]),
    taxableIncome: g(["total taxable income", "taxable income", "net income"]),
    taxPayable: g(["income tax payable", "tax on total income"]),
    netTaxLiability: g(["net tax liability", "total tax liability"]),
    tdsDeducted: g(["total tds", "tds deducted", "tax deducted at source"]),
    advanceTaxPaid: g(["advance tax"]),
    refundAmount: g(["refund due", "refund amount"]),
    taxDue: g(["tax due", "balance tax"]),
  };
}

function analyze(gstr?: GstrFields, itr?: ItrFields): AnalysisResult {
  const flags: string[] = [];
  const strengths: string[] = [];
  let score = 60;

  let itcUtilizationRatio: number | undefined;
  let effectiveGstRate: number | undefined;
  let effectiveTaxRate: number | undefined;
  let tdsCoverageRatio: number | undefined;
  let turnoverMatchScore: number | undefined;

  if (gstr) {
    const itcAvail = gstr.totalItcAvailable ?? 0;
    const itcUsed = gstr.totalItcUtilized ?? itcAvail;
    const turnover = gstr.totalTaxableTurnover ?? 0;
    const outputTax = gstr.totalOutputTax ?? (( gstr.igstCollected ?? 0) + (gstr.cgstCollected ?? 0) + (gstr.sgstCollected ?? 0));
    const netGst = gstr.netTaxPayable ?? 0;

    if (itcAvail > 0) {
      itcUtilizationRatio = Math.min(100, (itcUsed / itcAvail) * 100);
      if (itcUtilizationRatio >= 90) { strengths.push("High ITC utilization."); score += 8; }
      else if (itcUtilizationRatio < 50) { flags.push("Low ITC utilization — credit may be lost."); score -= 5; }
    }
    if (turnover > 0 && outputTax > 0) {
      effectiveGstRate = (outputTax / turnover) * 100;
    }
    if ((gstr.lateFee ?? 0) > 0) { flags.push("Late fee paid — indicates delayed filing."); score -= 8; }
    else strengths.push("No late fees detected.");
    if ((gstr.interestPaid ?? 0) > 0) { flags.push("Interest on delayed payment."); score -= 5; }
  }

  if (itr) {
    const taxable = itr.taxableIncome ?? itr.grossTotalIncome ?? 0;
    const taxPay = itr.netTaxLiability ?? itr.taxPayable ?? 0;
    const tds = itr.tdsDeducted ?? 0;

    if (taxable > 0 && taxPay > 0) {
      effectiveTaxRate = (taxPay / taxable) * 100;
      if (effectiveTaxRate > 30) { flags.push("High effective tax rate — review deductions."); score -= 5; }
      else strengths.push("Reasonable effective tax rate.");
    }
    if (taxPay > 0 && tds > 0) {
      tdsCoverageRatio = Math.min(100, (tds / taxPay) * 100);
      if (tdsCoverageRatio >= 90) strengths.push("TDS covers most tax liability.");
      else if (tdsCoverageRatio < 30) { flags.push("Low TDS coverage — high cash tax needed."); score -= 3; }
    }
    if ((itr.refundAmount ?? 0) > 0) strengths.push("Tax refund due.");

    if (gstr && gstr.totalTaxableTurnover && (itr.grossTotalIncome ?? 0) > 0) {
      const itrIncome = itr.businessIncome ?? itr.grossTotalIncome ?? 0;
      const variance = Math.abs(gstr.totalTaxableTurnover - itrIncome) / Math.max(gstr.totalTaxableTurnover, itrIncome);
      turnoverMatchScore = Math.round((1 - variance) * 100);
      if (turnoverMatchScore >= 80) strengths.push("GST & ITR income figures are consistent.");
      else if (turnoverMatchScore < 50) { flags.push("GST turnover vs ITR income mismatch — reconcile."); score -= 10; }
    }
  }

  score = Math.max(10, Math.min(100, score));
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  if (!flags.length) strengths.push("No major compliance issues detected.");

  const docType = gstr && itr ? "GSTR + ITR" : itr ? "ITR" : "GSTR";
  return { docType, gstr, itr, complianceScore: score, complianceGrade: grade,
    itcUtilizationRatio: itcUtilizationRatio !== undefined ? +itcUtilizationRatio.toFixed(1) : undefined,
    effectiveGstRate: effectiveGstRate !== undefined ? +effectiveGstRate.toFixed(2) : undefined,
    effectiveTaxRate: effectiveTaxRate !== undefined ? +effectiveTaxRate.toFixed(1) : undefined,
    tdsCoverageRatio: tdsCoverageRatio !== undefined ? +tdsCoverageRatio.toFixed(1) : undefined,
    turnoverMatchScore, flags, strengths };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GstItrScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [parsing, setParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; format: string }[]>([]);
  const [gstrData, setGstrData] = useState<GstrFields | undefined>();
  const [itrData, setItrData] = useState<ItrFields | undefined>();
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const detectType = (text: string): "GSTR" | "ITR" | "BOTH" | "UNKNOWN" => {
    const lower = text.toLowerCase();
    const hasGst = lower.includes("gstin") || lower.includes("gstr") || lower.includes("outward supplies") || lower.includes("input tax credit");
    const hasItr = lower.includes("assessment year") || lower.includes("itr-") || lower.includes("gross total income") || lower.includes("tds deducted");
    if (hasGst && hasItr) return "BOTH";
    if (hasGst) return "GSTR";
    if (hasItr) return "ITR";
    return "UNKNOWN";
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: true });
      if (result.canceled) return;
      setParsing(true);

      let newGstr = gstrData;
      let newItr = itrData;

      for (const asset of result.assets) {
        const parsed = await parseFileViaApi(asset.uri, asset.name, asset.mimeType ?? undefined);
        const type = detectType(parsed.text);
        if (type === "GSTR" || type === "BOTH") newGstr = { ...newGstr, ...parseGstr(parsed.text) };
        if (type === "ITR"  || type === "BOTH") newItr  = { ...newItr,  ...parseItr(parsed.text) };
        setUploadedFiles((f) => [...f, { name: asset.name, format: FORMAT_LABEL[parsed.format] }]);
      }

      setGstrData(newGstr);
      setItrData(newItr);
      setResult(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Parse Failed", "Could not read the file.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setParsing(false);
    }
  };

  const handleAnalyze = () => {
    if (!gstrData && !itrData) { Alert.alert("No Data", "Upload at least one GST or ITR document."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResult(analyze(gstrData, itrData));
  };

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const summary = buildSummaryText(result);
      await exportGstItrPDF("GST & ITR Analysis", summary);
    } catch {
      Alert.alert("Export Failed");
    } finally {
      setExporting(false);
    }
  };

  const gradeColor = (g: string) =>
    g === "A" ? C.success : g === "B" ? C.secondary : g === "C" ? C.warning : C.danger;

  const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";
  const PCT = (n?: number) => n !== undefined ? n.toFixed(1) + "%" : "—";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.brand, { color: PURPLE }]}>DHANUSH ENTERPRISES</Text>
          <Text style={styles.title}>GST & ITR Analysis</Text>
          <Text style={styles.subtitle}>Upload GSTR-1, GSTR-3B or ITR forms for compliance analysis</Text>
        </View>

        {/* Upload */}
        <TouchableOpacity style={[styles.uploadBtn, { borderColor: PURPLE + "40" }]} onPress={handlePickFile} activeOpacity={0.8}>
          {parsing ? <ActivityIndicator color={PURPLE} size="small" /> : <Feather name="file-text" size={18} color={PURPLE} />}
          <Text style={styles.uploadText}>
            {uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s) loaded` : "Upload PDF / Excel / Image / TXT"}
          </Text>
          {uploadedFiles.length > 0 && <Feather name="check-circle" size={16} color={C.success} />}
        </TouchableOpacity>

        {uploadedFiles.map((f, i) => (
          <View key={i} style={styles.fileChip}>
            <Feather name="file" size={13} color={C.textSecondary} />
            <Text style={styles.fileChipText} numberOfLines={1}>{f.name}</Text>
            <Text style={styles.fileChipFormat}>{f.format}</Text>
          </View>
        ))}

        {/* Supported types */}
        <View style={[styles.card, { borderColor: PURPLE + "30" }]}>
          <Text style={[styles.cardTitle, { color: PURPLE }]}>Supported Documents</Text>
          {["GSTR-3B — Monthly tax summary", "GSTR-1 — Outward supplies", "GSTR-9 — Annual GST return",
            "ITR-1 / ITR-2 — Individual", "ITR-3 / ITR-4 — Business income", "Computation Sheet"].map((d) => (
            <View key={d} style={styles.docRow}>
              <View style={[styles.dot, { backgroundColor: PURPLE }]} />
              <Text style={styles.docText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Analyze Button */}
        <TouchableOpacity
          style={[styles.calcBtn, { backgroundColor: PURPLE, opacity: uploadedFiles.length === 0 ? 0.5 : 1 }]}
          onPress={handleAnalyze} activeOpacity={0.85}
          disabled={uploadedFiles.length === 0}
        >
          <Feather name="zap" size={18} color="#fff" />
          <Text style={styles.calcBtnText}>Analyze Documents</Text>
        </TouchableOpacity>

        {/* Results */}
        {result && (
          <>
            {/* Score */}
            <View style={[styles.scoreCard, { borderColor: PURPLE + "40" }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.assessLabel}>Compliance Score</Text>
                <Text style={[styles.scoreNum, { color: PURPLE }]}>{result.complianceScore}<Text style={styles.scoreMax}>/100</Text></Text>
                <Text style={styles.docTypeText}>Type: {result.docType}</Text>
              </View>
              <Text style={[styles.gradeText, { color: gradeColor(result.complianceGrade) }]}>{result.complianceGrade}</Text>
            </View>

            {/* Metrics */}
            <View style={styles.metricsGrid}>
              {result.itcUtilizationRatio !== undefined && (
                <MetricTile label="ITC Utilization" value={PCT(result.itcUtilizationRatio)} good={result.itcUtilizationRatio >= 80} />
              )}
              {result.effectiveGstRate !== undefined && (
                <MetricTile label="Effective GST Rate" value={PCT(result.effectiveGstRate)} neutral />
              )}
              {result.effectiveTaxRate !== undefined && (
                <MetricTile label="Eff. Tax Rate (ITR)" value={PCT(result.effectiveTaxRate)} good={result.effectiveTaxRate < 20} />
              )}
              {result.tdsCoverageRatio !== undefined && (
                <MetricTile label="TDS Coverage" value={PCT(result.tdsCoverageRatio)} good={result.tdsCoverageRatio >= 80} />
              )}
              {result.turnoverMatchScore !== undefined && (
                <MetricTile label="GST–ITR Match" value={result.turnoverMatchScore + "%"} good={result.turnoverMatchScore >= 80} />
              )}
            </View>

            {/* GSTR Data */}
            {result.gstr && (
              <DataCard title="GST Return Data" color={PURPLE} rows={[
                ["GSTIN", result.gstr.gstin ?? "—"],
                ["Period", result.gstr.filingPeriod ?? "—"],
                ["Taxable Turnover", INR(result.gstr.totalTaxableTurnover)],
                ["IGST Collected", INR(result.gstr.igstCollected)],
                ["CGST Collected", INR(result.gstr.cgstCollected)],
                ["SGST Collected", INR(result.gstr.sgstCollected)],
                ["Total Output Tax", INR(result.gstr.totalOutputTax)],
                ["ITC Available", INR(result.gstr.totalItcAvailable)],
                ["ITC Utilized", INR(result.gstr.totalItcUtilized)],
                ["Net Tax Payable", INR(result.gstr.netTaxPayable)],
                ["Tax Paid (Cash)", INR(result.gstr.taxPaidCash)],
                ["Late Fee", INR(result.gstr.lateFee)],
                ["Interest", INR(result.gstr.interestPaid)],
              ]} />
            )}

            {/* ITR Data */}
            {result.itr && (
              <DataCard title="ITR Data" color={C.secondary} rows={[
                ["PAN", result.itr.panNumber ?? "—"],
                ["Assessment Year", result.itr.assessmentYear ?? "—"],
                ["ITR Form", result.itr.itrForm ?? "—"],
                ["Gross Total Income", INR(result.itr.grossTotalIncome)],
                ["Business Income", INR(result.itr.businessIncome)],
                ["Deductions (VI-A)", INR(result.itr.totalDeductions)],
                ["Taxable Income", INR(result.itr.taxableIncome)],
                ["Tax Payable", INR(result.itr.taxPayable)],
                ["TDS Deducted", INR(result.itr.tdsDeducted)],
                ["Advance Tax Paid", INR(result.itr.advanceTaxPaid)],
                ["Net Tax Liability", INR(result.itr.netTaxLiability)],
                ["Refund Amount", INR(result.itr.refundAmount)],
                ["Tax Due", INR(result.itr.taxDue)],
              ]} />
            )}

            {/* Flags & Strengths */}
            {result.flags.length > 0 && (
              <View style={[styles.card, { borderColor: C.warning + "30" }]}>
                <Text style={[styles.cardTitle, { color: C.warning }]}>⚠ Red Flags</Text>
                {result.flags.map((f, i) => <Text key={i} style={styles.flagText}>• {f}</Text>)}
              </View>
            )}
            {result.strengths.length > 0 && (
              <View style={[styles.card, { borderColor: C.success + "30" }]}>
                <Text style={[styles.cardTitle, { color: C.success }]}>✓ Strengths</Text>
                {result.strengths.map((s, i) => <Text key={i} style={styles.strengthText}>• {s}</Text>)}
              </View>
            )}

            {/* Export */}
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={handleExport} disabled={exporting}>
              {exporting ? <ActivityIndicator size="small" color={PURPLE} /> : <Feather name="download" size={16} color={PURPLE} />}
              <Text style={[styles.actionBtnText, { color: PURPLE }]}>Export PDF Report</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MetricTile({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  const color = neutral ? C.secondary : good ? C.success : C.warning;
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function DataCard({ title, color, rows }: { title: string; color: string; rows: [string, string][] }) {
  const visible = rows.filter(([, v]) => v !== "—");
  if (!visible.length) return null;
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: color }]} />
      <Text style={[styles.cardTitle, { color }]}>{title}</Text>
      {visible.map(([l, v]) => (
        <View key={l} style={styles.dataRow}>
          <Text style={styles.dataLabel}>{l}</Text>
          <Text style={styles.dataValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function buildSummaryText(r: AnalysisResult): string {
  const lines: string[] = [
    `GST & ITR COMPLIANCE ANALYSIS`,
    `Document Type: ${r.docType}`,
    `Compliance Score: ${r.complianceScore}/100  (Grade ${r.complianceGrade})`,
    "",
    "=== KEY METRICS ===",
  ];
  if (r.itcUtilizationRatio !== undefined) lines.push(`ITC Utilization: ${r.itcUtilizationRatio.toFixed(1)}%`);
  if (r.effectiveGstRate !== undefined) lines.push(`Effective GST Rate: ${r.effectiveGstRate.toFixed(2)}%`);
  if (r.effectiveTaxRate !== undefined) lines.push(`Effective Income Tax Rate: ${r.effectiveTaxRate.toFixed(1)}%`);
  if (r.tdsCoverageRatio !== undefined) lines.push(`TDS Coverage: ${r.tdsCoverageRatio.toFixed(1)}%`);
  if (r.turnoverMatchScore !== undefined) lines.push(`GST–ITR Turnover Match: ${r.turnoverMatchScore}%`);
  if (r.flags.length) { lines.push("", "=== RED FLAGS ==="); r.flags.forEach((f) => lines.push(`• ${f}`)); }
  if (r.strengths.length) { lines.push("", "=== STRENGTHS ==="); r.strengths.forEach((s) => lines.push(`• ${s}`)); }
  return lines.join("\n");
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, gap: 14 },
  header: { marginBottom: 4 },
  brand: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: C.text },
  subtitle: { fontSize: 12, color: C.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },

  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  uploadText: { flex: 1, fontSize: 13, color: C.textSecondary, fontFamily: "Inter_500Medium" },
  fileChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#162032", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  fileChipText: { flex: 1, fontSize: 12, color: C.text, fontFamily: "Inter_400Regular" },
  fileChipFormat: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_400Regular" },

  card: { backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden", gap: 4 },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.text, marginBottom: 8 },

  docRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
  docText: { fontSize: 12, color: C.textSecondary, fontFamily: "Inter_400Regular" },

  calcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 15 },
  calcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  scoreCard: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, flexDirection: "row", alignItems: "center" },
  assessLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  scoreNum: { fontSize: 44, fontFamily: "Inter_700Bold" },
  scoreMax: { fontSize: 16, color: C.textSecondary, fontFamily: "Inter_400Regular" },
  docTypeText: { fontSize: 11, color: C.textSecondary, fontFamily: "Inter_400Regular", marginTop: 4 },
  gradeText: { fontSize: 64, fontFamily: "Inter_700Bold" },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricTile: { width: "47%", flexGrow: 1, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  metricLabel: { fontSize: 9, color: C.textSecondary, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  metricValue: { fontSize: 18, fontFamily: "Inter_700Bold" },

  dataRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#1E2F40" },
  dataLabel: { fontSize: 11, color: C.textSecondary, fontFamily: "Inter_400Regular" },
  dataValue: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.text },

  flagText: { fontSize: 12, color: C.warning, fontFamily: "Inter_400Regular", lineHeight: 20 },
  strengthText: { fontSize: 12, color: C.success, fontFamily: "Inter_400Regular", lineHeight: 20 },

  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 14, borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
