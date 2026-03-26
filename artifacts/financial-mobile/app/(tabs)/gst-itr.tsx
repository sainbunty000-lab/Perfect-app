import React, { useState, Component } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Modal, TextInput,
} from "react-native";
import { useCreateCase } from "@workspace/api-client-react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { parseFinancialDocument, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportGstItrPDF } from "@/lib/pdfExport";
import {
  PageBackground, PageHeader, GlassCard, UploadZone,
  GradientButton, CardTitle, TabNavBar,
} from "@/components/UI";
import { DonutGauge, PieChart, HorizontalBarChart } from "@/lib/charts";

const C = Colors.light;
const PURPLE = "#A855F7";
const BLUE   = "#4A9EFF";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GstrFields {
  gstin?: string; filingPeriod?: string; gstrForm?: string;
  totalTaxableTurnover?: number; totalOutputTax?: number;
  igstCollected?: number; cgstCollected?: number; sgstCollected?: number;
  totalItcAvailable?: number; totalItcUtilized?: number;
  netTaxPayable?: number; taxPaidCash?: number;
  lateFee?: number; interestPaid?: number;
}
interface ItrFields {
  assessmentYear?: string; panNumber?: string; itrForm?: string;
  grossTotalIncome?: number; taxableIncome?: number; businessIncome?: number;
  totalDeductions?: number; taxPayable?: number; netTaxLiability?: number;
  tdsDeducted?: number; advanceTaxPaid?: number; refundAmount?: number; taxDue?: number;
}
interface AnalysisResult {
  docTypes: string[];
  gstr?: GstrFields; itr?: ItrFields;
  complianceScore: number; complianceGrade: string;
  itcUtilizationRatio?: number; effectiveGstRate?: number;
  effectiveTaxRate?: number; tdsCoverageRatio?: number; turnoverMatchScore?: number;
  flags: string[]; strengths: string[];
}

type SlotInfo = { name: string; format: string } | null;

// ─── Analysis logic ───────────────────────────────────────────────────────────
function analyze(gstr?: GstrFields, itr?: ItrFields): AnalysisResult {
  const flags: string[] = [], strengths: string[] = [];
  let score = 60;
  let itcUtilizationRatio: number | undefined, effectiveGstRate: number | undefined;
  let effectiveTaxRate: number | undefined, tdsCoverageRatio: number | undefined;
  let turnoverMatchScore: number | undefined;

  if (gstr) {
    const itcAvail = gstr.totalItcAvailable ?? 0;
    const itcUsed  = gstr.totalItcUtilized ?? itcAvail;
    const turnover = gstr.totalTaxableTurnover ?? 0;
    const outputTax = gstr.totalOutputTax ??
      ((gstr.igstCollected ?? 0) + (gstr.cgstCollected ?? 0) + (gstr.sgstCollected ?? 0));

    if (itcAvail > 0) {
      itcUtilizationRatio = Math.min(100, (itcUsed / itcAvail) * 100);
      if (itcUtilizationRatio >= 90) { strengths.push("High ITC utilization."); score += 8; }
      else if (itcUtilizationRatio < 50) { flags.push("Low ITC utilization — credit may be lost."); score -= 5; }
    }
    if (turnover > 0 && outputTax > 0) effectiveGstRate = (outputTax / turnover) * 100;
    if ((gstr.lateFee ?? 0) > 0) { flags.push("Late fee paid — delayed filing detected."); score -= 8; }
    else strengths.push("No late fees — timely filing.");
    if ((gstr.interestPaid ?? 0) > 0) { flags.push("Interest on delayed GST payment."); score -= 5; }
  }

  if (itr) {
    const taxable = itr.taxableIncome ?? itr.grossTotalIncome ?? 0;
    const taxPay  = itr.netTaxLiability ?? itr.taxPayable ?? 0;
    const tds     = itr.tdsDeducted ?? 0;

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
    if ((itr.refundAmount ?? 0) > 0) strengths.push("Tax refund pending — good compliance.");

    if (gstr && gstr.totalTaxableTurnover && (itr.grossTotalIncome ?? 0) > 0) {
      const itrIncome = itr.businessIncome ?? itr.grossTotalIncome ?? 0;
      const variance = Math.abs(gstr.totalTaxableTurnover - itrIncome) / Math.max(gstr.totalTaxableTurnover, itrIncome);
      turnoverMatchScore = Math.round((1 - variance) * 100);
      if (turnoverMatchScore >= 80) strengths.push("GST & ITR income figures are consistent.");
      else if (turnoverMatchScore < 50) { flags.push("GST turnover vs ITR income mismatch — reconcile."); score -= 10; }
    }
  }

  score = Math.max(10, Math.min(100, score));
  if (!flags.length) strengths.push("No major compliance issues detected.");

  const docTypes: string[] = [];
  if (gstr) docTypes.push(gstr.gstrForm ?? "GSTR");
  if (itr)  docTypes.push(itr.itrForm ?? "ITR");

  return {
    docTypes, gstr, itr, complianceScore: score,
    complianceGrade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D",
    itcUtilizationRatio: itcUtilizationRatio !== undefined ? +itcUtilizationRatio.toFixed(1) : undefined,
    effectiveGstRate:    effectiveGstRate    !== undefined ? +effectiveGstRate.toFixed(2)    : undefined,
    effectiveTaxRate:    effectiveTaxRate    !== undefined ? +effectiveTaxRate.toFixed(1)    : undefined,
    tdsCoverageRatio:    tdsCoverageRatio    !== undefined ? +tdsCoverageRatio.toFixed(1)    : undefined,
    turnoverMatchScore, flags, strengths,
  };
}

