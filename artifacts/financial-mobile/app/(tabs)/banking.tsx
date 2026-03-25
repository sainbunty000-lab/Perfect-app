import React, { useState, Component } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform,
  KeyboardAvoidingView, Alert, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { calculateBanking } from "@/lib/calculations";
import type { BankingData, BankingResults } from "@/lib/calculations";
import { parseFinancialDocument, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportBankingPDF } from "@/lib/pdfExport";
import { useCreateCase } from "@workspace/api-client-react";
import {
  PageBackground, PageHeader, GlassCard, UploadZone,
  GradientButton, CardTitle, TabNavBar,
} from "@/components/UI";
import { DonutGauge, HorizontalBarChart } from "@/lib/charts";

const C = Colors.light;

// Module-level helper — used by both BankingScreen and BankingFinalSummary
const scoreColor = (s: number) => s >= 75 ? C.success : s >= 55 ? C.warning : C.danger;

// Safe rgba helper — avoids 8-digit hex which can break on some Android builds
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

// Catches render-time errors and shows the actual message instead of a blank screen
class ResultsErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: any) {
    return { error: e?.message ?? "Unknown render error" };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ backgroundColor: "#1A0000", borderRadius: 14, padding: 16, gap: 8 }}>
          <Text style={{ color: "#EF4444", fontFamily: "Inter_700Bold", fontSize: 13 }}>
            Results render error — please report this:
          </Text>
          <Text style={{ color: "#FF9999", fontFamily: "Inter_400Regular", fontSize: 11 }}>
            {this.state.error}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const FIELDS: { key: keyof BankingData; label: string; section: "credit" | "balance" | "risk" }[] = [
  { key: "totalCredits",        label: "Total Credits",          section: "credit" },
  { key: "totalDebits",         label: "Total Debits",           section: "credit" },
  { key: "averageBalance",      label: "Average Balance",        section: "balance" },
  { key: "minimumBalance",      label: "Minimum Balance",        section: "balance" },
  { key: "openingBalance",      label: "Opening Balance",        section: "balance" },
  { key: "closingBalance",      label: "Closing Balance",        section: "balance" },
  { key: "cashDeposits",        label: "Cash Deposits",          section: "risk" },
  { key: "chequeReturns",       label: "Cheque Bounces (#)",     section: "risk" },
  { key: "loanRepayments",      label: "Loan Repayments",        section: "risk" },
  { key: "overdraftUsage",      label: "Overdraft Usage",        section: "risk" },
  { key: "ecsEmiPayments",      label: "ECS / EMI Payments",     section: "risk" },
  { key: "transactionFrequency",label: "No. of Transactions",    section: "risk" },
];

const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

type SlotInfo = { name: string; format: string; bankName?: string; period?: string } | null;

