import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { parseFileViaApi, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportGstItrPDF } from "@/lib/pdfExport";
import {
  PageBackground, PageHeader, GlassCard, UploadZone,
  GradientButton, CardTitle,
} from "@/components/UI";

const C = Colors.light;
const PURPLE = "#A855F7";

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
  gstin?: string; filingPeriod?: string; totalTaxableTurnover?: number;
  totalOutputTax?: number; igstCollected?: number; cgstCollected?: number;
  sgstCollected?: number; totalItcAvailable?: number; totalItcUtilized?: number;
  netTaxPayable?: number; taxPaidCash?: number; lateFee?: number; interestPaid?: number;
}
interface ItrFields {
  assessmentYear?: string; panNumber?: string; itrForm?: string;
  grossTotalIncome?: number; taxableIncome?: number; businessIncome?: number;
  totalDeductions?: number; taxPayable?: number; netTaxLiability?: number;
  tdsDeducted?: number; advanceTaxPaid?: number; refundAmount?: number; taxDue?: number;
}
interface AnalysisResult {
  docType: string; gstr?: GstrFields; itr?: ItrFields;
  complianceScore: number; complianceGrade: string;
  itcUtilizationRatio?: number; effectiveGstRate?: number;
  effectiveTaxRate?: number; tdsCoverageRatio?: number; turnoverMatchScore?: number;
  flags: string[]; strengths: string[];
}