function buildSummaryText(r: AnalysisResult): string {
  const lines = [
    "GST & ITR COMPLIANCE ANALYSIS",
    `Documents: ${r.docTypes.join(", ") || "—"}`,
    `Compliance Score: ${r.complianceScore}/100  (Grade ${r.complianceGrade})`,
    "", "=== KEY METRICS ===",
  ];
  if (r.itcUtilizationRatio !== undefined) lines.push(`ITC Utilization: ${r.itcUtilizationRatio.toFixed(1)}%`);
  if (r.effectiveGstRate    !== undefined) lines.push(`Effective GST Rate: ${r.effectiveGstRate.toFixed(2)}%`);
  if (r.effectiveTaxRate    !== undefined) lines.push(`Effective Tax Rate: ${r.effectiveTaxRate.toFixed(1)}%`);
  if (r.tdsCoverageRatio    !== undefined) lines.push(`TDS Coverage: ${r.tdsCoverageRatio.toFixed(1)}%`);
  if (r.turnoverMatchScore  !== undefined) lines.push(`GST–ITR Match: ${r.turnoverMatchScore}%`);
  if (r.flags.length)     { lines.push("", "=== RED FLAGS ===");   r.flags.forEach((f) => lines.push(`• ${f}`)); }
  if (r.strengths.length) { lines.push("", "=== STRENGTHS ===");  r.strengths.forEach((s) => lines.push(`• ${s}`)); }
  return lines.join("\n");
}

const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";
const PCT = (n?: number) => n !== undefined ? n.toFixed(1) + "%" : "—";