export default function BankingScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const createCase = useCreateCase();

  const [data, setData]           = useState<BankingData>({});
  const [results, setResults]     = useState<BankingResults | null>(null);
  const [parsing, setParsing]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [asset, setAsset]         = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [slot, setSlotState]      = useState<SlotInfo>(null);
  const [saveModal, setSaveModal] = useState(false);
  const [clientName, setClientName] = useState("");
  const [showInputs, setShowInputs] = useState(false);

  const set = (key: keyof BankingData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  // Step 1: pick the file only
  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      setAsset(result.assets[0]);
      setSlotState(null);
      setResults(null);
    } catch {
      Alert.alert("Error", "Could not open file picker.");
    }
  };

  // Step 2: send to server for parsing
  const handleParseFile = async () => {
    if (!asset) return;
    setParsing(true);
    try {
      const parsed = await parseFinancialDocument(asset.uri, asset.name, asset.mimeType ?? undefined, "banking");
      // normalizeFields already applied in parseViaApi — all keys match BankingData
      const f = parsed.fields as any;
      setData((d) => ({
        ...d,
        ...(f.totalCredits         != null && { totalCredits:         f.totalCredits }),
        ...(f.totalDebits          != null && { totalDebits:          f.totalDebits }),
        ...(f.averageBalance       != null && { averageBalance:       f.averageBalance }),
        ...(f.minimumBalance       != null && { minimumBalance:       f.minimumBalance }),
        ...(f.openingBalance       != null && { openingBalance:       f.openingBalance }),
        ...(f.closingBalance       != null && { closingBalance:       f.closingBalance }),
        ...(f.cashDeposits         != null && { cashDeposits:         f.cashDeposits }),
        ...(f.chequeReturns        != null && { chequeReturns:        f.chequeReturns }),
        ...(f.loanRepayments       != null && { loanRepayments:       f.loanRepayments }),
        ...(f.overdraftUsage       != null && { overdraftUsage:       f.overdraftUsage }),
        ...(f.ecsEmiPayments       != null && { ecsEmiPayments:       f.ecsEmiPayments }),
        ...(f.transactionFrequency != null && { transactionFrequency: f.transactionFrequency }),
        ...(f.salaryCredits        != null && { salaryCredits:        f.salaryCredits }),
        ...(f.interestCredits      != null && { interestCredits:      f.interestCredits }),
        ...(f.interestDebits       != null && { interestDebits:       f.interestDebits }),
        ...(f.bankCharges          != null && { bankCharges:          f.bankCharges }),
        ...(f.upiTransactions      != null && { upiTransactions:      f.upiTransactions }),
        ...(f.rtgsNeftTransfers    != null && { rtgsNeftTransfers:    f.rtgsNeftTransfers }),
        ...(f.largeTransactions    != null && { largeTransactions:    f.largeTransactions }),
      }));
      setSlotState({ name: asset.name, format: FORMAT_LABEL[parsed.format], bankName: f.bankName ?? f.bank ?? "", period: f.statementPeriod ?? f.period ?? "" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Parse Failed", e?.message ?? "Could not read the file. Try a CSV or PDF statement.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setParsing(false);
    }
  };

  const handleCalculate = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const r = calculateBanking(data);
      setResults(r);
    } catch (e: any) {
      Alert.alert("Calculation Error", e?.message ?? "Could not calculate results.");
    }
  };

  const handleExportPDF = async () => {
    if (!results) return;
    setExporting(true);
    try { await exportBankingPDF(clientName || "Client", data, results); }
    catch { Alert.alert("Export Failed", "Could not generate PDF."); }
    finally { setExporting(false); }
  };

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert("Client Name Required"); return; }
    if (!results) { Alert.alert("Calculate First"); return; }
    setSaving(true);
    try {
      await createCase.mutateAsync({
        clientName: clientName.trim(), caseType: "banking",
        bankingData: data as any, bankingResults: results as any,
      } as any);
      setSaveModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Case saved successfully.");
    } catch { Alert.alert("Save Failed", "Could not save the case."); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageBackground>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader
            title="Banking Analysis"
            subtitle="Upload a bank statement for automatic extraction"
            accentColor={C.accent}
          />

          {/* ── Upload Section ───────────────────────────────────── */}
          <GlassCard accentColor={C.accent}>
            <CardTitle>Bank Statement Upload</CardTitle>
            <Text style={styles.sectionHint}>
              Supports: HDFC · SBI · ICICI · Axis · Kotak · PNB · all major banks{"\n"}
              Format: PDF · Excel · CSV · Image (scanned)
            </Text>

            <UploadZone
              onPress={handleSelectFile}
              loading={parsing}
              uploaded={!!slot}
              fileSelected={!!asset && !slot}
              fileName={asset?.name ?? slot?.name}
              label="Select Bank Statement (PDF / Excel / CSV)"
              accentColor={C.accent}
              onParse={handleParseFile}
              onClear={() => { setAsset(null); setSlotState(null); setData({}); setResults(null); }}
            />

            {/* Detected metadata */}
            {slot && (
              <View style={styles.metaBox}>
                {slot.bankName && (
                  <View style={styles.metaRow}>
                    <Feather name="home" size={12} color={C.accent} />
                    <Text style={styles.metaText}>{slot.bankName} detected</Text>
                  </View>
                )}
                {slot.period && (
                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={12} color={C.textSecondary} />
                    <Text style={styles.metaText}>{slot.period}</Text>
                  </View>
                )}
                <View style={styles.metaRow}>
                  <Feather name="file" size={12} color={C.textSecondary} />
                  <Text style={styles.metaText}>{slot.format} · values auto-filled below</Text>
                </View>
              </View>
            )}
          </GlassCard>

          {/* ── Analyze Button — right after upload ──────────────── */}
          <GlassCard accentColor={C.accent}>
            <GradientButton
              onPress={handleCalculate}
              label="Analyze Banking Performance"
              icon="activity"
              colors={[C.accent, "#D4A800"]}
              textColor="#000"
            />
            {!slot && (
              <Text style={styles.analyzeHint}>
                Upload a bank statement above for auto-fill, or enter values manually below.
              </Text>
            )}
            <TouchableOpacity
              style={styles.manualToggle}
              onPress={() => setShowInputs((v) => !v)}
              activeOpacity={0.7}
            >
              <Feather name={showInputs ? "chevron-up" : "edit-2"} size={13} color={C.accent} />
              <Text style={[styles.manualToggleText, { color: C.accent }]}>
                {showInputs ? "Hide manual inputs" : "Enter / review values manually"}
              </Text>
            </TouchableOpacity>
          </GlassCard>

          {/* ── Collapsible Input Fields ──────────────────────────── */}
          {showInputs && (
            <>
              <GlassCard accentColor={C.accent}>
                <CardTitle>Credits & Debits</CardTitle>
                {FIELDS.filter((f) => f.section === "credit").map((f) => (
                  <InputRow key={f.key} label={f.label} value={data[f.key] ? String(data[f.key]) : ""}
                    onChangeText={(v) => set(f.key, v)} />
                ))}
              </GlassCard>

              <GlassCard accentColor={C.primary}>
                <CardTitle>Account Balances</CardTitle>
                {FIELDS.filter((f) => f.section === "balance").map((f) => (
                  <InputRow key={f.key} label={f.label} value={data[f.key] ? String(data[f.key]) : ""}
                    onChangeText={(v) => set(f.key, v)} />
                ))}
              </GlassCard>

              <GlassCard accentColor={C.secondary}>
                <CardTitle>Risk Indicators</CardTitle>
                {FIELDS.filter((f) => f.section === "risk").map((f) => (
                  <InputRow key={f.key} label={f.label} value={data[f.key] ? String(data[f.key]) : ""}
                    onChangeText={(v) => set(f.key, v)} />
                ))}
              </GlassCard>
            </>
          )}

          {/* ── Results ──────────────────────────────────────────── */}
          {results && (
            <ResultsErrorBoundary>
              <LinearGradient
                colors={[withAlpha(scoreColor(results.overallScore), 0.13), "#152236"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.scoreCard}
              >
                <View style={styles.scoreLeft}>
                  <Text style={styles.assessLabel}>Credit Risk Assessment</Text>
                  <Text style={styles.assessText}>{results.creditRiskAssessment}</Text>
                  <View style={[styles.riskBadge, { backgroundColor: withAlpha(scoreColor(results.overallScore), 0.19) }]}>
                    <Text style={[styles.riskText, { color: scoreColor(results.overallScore) }]}>
                      Risk Level: {results.riskLevel}
                    </Text>
                  </View>
                </View>
                <View style={styles.scoreRight}>
                  <Text style={[styles.scoreNum, { color: scoreColor(results.overallScore) }]}>
                    {results.overallScore}
                  </Text>
                  <Text style={styles.scoreMax}>/100</Text>
                </View>
              </LinearGradient>

              <View style={styles.badgeGrid}>
                {([
                  ["Working Capital", results.workingCapitalPosition],
                  ["Liquidity",       results.liquidityPosition],
                  ["Cash Flow",       results.cashFlowPosition],
                  ["Creditworthiness",results.creditworthiness],
                  ["Repayment",       results.repaymentCapacity],
                  ["Stability",       results.financialStability],
                  ["Behavior",        results.bankingBehavior],
                  ["Risk Level",      results.riskLevel],
                ] as const).map(([label, value]) => (
                  <StatusBadge key={label} label={label} value={value as string} />
                ))}
              </View>

              {/* ── Score Gauge + Category Bars ──────────────────── */}
              <View style={bStyles.chartRow}>
                <DonutGauge
                  value={results.overallScore}
                  max={100}
                  color={scoreColor(results.overallScore)}
                  size={90}
                  label="Score"
                />
                <View style={{ flex: 1 }}>
                  <HorizontalBarChart
                    items={[
                      { label: "Liquidity",   value: results.liquidityPosition     === "Strong" ? 90 : results.liquidityPosition  === "Adequate" ? 65 : 35, max: 100, color: "#4A9EFF",  format: (v) => `${v}%` },
                      { label: "Cash Flow",   value: results.cashFlowPosition      === "Strong" ? 90 : results.cashFlowPosition   === "Adequate" ? 65 : 35, max: 100, color: "#10B981",  format: (v) => `${v}%` },
                      { label: "Credit",      value: results.creditworthiness      === "Strong" ? 90 : results.creditworthiness   === "Adequate" ? 65 : 35, max: 100, color: "#D4A800",  format: (v) => `${v}%` },
                      { label: "Repayment",   value: results.repaymentCapacity     === "Strong" ? 90 : results.repaymentCapacity  === "Adequate" ? 65 : 35, max: 100, color: "#A855F7",  format: (v) => `${v}%` },
                      { label: "Stability",   value: results.financialStability    === "Strong" ? 90 : results.financialStability === "Adequate" ? 65 : 35, max: 100, color: "#20B2AA",  format: (v) => `${v}%` },
                    ]}
                  />
                </View>
              </View>

              {/* ── Banking Final Summary ─────────────────────────── */}
              <BankingFinalSummary results={results} />

              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, { borderColor: withAlpha(C.primary, 0.38) }]}
                  onPress={() => setSaveModal(true)}>
                  <Feather name="save" size={16} color={C.primary} />
                  <Text style={[styles.actionBtnText, { color: C.primary }]}>Save Case</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { borderColor: withAlpha(C.secondary, 0.38) }]}
                  onPress={handleExportPDF} disabled={exporting}>
                  {exporting
                    ? <ActivityIndicator size="small" color={C.secondary} />
                    : <Feather name="download" size={16} color={C.secondary} />}
                  <Text style={[styles.actionBtnText, { color: C.secondary }]}>Export PDF</Text>
                </TouchableOpacity>
              </View>
            </ResultsErrorBoundary>
          )}
          <TabNavBar current="banking" />
        </ScrollView>
      </PageBackground>

      <Modal visible={saveModal} transparent animationType="slide" onRequestClose={() => setSaveModal(false)}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={["#1A2C42", "#111F30"]} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save Banking Case</Text>
            <TextInput
              style={styles.modalInput} placeholder="Client / Company Name"
              placeholderTextColor="#3D5A74" value={clientName}
              onChangeText={setClientName} autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSaveModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: C.accent }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={[styles.modalSaveText, { color: "#000" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Banking Final Summary ─────────────────────────────────────────────────────
function BankingFinalSummary({ results }: { results: BankingResults }) {
  const score = results.overallScore;
  const color = scoreColor(score);

  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  const verdict = score >= 80 ? "EXCELLENT — RECOMMEND APPROVAL"
    : score >= 65 ? "GOOD — CONDITIONAL APPROVAL"
    : score >= 50 ? "AVERAGE — ENHANCED MONITORING"
    : "WEAK — CAUTION REQUIRED";

  const strengths = [
    results.liquidityPosition    === "Strong" && "Strong liquidity position",
    results.cashFlowPosition     === "Strong" && "Healthy cash flow",
    results.creditworthiness     === "Strong" && "Excellent creditworthiness",
    results.repaymentCapacity    === "Strong" && "Strong repayment capacity",
    results.financialStability   === "Strong" && "Stable financial profile",
    results.bankingBehavior      === "Regular" && "Regular banking behaviour",
  ].filter(Boolean) as string[];

  const concerns = [
    results.liquidityPosition    === "Weak" && "Liquidity is inadequate",
    results.cashFlowPosition     === "Weak" && "Cash flow irregularities detected",
    results.creditworthiness     === "Weak" && "Creditworthiness needs attention",
    results.repaymentCapacity    === "Weak" && "Repayment capacity is strained",
    results.riskLevel            === "High"  && "High credit risk — monitor closely",
  ].filter(Boolean) as string[];

  const recommendation = score >= 80
    ? `The borrower demonstrates an excellent banking profile with a score of ${score}/100. All key parameters are satisfactory. Recommend approval of credit facility as requested, subject to standard documentation.`
    : score >= 65
    ? `The borrower presents a good banking profile (${score}/100) with a few minor concerns. Recommend conditional approval with quarterly monitoring of account operations and financial statements.`
    : score >= 50
    ? `The borrower shows an average profile (${score}/100). Enhanced due diligence required. Consider approving a reduced credit limit with strict covenants and frequent reviews.`
    : `The borrower's banking profile (${score}/100) raises significant concerns. A full review of banking statements and collateral coverage is strongly recommended before any credit decision.`;

  return (
    <View style={bSumS.wrap}>
      <View style={[bSumS.header, { backgroundColor: withAlpha(color, 0.09), borderColor: withAlpha(color, 0.33) }]}>
        <View style={[bSumS.gradeCircle, { borderColor: color }]}>
          <Text style={[bSumS.gradeText, { color }]}>{grade}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[bSumS.verdictText, { color }]}>{verdict}</Text>
          <Text style={bSumS.verdictSub}>Overall Score: {score}/100</Text>
        </View>
      </View>

      {strengths.length > 0 && (
        <View style={bSumS.section}>
          <Text style={bSumS.sectionTitle}>Strengths</Text>
          {strengths.map((s, i) => (
            <View key={i} style={bSumS.row}>
              <Feather name="check-circle" size={13} color="#10B981" />
              <Text style={bSumS.rowText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {concerns.length > 0 && (
        <View style={bSumS.section}>
          <Text style={[bSumS.sectionTitle, { color: "#EF4444" }]}>Concerns</Text>
          {concerns.map((c, i) => (
            <View key={i} style={bSumS.row}>
              <Feather name="alert-circle" size={13} color="#EF4444" />
              <Text style={bSumS.rowText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={bSumS.recBox}>
        <View style={bSumS.recHeader}>
          <Feather name="clipboard" size={13} color={C.primary} />
          <Text style={bSumS.recTitle}>Credit Officer Recommendation</Text>
        </View>
        <Text style={bSumS.recText}>{recommendation}</Text>
      </View>
    </View>
  );
}

const bStyles = StyleSheet.create({
  chartRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14 },
});

const bSumS = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  gradeCircle: { width: 48, height: 48, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  gradeText: { fontSize: 26, fontFamily: "Inter_700Bold" },
  verdictText: { fontSize: 12, fontFamily: "Inter_700Bold", lineHeight: 17 },
  verdictSub: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { backgroundColor: "#0C1826", borderRadius: 12, borderWidth: 1, borderColor: "#1E3A54", padding: 12, gap: 8 },
  sectionTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#10B981", textTransform: "uppercase", letterSpacing: 0.8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowText: { flex: 1, fontSize: 12, color: "#9BBDD4", fontFamily: "Inter_400Regular", lineHeight: 17 },
  recBox: { backgroundColor: "#0A1628", borderRadius: 12, borderWidth: 1, borderColor: withAlpha(C.primary, 0.19), padding: 12, gap: 8 },
  recHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  recTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  recText: { fontSize: 12, color: "#8BAFC9", fontFamily: "Inter_400Regular", lineHeight: 18 },
});

function InputRow({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input} value={value} onChangeText={onChangeText}
        keyboardType="numeric" placeholder="0" placeholderTextColor="#3D5A74" returnKeyType="done"
      />
    </View>
  );
}

function StatusBadge({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  const good = ["Strong", "Positive", "Low", "Adequate", "Stable", "Disciplined"].includes(value);
  const bad  = ["Weak", "Negative", "High", "Insufficient", "Unstable", "Irregular"].includes(value);
  const color = good ? C.success : bad ? C.danger : C.warning;
  return (
    <LinearGradient colors={["#1A2C42", "#152236"]} style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <View style={[styles.badgeTag, { backgroundColor: withAlpha(color, 0.15) }]}>
        <Text style={[styles.badgeValue, { color }]}>{value}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 16 },
  analyzeHint: { fontSize: 11, color: "#4A6A84", fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 10, lineHeight: 17 },
  manualToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1A2F45" },
  manualToggleText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  sectionHint: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginBottom: 12, lineHeight: 17 },
  metaBox: { marginTop: 10, gap: 5, backgroundColor: "#0C1826", borderRadius: 10, padding: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular" },

  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  inputLabel: { flex: 1, fontSize: 12, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  input: {
    width: 116, textAlign: "right",
    backgroundColor: "#0C1826", borderWidth: 1, borderColor: "#1E3A54",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: "#E8F4FF", fontFamily: "Inter_500Medium",
  },

  scoreCard: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#1E3A54", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scoreLeft: { flex: 1, gap: 8 },
  assessLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  assessText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  riskBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  riskText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scoreRight: { alignItems: "center" },
  scoreNum: { fontSize: 52, fontFamily: "Inter_700Bold", lineHeight: 56 },
  scoreMax: { fontSize: 12, color: "#7A9BB5", fontFamily: "Inter_400Regular", textAlign: "center" },

  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: { width: "47%", flexGrow: 1, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#1E3A54", gap: 8 },
  badgeLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 },
  badgeTag: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, borderWidth: 1, backgroundColor: "#131F30" },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16, borderWidth: 1, borderColor: "#1E3A54" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  modalInput: { backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: "#E8F4FF", fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#7A9BB5" },
  modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