function parseGstr(text: string): GstrFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const g = (kw: string[]) => getNum(lines, kw);
  const gstinMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
  const periodMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* ?[-–]? ?20\d{2}\b/i)
    || text.match(/20\d{2}[-–]20?\d{2}/);
  return {
    gstin: gstinMatch?.[0], filingPeriod: periodMatch?.[0],
    totalTaxableTurnover: g(["total taxable value", "outward taxable", "taxable turnover", "total turnover"]),
    igstCollected: g(["igst", "integrated tax"]), cgstCollected: g(["cgst", "central tax"]),
    sgstCollected: g(["sgst", "state tax", "utgst"]),
    totalOutputTax: g(["total tax liability", "total output tax"]),
    totalItcAvailable: g(["total itc available", "eligible itc"]),
    totalItcUtilized: g(["itc utilized", "total itc utilized"]),
    netTaxPayable: g(["net tax payable", "tax payable"]),
    taxPaidCash: g(["cash ledger", "paid in cash"]),
    lateFee: g(["late fee", "late fees"]), interestPaid: g(["interest paid", "interest on delayed"]),
  };
}
function parseItr(text: string): ItrFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const g = (kw: string[]) => getNum(lines, kw);
  const ayMatch = text.match(/a\.?y\.? ?20\d{2}[-–]20?\d{2}/i);
  const panMatch = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  const itrFormMatch = text.match(/\bitr[-‐– ]?[1-7u]\b/i);
  return {
    assessmentYear: ayMatch?.[0], panNumber: panMatch?.[0],
    itrForm: itrFormMatch?.[0]?.toUpperCase().replace(/[-‐– ]/, "-"),
    grossTotalIncome: g(["gross total income", "total of income"]),
    businessIncome: g(["profit and gains from business", "business income", "presumptive income"]),
    totalDeductions: g(["total deductions", "deductions u/s 80", "total vi-a"]),
    taxableIncome: g(["total taxable income", "taxable income", "net income"]),
    taxPayable: g(["income tax payable", "tax on total income"]),
    netTaxLiability: g(["net tax liability", "total tax liability"]),
    tdsDeducted: g(["total tds", "tds deducted", "tax deducted at source"]),
    advanceTaxPaid: g(["advance tax"]),
    refundAmount: g(["refund due", "refund amount"]), taxDue: g(["tax due", "balance tax"]),
  };
}
function analyze(gstr?: GstrFields, itr?: ItrFields): AnalysisResult {
  const flags: string[] = [], strengths: string[] = [];
  let score = 60;
  let itcUtilizationRatio: number | undefined, effectiveGstRate: number | undefined;
  let effectiveTaxRate: number | undefined, tdsCoverageRatio: number | undefined;
  let turnoverMatchScore: number | undefined;
  if (gstr) {
    const itcAvail = gstr.totalItcAvailable ?? 0;
    const itcUsed = gstr.totalItcUtilized ?? itcAvail;
    const turnover = gstr.totalTaxableTurnover ?? 0;
    const outputTax = gstr.totalOutputTax ?? ((gstr.igstCollected ?? 0) + (gstr.cgstCollected ?? 0) + (gstr.sgstCollected ?? 0));
    if (itcAvail > 0) {
      itcUtilizationRatio = Math.min(100, (itcUsed / itcAvail) * 100);
      if (itcUtilizationRatio >= 90) { strengths.push("High ITC utilization."); score += 8; }
      else if (itcUtilizationRatio < 50) { flags.push("Low ITC utilization — credit may be lost."); score -= 5; }
    }
    if (turnover > 0 && outputTax > 0) effectiveGstRate = (outputTax / turnover) * 100;
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
  return {
    docType: gstr && itr ? "GSTR + ITR" : itr ? "ITR" : "GSTR",
    gstr, itr, complianceScore: score, complianceGrade: grade,
    itcUtilizationRatio: itcUtilizationRatio !== undefined ? +itcUtilizationRatio.toFixed(1) : undefined,
    effectiveGstRate: effectiveGstRate !== undefined ? +effectiveGstRate.toFixed(2) : undefined,
    effectiveTaxRate: effectiveTaxRate !== undefined ? +effectiveTaxRate.toFixed(1) : undefined,
    tdsCoverageRatio: tdsCoverageRatio !== undefined ? +tdsCoverageRatio.toFixed(1) : undefined,
    turnoverMatchScore, flags, strengths,
  };
}
function buildSummaryText(r: AnalysisResult): string {
  const lines = [`GST & ITR COMPLIANCE ANALYSIS`, `Document Type: ${r.docType}`,
    `Compliance Score: ${r.complianceScore}/100  (Grade ${r.complianceGrade})`, "", "=== KEY METRICS ==="];
  if (r.itcUtilizationRatio !== undefined) lines.push(`ITC Utilization: ${r.itcUtilizationRatio.toFixed(1)}%`);
  if (r.effectiveGstRate !== undefined) lines.push(`Effective GST Rate: ${r.effectiveGstRate.toFixed(2)}%`);
  if (r.effectiveTaxRate !== undefined) lines.push(`Effective Income Tax Rate: ${r.effectiveTaxRate.toFixed(1)}%`);
  if (r.tdsCoverageRatio !== undefined) lines.push(`TDS Coverage: ${r.tdsCoverageRatio.toFixed(1)}%`);
  if (r.turnoverMatchScore !== undefined) lines.push(`GST–ITR Turnover Match: ${r.turnoverMatchScore}%`);
  if (r.flags.length) { lines.push("", "=== RED FLAGS ==="); r.flags.forEach((f) => lines.push(`• ${f}`)); }
  if (r.strengths.length) { lines.push("", "=== STRENGTHS ==="); r.strengths.forEach((s) => lines.push(`• ${s}`)); }
  return lines.join("\n");
}

const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";
const PCT = (n?: number) => n !== undefined ? n.toFixed(1) + "%" : "—";

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
    const l = text.toLowerCase();
    const hasGst = l.includes("gstin") || l.includes("gstr") || l.includes("outward supplies") || l.includes("input tax credit");
    const hasItr = l.includes("assessment year") || l.includes("itr-") || l.includes("gross total income") || l.includes("tds deducted");
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
      let newGstr = gstrData, newItr = itrData;
      for (const asset of result.assets) {
        const parsed = await parseFileViaApi(asset.uri, asset.name, asset.mimeType ?? undefined);
        const type = detectType(parsed.text);
        if (type === "GSTR" || type === "BOTH") newGstr = { ...newGstr, ...parseGstr(parsed.text) };
        if (type === "ITR"  || type === "BOTH") newItr  = { ...newItr,  ...parseItr(parsed.text) };
        setUploadedFiles((f) => [...f, { name: asset.name, format: FORMAT_LABEL[parsed.format] }]);
      }
      setGstrData(newGstr); setItrData(newItr); setResult(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Parse Failed", "Could not read the file.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setParsing(false); }
  };

  const handleAnalyze = () => {
    if (!gstrData && !itrData) { Alert.alert("No Data", "Upload at least one GST or ITR document."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResult(analyze(gstrData, itrData));
  };

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try { await exportGstItrPDF("GST & ITR Analysis", buildSummaryText(result)); }
    catch { Alert.alert("Export Failed"); }
    finally { setExporting(false); }
  };

  const gradeColor = (g: string) =>
    g === "A" ? C.success : g === "B" ? C.secondary : g === "C" ? C.warning : C.danger;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageBackground>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            title="GST & ITR Analysis"
            subtitle="Upload GSTR-1, GSTR-3B or ITR for compliance analysis"
            accentColor={PURPLE}
          />

          {/* Upload */}
          <UploadZone
            onPress={handlePickFile}
            loading={parsing}
            uploaded={uploadedFiles.length > 0}
            fileName={uploadedFiles.length === 1 ? uploadedFiles[0].name : `${uploadedFiles.length} files loaded`}
            label="Upload GST / ITR Documents (PDF / Excel / Image)"
            accentColor={PURPLE}
            onClear={() => { setUploadedFiles([]); setGstrData(undefined); setItrData(undefined); setResult(null); }}
          />

          {/* Supported docs */}
          <GlassCard accentColor={PURPLE}>
            <CardTitle>Supported Documents</CardTitle>
            {[
              ["GSTR-3B", "Monthly tax summary"],
              ["GSTR-1", "Outward supplies statement"],
              ["GSTR-9", "Annual GST return"],
              ["ITR-1 / ITR-2", "Individual income tax return"],
              ["ITR-3 / ITR-4", "Business income return"],
              ["Computation Sheet", "Tax computation"],
            ].map(([doc, desc]) => (
              <View key={doc} style={styles.docRow}>
                <View style={[styles.dot, { backgroundColor: PURPLE }]} />
                <Text style={styles.docName}>{doc}</Text>
                <Text style={styles.docDesc}> — {desc}</Text>
              </View>
            ))}
          </GlassCard>

          {/* Analyze button */}
          <GradientButton
            onPress={handleAnalyze}
            label="Analyze Documents"
            icon="zap"
            colors={[PURPLE, "#7C3AED"]}
          />

          {/* Results */}
          {result && (
            <>
              {/* Score card */}
              <LinearGradient
                colors={[gradeColor(result.complianceGrade) + "25", "#152236"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.scoreCard}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.scoreSubtitle}>Compliance Score</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Text style={[styles.scoreNum, { color: gradeColor(result.complianceGrade) }]}>
                      {result.complianceScore}
                    </Text>
                    <Text style={styles.scoreMax}>/100</Text>
                  </View>
                  <Text style={styles.docType}>Type: {result.docType}</Text>
                </View>
                <View style={[styles.gradeBadge, { backgroundColor: gradeColor(result.complianceGrade) + "22", borderColor: gradeColor(result.complianceGrade) + "55" }]}>
                  <Text style={[styles.gradeText, { color: gradeColor(result.complianceGrade) }]}>
                    {result.complianceGrade}
                  </Text>
                </View>
              </LinearGradient>

              {/* Metrics grid */}
              <View style={styles.metricsGrid}>
                {result.itcUtilizationRatio !== undefined && (
                  <MetricTile label="ITC Utilization" value={PCT(result.itcUtilizationRatio)} good={result.itcUtilizationRatio >= 80} />
                )}
                {result.effectiveGstRate !== undefined && (
                  <MetricTile label="Effective GST" value={PCT(result.effectiveGstRate)} neutral />
                )}
                {result.effectiveTaxRate !== undefined && (
                  <MetricTile label="Tax Rate" value={PCT(result.effectiveTaxRate)} good={result.effectiveTaxRate < 20} />
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
                <DataCard title="GST Return Data" accentColor={PURPLE} rows={[
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
                <DataCard title="ITR Data" accentColor={C.secondary} rows={[
                  ["PAN", result.itr.panNumber ?? "—"],
                  ["Assessment Year", result.itr.assessmentYear ?? "—"],
                  ["ITR Form", result.itr.itrForm ?? "—"],
                  ["Gross Total Income", INR(result.itr.grossTotalIncome)],
                  ["Business Income", INR(result.itr.businessIncome)],
                  ["Deductions (VI-A)", INR(result.itr.totalDeductions)],
                  ["Taxable Income", INR(result.itr.taxableIncome)],
                  ["Tax Payable", INR(result.itr.taxPayable)],
                  ["TDS Deducted", INR(result.itr.tdsDeducted)],
                  ["Advance Tax", INR(result.itr.advanceTaxPaid)],
                  ["Net Tax Liability", INR(result.itr.netTaxLiability)],
                  ["Refund Amount", INR(result.itr.refundAmount)],
                  ["Tax Due", INR(result.itr.taxDue)],
                ]} />
              )}

              {/* Flags */}
              {result.flags.length > 0 && (
                <GlassCard accentColor={C.warning}>
                  <CardTitle style={{ color: C.warning }}>Red Flags</CardTitle>
                  {result.flags.map((f, i) => (
                    <View key={i} style={styles.flagRow}>
                      <Feather name="alert-triangle" size={12} color={C.warning} />
                      <Text style={styles.flagText}>{f}</Text>
                    </View>
                  ))}
                </GlassCard>
              )}

              {/* Strengths */}
              {result.strengths.length > 0 && (
                <GlassCard accentColor={C.success}>
                  <CardTitle style={{ color: C.success }}>Strengths</CardTitle>
                  {result.strengths.map((s, i) => (
                    <View key={i} style={styles.flagRow}>
                      <Feather name="check-circle" size={12} color={C.success} />
                      <Text style={[styles.flagText, { color: C.success }]}>{s}</Text>
                    </View>
                  ))}
                </GlassCard>
              )}

              {/* Export */}
              <TouchableOpacity
                style={[styles.exportBtn, { borderColor: PURPLE + "55" }]}
                onPress={handleExport}
                disabled={exporting}
              >
                <LinearGradient colors={[PURPLE + "18", PURPLE + "08"]} style={StyleSheet.absoluteFill} />
                {exporting
                  ? <ActivityIndicator size="small" color={PURPLE} />
                  : <Feather name="download" size={16} color={PURPLE} />}
                <Text style={[styles.exportText, { color: PURPLE }]}>Export PDF Report</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </PageBackground>
    </KeyboardAvoidingView>
  );
}

function MetricTile({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  const color = neutral ? C.secondary : good ? C.success : C.warning;
  return (
    <LinearGradient colors={["#1A2C42", "#152236"]} style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </LinearGradient>
  );
}

function DataCard({ title, accentColor, rows }: { title: string; accentColor: string; rows: [string, string][] }) {
  const visible = rows.filter(([, v]) => v !== "—");
  if (!visible.length) return null;
  return (
    <GlassCard accentColor={accentColor}>
      <CardTitle style={{ color: accentColor }}>{title}</CardTitle>
      {visible.map(([l, v]) => (
        <View key={l} style={styles.dataRow}>
          <Text style={styles.dataLabel}>{l}</Text>
          <Text style={styles.dataValue}>{v}</Text>
        </View>
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },
  docRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, marginRight: 8, marginTop: 1 },
  docName: { fontSize: 12, color: "#C8DDF0", fontFamily: "Inter_600SemiBold" },
  docDesc: { fontSize: 12, color: "#7A9BB5", fontFamily: "Inter_400Regular" },

  scoreCard: {
    borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#1E3A54",
    flexDirection: "row", alignItems: "center",
  },
  scoreSubtitle: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  scoreNum: { fontSize: 48, fontFamily: "Inter_700Bold", lineHeight: 52 },
  scoreMax: { fontSize: 18, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  docType: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  gradeBadge: { width: 72, height: 72, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  gradeText: { fontSize: 40, fontFamily: "Inter_700Bold" },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricTile: { width: "47%", flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14, alignItems: "center", gap: 6 },
  metricLabel: { fontSize: 9, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },
  metricValue: { fontSize: 18, fontFamily: "Inter_700Bold" },

  dataRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#1A2C3A" },
  dataLabel: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  dataValue: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#E8F4FF" },

  flagRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  flagText: { flex: 1, fontSize: 12, color: C.warning, fontFamily: "Inter_400Regular", lineHeight: 18 },

  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, borderRadius: 14, paddingVertical: 14, borderWidth: 1, overflow: "hidden",
  },
  exportText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