// ─── Local error boundary for results section ─────────────────────────────────
class ResultsErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error)
      return <ErrorFallback error={this.state.error} resetError={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function GstItrScreen() {
  const insets    = useSafeAreaInsets();
  const tabHeight = useBottomTabBarHeight();

  const createCase = useCreateCase();

  const [gstrParsing, setGstrParsing] = useState(false);
  const [itrParsing,  setItrParsing]  = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveModal, setSaveModal]     = useState(false);
  const [clientName, setClientName]   = useState("");

  const [gstrAsset, setGstrAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [itrAsset,  setItrAsset]  = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [gstrSlot, setGstrSlot]   = useState<SlotInfo>(null);
  const [itrSlot,  setItrSlot]    = useState<SlotInfo>(null);

  const [gstrData, setGstrData] = useState<GstrFields | undefined>();
  const [itrData,  setItrData]  = useState<ItrFields | undefined>();
  const [result,   setResult]   = useState<AnalysisResult | null>(null);

  // Step 1: select file only
  const handleSelectGstr = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      setGstrAsset(res.assets[0]); setGstrSlot(null); setResult(null);
    } catch { Alert.alert("Error", "Could not open file picker."); }
  };

  const handleSelectItr = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      setItrAsset(res.assets[0]); setItrSlot(null); setResult(null);
    } catch { Alert.alert("Error", "Could not open file picker."); }
  };

  // Step 2: parse the selected file
  const handleParseGstr = async () => {
    if (!gstrAsset) return;
    setGstrParsing(true);
    try {
      const parsed = await parseFinancialDocument(gstrAsset.uri, gstrAsset.name, gstrAsset.mimeType ?? undefined, "gstr");
      const f = parsed.fields as GstrFields;
      setGstrData((prev) => ({ ...prev, ...f }));
      setGstrSlot({ name: gstrAsset.name, format: FORMAT_LABEL[parsed.format] });
      setResult(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Parse Failed", e?.message ?? "Could not read GSTR document.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setGstrParsing(false); }
  };

  const handleParseItr = async () => {
    if (!itrAsset) return;
    setItrParsing(true);
    try {
      const parsed = await parseFinancialDocument(itrAsset.uri, itrAsset.name, itrAsset.mimeType ?? undefined, "itr");
      const f = parsed.fields as ItrFields;
      setItrData((prev) => ({ ...prev, ...f }));
      setItrSlot({ name: itrAsset.name, format: FORMAT_LABEL[parsed.format] });
      setResult(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Parse Failed", e?.message ?? "Could not read ITR document.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setItrParsing(false); }
  };

  const handleAnalyze = () => {
    if (!gstrData && !itrData) {
      Alert.alert("No Data", "Upload at least one GSTR or ITR document first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setResult(analyze(gstrData, itrData));
    } catch (e: any) {
      Alert.alert("Analysis Failed", e?.message ?? "Could not complete compliance analysis.");
    }
  };

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try { await exportGstItrPDF("GST & ITR Analysis", buildSummaryText(result)); }
    catch { Alert.alert("Export Failed"); }
    finally { setExporting(false); }
  };

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert("Client Name Required", "Enter a client name to save."); return; }
    if (!result) { Alert.alert("Analyze First", "Run the analysis before saving."); return; }
    setSaving(true);
    try {
      await createCase.mutateAsync({
        clientName: clientName.trim(), caseType: "gst_itr",
        gstItrData: { gstr: gstrData, itr: itrData } as any, gstItrResults: result as any,
      } as any);
      setSaveModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "GST & ITR case saved successfully.");
    } catch { Alert.alert("Save Failed", "Could not save the case."); }
    finally { setSaving(false); }
  };

  const gradeColor = (g: string) =>
    g === "A" ? C.success : g === "B" ? BLUE : g === "C" ? C.warning : C.danger;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageBackground>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabHeight + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            title="GST & ITR Analysis"
            subtitle="Upload GST returns and ITR documents separately for accurate analysis"
            accentColor={PURPLE}
          />

          {/* ── Section 1: GSTR Upload ────────────────────────────── */}
          <GlassCard accentColor={PURPLE}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionBadge, { backgroundColor: PURPLE + "22" }]}>
                <Text style={[styles.sectionBadgeText, { color: PURPLE }]}>GST</Text>
              </View>
              <View style={{ flex: 1 }}>
                <CardTitle style={{ marginBottom: 2 }}>GSTR Documents</CardTitle>
                <Text style={styles.sectionSubtitle}>GSTR-3B · GSTR-1 · GSTR-9 · Any GST return</Text>
              </View>
            </View>

            <UploadZone
              onPress={handleSelectGstr}
              loading={gstrParsing}
              uploaded={!!gstrSlot}
              fileSelected={!!gstrAsset && !gstrSlot}
              fileName={gstrAsset?.name ?? gstrSlot?.name}
              label="Select GSTR Document (PDF / Excel / Image)"
              accentColor={PURPLE}
              onParse={handleParseGstr}
              onClear={() => { setGstrAsset(null); setGstrSlot(null); setGstrData(undefined); setResult(null); }}
            />

            {gstrData && (
              <View style={styles.extractedBox}>
                <Text style={[styles.extractedTitle, { color: PURPLE }]}>Extracted Fields</Text>
                {gstrData.gstin && <ExtractedRow label="GSTIN" value={gstrData.gstin} color={PURPLE} />}
                {gstrData.filingPeriod && <ExtractedRow label="Period" value={gstrData.filingPeriod} color={PURPLE} />}
                {gstrData.gstrForm && <ExtractedRow label="Form" value={gstrData.gstrForm} color={PURPLE} />}
                {gstrData.totalTaxableTurnover !== undefined && <ExtractedRow label="Taxable Turnover" value={INR(gstrData.totalTaxableTurnover)} color={PURPLE} />}
                {gstrData.igstCollected !== undefined && <ExtractedRow label="IGST" value={INR(gstrData.igstCollected)} color={PURPLE} />}
                {gstrData.cgstCollected !== undefined && <ExtractedRow label="CGST" value={INR(gstrData.cgstCollected)} color={PURPLE} />}
                {gstrData.sgstCollected !== undefined && <ExtractedRow label="SGST / UTGST" value={INR(gstrData.sgstCollected)} color={PURPLE} />}
                {gstrData.totalOutputTax !== undefined && <ExtractedRow label="Total Output Tax" value={INR(gstrData.totalOutputTax)} color={PURPLE} />}
                {gstrData.totalItcAvailable !== undefined && <ExtractedRow label="ITC Available" value={INR(gstrData.totalItcAvailable)} color={PURPLE} />}
                {gstrData.totalItcUtilized !== undefined && <ExtractedRow label="ITC Utilized" value={INR(gstrData.totalItcUtilized)} color={PURPLE} />}
                {gstrData.netTaxPayable !== undefined && <ExtractedRow label="Net Tax Payable" value={INR(gstrData.netTaxPayable)} color={PURPLE} />}
                {gstrData.lateFee !== undefined && <ExtractedRow label="Late Fee" value={INR(gstrData.lateFee)} color={C.warning} />}
                {gstrData.interestPaid !== undefined && <ExtractedRow label="Interest Paid" value={INR(gstrData.interestPaid)} color={C.warning} />}
              </View>
            )}
          </GlassCard>

          {/* ── Section 2: ITR Upload ─────────────────────────────── */}
          <GlassCard accentColor={BLUE}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionBadge, { backgroundColor: BLUE + "22" }]}>
                <Text style={[styles.sectionBadgeText, { color: BLUE }]}>ITR</Text>
              </View>
              <View style={{ flex: 1 }}>
                <CardTitle style={{ marginBottom: 2 }}>ITR Documents</CardTitle>
                <Text style={styles.sectionSubtitle}>ITR-1 · ITR-2 · ITR-3 · ITR-4 · Computation Sheet</Text>
              </View>
            </View>

            <UploadZone
              onPress={handleSelectItr}
              loading={itrParsing}
              uploaded={!!itrSlot}
              fileSelected={!!itrAsset && !itrSlot}
              fileName={itrAsset?.name ?? itrSlot?.name}
              label="Select ITR Document (PDF / Excel / Image)"
              accentColor={BLUE}
              onParse={handleParseItr}
              onClear={() => { setItrAsset(null); setItrSlot(null); setItrData(undefined); setResult(null); }}
            />

            {itrData && (
              <View style={styles.extractedBox}>
                <Text style={[styles.extractedTitle, { color: BLUE }]}>Extracted Fields</Text>
                {itrData.panNumber && <ExtractedRow label="PAN" value={itrData.panNumber} color={BLUE} />}
                {itrData.assessmentYear && <ExtractedRow label="Assessment Year" value={itrData.assessmentYear} color={BLUE} />}
                {itrData.itrForm && <ExtractedRow label="ITR Form" value={itrData.itrForm} color={BLUE} />}
                {itrData.grossTotalIncome !== undefined && <ExtractedRow label="Gross Total Income" value={INR(itrData.grossTotalIncome)} color={BLUE} />}
                {itrData.businessIncome !== undefined && <ExtractedRow label="Business Income" value={INR(itrData.businessIncome)} color={BLUE} />}
                {itrData.totalDeductions !== undefined && <ExtractedRow label="Deductions (VI-A)" value={INR(itrData.totalDeductions)} color={BLUE} />}
                {itrData.taxableIncome !== undefined && <ExtractedRow label="Taxable Income" value={INR(itrData.taxableIncome)} color={BLUE} />}
                {itrData.taxPayable !== undefined && <ExtractedRow label="Tax Payable" value={INR(itrData.taxPayable)} color={BLUE} />}
                {itrData.tdsDeducted !== undefined && <ExtractedRow label="TDS Deducted" value={INR(itrData.tdsDeducted)} color={BLUE} />}
                {itrData.advanceTaxPaid !== undefined && <ExtractedRow label="Advance Tax" value={INR(itrData.advanceTaxPaid)} color={BLUE} />}
                {itrData.netTaxLiability !== undefined && <ExtractedRow label="Net Tax Liability" value={INR(itrData.netTaxLiability)} color={BLUE} />}
                {itrData.refundAmount !== undefined && <ExtractedRow label="Refund Amount" value={INR(itrData.refundAmount)} color={C.success} />}
                {itrData.taxDue !== undefined && <ExtractedRow label="Tax Due" value={INR(itrData.taxDue)} color={C.warning} />}
              </View>
            )}
          </GlassCard>

          {/* ── Analyze Button ────────────────────────────────────── */}
          <GradientButton
            onPress={handleAnalyze}
            label="Run Compliance Analysis"
            icon="zap"
            colors={[PURPLE, "#7C3AED"]}
          />

          {/* ── Results ───────────────────────────────────────────── */}
          {result && (
            <ResultsErrorBoundary>
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
                    <Text style={[styles.scoreNum, { color: gradeColor(result.complianceGrade) }]}>{result.complianceScore}</Text>
                    <Text style={styles.scoreMax}>/100</Text>
                  </View>
                  <Text style={styles.docType}>
                    {result.docTypes.length ? result.docTypes.join(" + ") : "—"}
                  </Text>
                </View>
                <View style={[styles.gradeBadge, {
                  backgroundColor: gradeColor(result.complianceGrade) + "22",
                  borderColor: gradeColor(result.complianceGrade) + "55",
                }]}>
                  <Text style={[styles.gradeText, { color: gradeColor(result.complianceGrade) }]}>
                    {result.complianceGrade}
                  </Text>
                </View>
              </LinearGradient>

              {/* Metrics grid */}
              {(result.itcUtilizationRatio !== undefined || result.effectiveGstRate !== undefined ||
                result.effectiveTaxRate !== undefined || result.tdsCoverageRatio !== undefined ||
                result.turnoverMatchScore !== undefined) && (
                <View style={styles.metricsGrid}>
                  {result.itcUtilizationRatio !== undefined && (
                    <MetricTile label="ITC Utilization" value={PCT(result.itcUtilizationRatio)}
                      good={result.itcUtilizationRatio >= 80} />
                  )}
                  {result.effectiveGstRate !== undefined && (
                    <MetricTile label="Effective GST" value={PCT(result.effectiveGstRate)} neutral />
                  )}
                  {result.effectiveTaxRate !== undefined && (
                    <MetricTile label="Tax Rate" value={PCT(result.effectiveTaxRate)}
                      good={result.effectiveTaxRate < 20} />
                  )}
                  {result.tdsCoverageRatio !== undefined && (
                    <MetricTile label="TDS Coverage" value={PCT(result.tdsCoverageRatio)}
                      good={result.tdsCoverageRatio >= 80} />
                  )}
                  {result.turnoverMatchScore !== undefined && (
                    <MetricTile label="GST–ITR Match" value={result.turnoverMatchScore + "%"}
                      good={result.turnoverMatchScore >= 80} />
                  )}
                </View>
              )}

              {/* Flags */}
              {result.flags.length > 0 && (
                <GlassCard accentColor={C.warning}>
                  <CardTitle style={{ color: C.warning }}>Red Flags</CardTitle>
                  {result.flags.map((f, i) => (
                    <View key={i} style={styles.flagRow}>
                      <Feather name="alert-triangle" size={12} color={C.warning} />
                      <Text style={[styles.flagText, { color: C.warning }]}>{f}</Text>
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

              {/* ── Tax Breakdown Pie + Compliance Score ─────────── */}
              {result.gstr && (
                <View style={gstStyles.chartRow}>
                  {/* Compliance score gauge */}
                  <DonutGauge
                    value={result.complianceScore}
                    max={100}
                    color={result.complianceScore >= 80 ? "#10B981" : result.complianceScore >= 60 ? "#F5C842" : "#EF4444"}
                    size={90}
                    label="Score"
                  />
                  {/* Tax type bars */}
                  {((result.gstr.igstCollected ?? 0) > 0 || (result.gstr.cgstCollected ?? 0) > 0 || (result.gstr.sgstCollected ?? 0) > 0) && (
                    <View style={{ flex: 1 }}>
                      <HorizontalBarChart
                        items={[
                          { label: "IGST", value: result.gstr.igstCollected ?? 0, max: Math.max(result.gstr.igstCollected ?? 0, result.gstr.cgstCollected ?? 0, result.gstr.sgstCollected ?? 0, 1), color: PURPLE, format: (v) => "₹" + (v / 1000).toFixed(0) + "K" },
                          { label: "CGST", value: result.gstr.cgstCollected ?? 0, max: Math.max(result.gstr.igstCollected ?? 0, result.gstr.cgstCollected ?? 0, result.gstr.sgstCollected ?? 0, 1), color: BLUE, format: (v) => "₹" + (v / 1000).toFixed(0) + "K" },
                          { label: "SGST", value: result.gstr.sgstCollected ?? 0, max: Math.max(result.gstr.igstCollected ?? 0, result.gstr.cgstCollected ?? 0, result.gstr.sgstCollected ?? 0, 1), color: "#10B981", format: (v) => "₹" + (v / 1000).toFixed(0) + "K" },
                        ]}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* ── GST/ITR Final Summary ─────────────────────────── */}
              <GstFinalSummary result={result} />

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: PURPLE + "55" }}
                  onPress={() => setSaveModal(true)}>
                  <Feather name="save" size={16} color={PURPLE} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: PURPLE }}>Save Case</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.exportBtn, { borderColor: C.secondary + "55", flex: 1 }]}
                  onPress={handleExport} disabled={exporting}>
                  <LinearGradient colors={[PURPLE + "18", PURPLE + "08"]} style={StyleSheet.absoluteFill} />
                  {exporting
                    ? <ActivityIndicator size="small" color={C.secondary} />
                    : <Feather name="download" size={16} color={C.secondary} />}
                  <Text style={[styles.exportText, { color: C.secondary }]}>Export PDF</Text>
                </TouchableOpacity>
              </View>
            </>
            </ResultsErrorBoundary>
          )}
          <TabNavBar current="gst-itr" />
        </ScrollView>
      </PageBackground>

      <Modal visible={saveModal} transparent animationType="slide" onRequestClose={() => setSaveModal(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
          <LinearGradient colors={["#1A2C42", "#111F30"]} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#E8F0F8", textAlign: "center" }}>Save GST & ITR Case</Text>
            <TextInput
              style={{ backgroundColor: "#0D1B2A", borderRadius: 14, padding: 14, fontSize: 14, fontFamily: "Inter_500Medium", color: "#E8F0F8", borderWidth: 1, borderColor: "#1E3A54" }}
              placeholder="Client / Company Name" placeholderTextColor="#3D5A74"
              value={clientName} onChangeText={setClientName} autoFocus
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", alignItems: "center" }} onPress={() => setSaveModal(false)}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#7A9BB5" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center", backgroundColor: PURPLE }} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ExtractedRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={[styles.dataValue, { color }]}>{value}</Text>
    </View>
  );
}

function MetricTile({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  const color = neutral ? BLUE : good ? C.success : C.warning;
  return (
    <LinearGradient colors={["#1A2C42", "#152236"]} style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </LinearGradient>
  );
}

// ── GST-ITR Final Summary ─────────────────────────────────────────────────────
function GstFinalSummary({ result }: { result: AnalysisResult }) {
  const score = result.complianceScore;
  const grade = result.complianceGrade;
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F5C842" : "#EF4444";

  const verdict = score >= 80 ? "COMPLIANT — EXCELLENT PROFILE"
    : score >= 65 ? "LARGELY COMPLIANT"
    : score >= 50 ? "MODERATE COMPLIANCE RISK"
    : "HIGH COMPLIANCE RISK";

  const recommendation = score >= 80
    ? `The taxpayer demonstrates excellent GST/ITR compliance with a score of ${score}/100 (Grade ${grade}). All filings appear timely and complete. This is a low-risk profile; proceed with credit processing without additional compliance scrutiny.`
    : score >= 65
    ? `Good compliance profile (${score}/100, Grade ${grade}) with minor areas of concern. Recommend verifying ${result.flags.length > 0 ? result.flags[0].toLowerCase() : "filing history"} before credit sanction. Standard due diligence is sufficient.`
    : score >= 50
    ? `Moderate compliance risk detected (${score}/100, Grade ${grade}). ${result.flags.length} flag(s) identified. Enhanced document verification required. Consider requesting last 3 years' ITR and 12-month GSTR filings for detailed review.`
    : `High compliance risk (${score}/100, Grade ${grade}). Multiple flags indicate irregular tax behaviour. A comprehensive compliance audit is recommended before any credit decision. Internal escalation may be warranted.`;

  const itrMetrics = result.itr ? [
    { label: "Taxable Income",   value: "₹" + ((result.itr.taxableIncome ?? 0) / 100000).toFixed(1) + "L", color: BLUE },
    { label: "Net Tax Liability", value: "₹" + ((result.itr.netTaxLiability ?? 0) / 100000).toFixed(1) + "L", color: PURPLE },
    result.itr.refundAmount ? { label: "Refund",         value: "₹" + ((result.itr.refundAmount ?? 0) / 100000).toFixed(1) + "L", color: "#10B981" } : null,
    result.effectiveTaxRate ? { label: "Eff. Tax Rate",  value: result.effectiveTaxRate.toFixed(1) + "%", color: "#F5C842" } : null,
  ].filter(Boolean) as { label: string; value: string; color: string }[] : [];

  return (
    <View style={gstSumS.wrap}>
      {/* Header */}
      <View style={[gstSumS.header, { backgroundColor: color + "18", borderColor: color + "55" }]}>
        <View style={[gstSumS.grade, { borderColor: color }]}>
          <Text style={[gstSumS.gradeText, { color }]}>{grade}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[gstSumS.verdictText, { color }]}>{verdict}</Text>
          <Text style={gstSumS.verdictSub}>Compliance Score: {score}/100</Text>
        </View>
      </View>

      {/* ITR metrics row */}
      {itrMetrics.length > 0 && (
        <View style={gstSumS.metricsRow}>
          {itrMetrics.map((m, i) => (
            <View key={i} style={gstSumS.metricItem}>
              <Text style={[gstSumS.metricVal, { color: m.color }]}>{m.value}</Text>
              <Text style={gstSumS.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recommendation */}
      <View style={gstSumS.recBox}>
        <View style={gstSumS.recHeader}>
          <Feather name="shield" size={13} color={C.primary} />
          <Text style={gstSumS.recTitle}>Compliance Recommendation</Text>
        </View>
        <Text style={gstSumS.recText}>{recommendation}</Text>
      </View>
    </View>
  );
}

const gstStyles = StyleSheet.create({
  chartRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14 },
});

const gstSumS = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  grade: { width: 46, height: 46, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  gradeText: { fontSize: 24, fontFamily: "Inter_700Bold" },
  verdictText: { fontSize: 12, fontFamily: "Inter_700Bold", lineHeight: 16 },
  verdictSub: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 2 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricItem: { flex: 1, minWidth: "40%", backgroundColor: "#0C1826", borderRadius: 12, borderWidth: 1, borderColor: "#1E3A54", padding: 10, alignItems: "center", gap: 4 },
  metricVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 9, color: "#7A9BB5", fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  recBox: { backgroundColor: "#0A1628", borderRadius: 12, borderWidth: 1, borderColor: C.primary + "30", padding: 12, gap: 8 },
  recHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  recTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  recText: { fontSize: 12, color: "#8BAFC9", fontFamily: "Inter_400Regular", lineHeight: 18 },
});

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },

  sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  sectionBadge: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  sectionSubtitle: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular" },

  extractedBox: { marginTop: 12, backgroundColor: "#0C1826", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#1A2F45" },
  extractedTitle: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  dataRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#1A2C3A" },
  dataLabel: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  dataValue: { fontSize: 11, fontFamily: "Inter_600SemiBold", maxWidth: "55%", textAlign: "right" },

  scoreCard: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#1E3A54", flexDirection: "row", alignItems: "center" },
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

  flagRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  flagText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },

  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 14, paddingVertical: 14, borderWidth: 1, overflow: "hidden" },
  exportText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorFallback error={error} resetError={retry} />;
}
