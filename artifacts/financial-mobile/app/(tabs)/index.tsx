import React, { useState } from "react";
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
import { calculateWorkingCapital } from "@/lib/calculations";
import type { WorkingCapitalData, WorkingCapitalResults } from "@/lib/calculations";
import { parseFinancialDocument, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportWorkingCapitalPDF } from "@/lib/pdfExport";
import { useCreateCase } from "@workspace/api-client-react";
import { PageBackground, PageHeader, GlassCard, UploadZone, GradientButton, CardTitle, TabNavBar } from "@/components/UI";
import { BarChart, DonutGauge, HorizontalBarChart, compactINR } from "@/lib/charts";

const C = Colors.light;

const BS_FIELDS: { key: keyof WorkingCapitalData; label: string }[] = [
  { key: "currentAssets",      label: "Current Assets" },
  { key: "currentLiabilities", label: "Current Liabilities" },
  { key: "inventory",          label: "Inventory / Stock" },
  { key: "debtors",            label: "Debtors / Receivables" },
  { key: "creditors",          label: "Creditors / Payables" },
  { key: "cash",               label: "Cash & Bank Balance" },
];

const PL_FIELDS: { key: keyof WorkingCapitalData; label: string }[] = [
  { key: "sales",      label: "Revenue / Sales" },
  { key: "cogs",       label: "Cost of Goods Sold" },
  { key: "purchases",  label: "Purchases" },
  { key: "expenses",   label: "Operating Expenses" },
  { key: "netProfit",  label: "Net Profit / PAT" },
];

const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

type UploadSlot = { name: string; format: string } | null;

export default function WorkingCapitalScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const createCase = useCreateCase();

  const [data, setData]           = useState<WorkingCapitalData>({});
  const [results, setResults]     = useState<WorkingCapitalResults | null>(null);
  const [bsParsing, setBsParsing] = useState(false);
  const [plParsing, setPlParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [bsAsset, setBsAsset]     = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [plAsset, setPlAsset]     = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [bsSlot, setBsSlot]       = useState<UploadSlot>(null);
  const [plSlot, setPlSlot]       = useState<UploadSlot>(null);
  const [saveModal, setSaveModal] = useState(false);
  const [clientName, setClientName] = useState("");
  const [showInputs, setShowInputs] = useState(false);

  const set = (key: keyof WorkingCapitalData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  // Step 1: just pick the file — no parsing yet
  const selectFile = async (section: "bs" | "pl") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      if (section === "bs") { setBsAsset(result.assets[0]); setBsSlot(null); }
      else                  { setPlAsset(result.assets[0]); setPlSlot(null); }
      setResults(null);
    } catch {
      Alert.alert("Error", "Could not open file picker.");
    }
  };

  // Step 2: send to server for parsing
  const doParse = async (section: "bs" | "pl") => {
    const asset        = section === "bs" ? bsAsset : plAsset;
    const setParsing   = section === "bs" ? setBsParsing : setPlParsing;
    const setSlot      = section === "bs" ? setBsSlot    : setPlSlot;
    if (!asset) return;

    setParsing(true);
    try {
      const docType = section === "bs" ? "balance_sheet" : "profit_loss";
      const parsed  = await parseFinancialDocument(asset.uri, asset.name, asset.mimeType ?? undefined, docType);
      const f = parsed.fields as any;

      // After normalizeFields the keys already match WorkingCapitalData.
      // We pick only the fields relevant to this section so BS parse doesn't
      // overwrite PL fields and vice-versa.
      const merged: Partial<WorkingCapitalData> = {};
      if (section === "bs") {
        if (f.currentAssets       != null) merged.currentAssets       = f.currentAssets;
        if (f.currentLiabilities  != null) merged.currentLiabilities  = f.currentLiabilities;
        if (f.inventory           != null) merged.inventory           = f.inventory;
        if (f.debtors             != null) merged.debtors             = f.debtors;
        if (f.creditors           != null) merged.creditors           = f.creditors;
        if (f.cash                != null) merged.cash                = f.cash;
      } else {
        if (f.sales               != null) merged.sales               = f.sales;
        if (f.cogs                != null) merged.cogs                = f.cogs;
        if (f.purchases           != null) merged.purchases           = f.purchases;
        if (f.expenses            != null) merged.expenses            = f.expenses;
        if (f.netProfit           != null) merged.netProfit           = f.netProfit;
        // Fallback: if cogs absent but purchases present, use purchases as cogs
        if (merged.cogs == null && f.purchases != null) merged.cogs   = f.purchases;
      }

      setSlot({ name: asset.name, format: FORMAT_LABEL[parsed.format] });
      if (Object.keys(merged).length > 0) {
        setData((d) => ({ ...d, ...merged }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("No Data Found", "Values could not be extracted. Enter them manually below.");
        setShowInputs(true);
      }
    } catch {
      Alert.alert("Parse Error", "Could not read the file. Enter values manually.");
    } finally {
      setParsing(false);
    }
  };

  const handleCalculate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResults(calculateWorkingCapital(data));
  };

  const handleExportPDF = async () => {
    if (!results) return;
    setExporting(true);
    try { await exportWorkingCapitalPDF(clientName || "Client", data, results); }
    catch { Alert.alert("Export Failed", "Could not generate PDF."); }
    finally { setExporting(false); }
  };

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert("Client Name Required", "Enter a client name to save."); return; }
    if (!results) { Alert.alert("Calculate First", "Run the calculation before saving."); return; }
    setSaving(true);
    try {
      await createCase.mutateAsync({
        clientName: clientName.trim(), caseType: "working_capital",
        workingCapitalData: data as any, workingCapitalResults: results as any,
      } as any);
      setSaveModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Case saved successfully.");
    } catch { Alert.alert("Save Failed", "Could not save the case."); }
    finally { setSaving(false); }
  };

  const wc = results?.workingCapitalAmount ?? 0;
  const hasData = Object.values(data).some((v) => v && v > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageBackground>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader title="Working Capital" subtitle="Balance Sheet & Profit & Loss Analysis" accentColor={C.secondary} />

          {/* ── Step 1: Upload Documents ──────────────────────────── */}
          <StepCard step={1} title="Upload Documents" subtitle="Select your financial documents — values are auto-extracted">
            <UploadZone
              onPress={() => selectFile("bs")}
              loading={bsParsing}
              uploaded={!!bsSlot}
              fileSelected={!!bsAsset && !bsSlot}
              fileName={bsAsset?.name ?? bsSlot?.name}
              label="Select Balance Sheet (PDF / Excel / Image)"
              accentColor={C.secondary}
              onParse={() => doParse("bs")}
              onClear={() => { setBsAsset(null); setBsSlot(null); setData((d) => ({ ...d, currentAssets: undefined, currentLiabilities: undefined, inventory: undefined, debtors: undefined, creditors: undefined, cash: undefined })); setResults(null); }}
            />
            <View style={styles.uploadGap} />
            <UploadZone
              onPress={() => selectFile("pl")}
              loading={plParsing}
              uploaded={!!plSlot}
              fileSelected={!!plAsset && !plSlot}
              fileName={plAsset?.name ?? plSlot?.name}
              label="Select P&L Statement (PDF / Excel / Image)"
              accentColor={C.primary}
              onParse={() => doParse("pl")}
              onClear={() => { setPlAsset(null); setPlSlot(null); setData((d) => ({ ...d, sales: undefined, cogs: undefined, purchases: undefined, expenses: undefined, netProfit: undefined })); setResults(null); }}
            />
            {(bsSlot || plSlot) && (
              <View style={styles.parsedChip}>
                <Feather name="check-circle" size={12} color={C.success} />
                <Text style={styles.parsedText}>
                  {[bsSlot && "Balance Sheet", plSlot && "P&L"].filter(Boolean).join(" + ")} parsed — values auto-filled
                </Text>
              </View>
            )}
          </StepCard>

          {/* ── Step 2: Calculate ─────────────────────────────────── */}
          <StepCard step={2} title="Calculate Working Capital" subtitle="Tap to run ratio analysis using extracted or entered values">
            <GradientButton
              onPress={handleCalculate}
              label="Calculate Working Capital"
              icon="cpu"
              colors={[C.secondary, "#1890A8"]}
            />
            {!hasData && (
              <Text style={styles.hintText}>
                Upload documents above for auto-fill, or tap "Enter Manually" to type values.
              </Text>
            )}
            <TouchableOpacity
              style={styles.manualToggle}
              onPress={() => setShowInputs((v) => !v)}
              activeOpacity={0.7}
            >
              <Feather name={showInputs ? "chevron-up" : "edit-2"} size={13} color={C.primary} />
              <Text style={styles.manualToggleText}>
                {showInputs ? "Hide manual inputs" : "Enter / review values manually"}
              </Text>
            </TouchableOpacity>
          </StepCard>

          {/* ── Manual Input Fields (collapsible) ────────────────── */}
          {showInputs && (
            <>
              <GlassCard accentColor={C.secondary}>
                <CardTitle>Balance Sheet Values</CardTitle>
                {BS_FIELDS.map((f) => (
                  <InputRow key={f.key} label={f.label}
                    value={data[f.key] ? String(data[f.key]) : ""}
                    onChangeText={(v) => set(f.key, v)} />
                ))}
              </GlassCard>

              <GlassCard accentColor={C.primary}>
                <CardTitle>Profit & Loss Values</CardTitle>
                {PL_FIELDS.map((f) => (
                  <InputRow key={f.key} label={f.label}
                    value={data[f.key] ? String(data[f.key]) : ""}
                    onChangeText={(v) => set(f.key, v)} />
                ))}
              </GlassCard>
            </>
          )}

          {/* ── Step 3: Results ───────────────────────────────────── */}
          {results && (
            <>
              <StepCard step={3} title="Analysis Results" subtitle="Working capital ratios and eligibility">
                {/* Big eligibility card */}
                <LinearGradient
                  colors={[C.primary + "22", "#152236"]}
                  style={styles.eligCard}
                >
                  <Text style={styles.eligLabel}>WC Loan Eligibility</Text>
                  <Text style={[styles.eligAmount, { color: C.primary }]}>{INR(results.eligibilityAmount)}</Text>
                  <Text style={styles.eligSub}>Net Working Capital: {INR(results.workingCapitalAmount)}</Text>
                </LinearGradient>

                {/* Ratio grid */}
                <View style={styles.ratioGrid}>
                  <RatioTile label="Current Ratio"   value={(results.currentRatio ?? 0).toFixed(2) + "x"} good={(results.currentRatio ?? 0) >= 1.33} />
                  <RatioTile label="Quick Ratio"     value={(results.quickRatio ?? 0).toFixed(2) + "x"}   good={(results.quickRatio ?? 0) >= 1} />
                  <RatioTile label="Inv. Turnover"   value={(results.inventoryTurnover ?? 0).toFixed(2) + "x"} good={(results.inventoryTurnover ?? 0) >= 4} />
                  <RatioTile label="Debtor Days"     value={(results.debtorDays ?? 0).toFixed(0) + " d"} good={(results.debtorDays ?? 999) <= 90} />
                  <RatioTile label="Creditor Days"   value={(results.creditorDays ?? 0).toFixed(0) + " d"} neutral />
                  <RatioTile label="WC Cycle"        value={(results.workingCapitalCycle ?? 0).toFixed(0) + " d"} good={(results.workingCapitalCycle ?? 999) < 60} />
                </View>

                {results.grossProfitMargin !== undefined && (
                  <View style={styles.marginRow}>
                    <MarginCard label="Gross Margin" value={(results.grossProfitMargin ?? 0).toFixed(1) + "%"} good={(results.grossProfitMargin ?? 0) >= 20} />
                    <MarginCard label="Net Margin"   value={(results.netProfitMargin ?? 0).toFixed(1) + "%"}   good={(results.netProfitMargin ?? 0) >= 10} />
                  </View>
                )}

                {/* ── Assets vs Liabilities Chart ─────────────────── */}
                {((data.currentAssets ?? 0) > 0 || (data.currentLiabilities ?? 0) > 0) && (
                  <View style={styles.chartSection}>
                    <Text style={styles.chartSectionTitle}>Balance Sheet Breakdown</Text>
                    <BarChart
                      datasets={[
                        { label: "Assets", color: C.primary, values: [data.currentAssets ?? 0, data.debtors ?? 0, data.cash ?? 0] },
                        { label: "Liabilities", color: "#EF4444", values: [data.currentLiabilities ?? 0, data.creditors ?? 0, 0] },
                      ]}
                      labels={["Current", "Debtors/Cred.", "Cash"]}
                      width={280}
                      height={160}
                      grouped
                    />
                  </View>
                )}

                {/* ── Working Capital Composition ──────────────────── */}
                {(results.eligibilityAmount ?? 0) > 0 && (
                  <View style={styles.chartSection}>
                    <Text style={styles.chartSectionTitle}>WC Composition</Text>
                    <HorizontalBarChart
                      items={[
                        { label: "Curr. Assets",   value: data.currentAssets ?? 0,      max: Math.max(data.currentAssets ?? 0, data.currentLiabilities ?? 0, 1), color: "#4A9EFF",  format: compactINR },
                        { label: "Curr. Liab.",    value: data.currentLiabilities ?? 0, max: Math.max(data.currentAssets ?? 0, data.currentLiabilities ?? 0, 1), color: "#EF4444",  format: compactINR },
                        { label: "Net WC",          value: Math.abs(results.workingCapitalAmount ?? 0), max: Math.max(data.currentAssets ?? 0, 1),                   color: C.primary,  format: compactINR },
                        { label: "Eligibility",    value: results.eligibilityAmount ?? 0,             max: Math.max(data.currentAssets ?? 0, 1),                   color: "#F5C842",  format: compactINR },
                      ]}
                    />
                  </View>
                )}

                {/* ── Final Summary Card ───────────────────────────── */}
                <WCFinalSummary results={results} />

                {/* Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionBtn, { borderColor: C.primary + "55" }]} onPress={() => setSaveModal(true)} activeOpacity={0.8}>
                    <Feather name="save" size={15} color={C.primary} />
                    <Text style={[styles.actionBtnText, { color: C.primary }]}>Save Case</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { borderColor: C.secondary + "55" }]} onPress={handleExportPDF} activeOpacity={0.8} disabled={exporting}>
                    {exporting ? <ActivityIndicator size="small" color={C.secondary} /> : <Feather name="download" size={15} color={C.secondary} />}
                    <Text style={[styles.actionBtnText, { color: C.secondary }]}>Export PDF</Text>
                  </TouchableOpacity>
                </View>
              </StepCard>
            </>
          )}

          <TabNavBar current="index" />
        </ScrollView>

        {/* Save Modal */}
        <Modal visible={saveModal} transparent animationType="slide" onRequestClose={() => setSaveModal(false)}>
          <View style={styles.modalOverlay}>
            <LinearGradient colors={["#1A2C42", "#111F30"]} style={styles.modalCard}>
              <Text style={styles.modalTitle}>Save Case</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Client / Company Name"
                placeholderTextColor="#3D5A74"
                value={clientName}
                onChangeText={setClientName}
                autoFocus
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSaveModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: C.primary }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </Modal>
      </PageBackground>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────
function StepCard({ step, title, subtitle, children }: { step: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <LinearGradient colors={["#1A2C42", "#152236"]} style={sc.card}>
      <View style={sc.header}>
        <View style={sc.badge}>
          <Text style={sc.badgeNum}>{step}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sc.title}>{title}</Text>
          {subtitle && <Text style={sc.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={sc.body}>{children}</View>
    </LinearGradient>
  );
}
const sc = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54", overflow: "hidden", padding: 18 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  badge: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#0C1826", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1E3A54" },
  badgeNum: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#4A9EFF" },
  title: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  subtitle: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 2 },
  body: { gap: 0 },
});

function InputRow({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input} value={value} onChangeText={onChangeText}
        keyboardType="numeric" placeholder="0" placeholderTextColor="#2A4A65"
        returnKeyType="done"
      />
    </View>
  );
}

// ── WC Final Summary ─────────────────────────────────────────────────────────
function WCFinalSummary({ results }: { results: WorkingCapitalResults }) {
  const cr  = results.currentRatio   ?? 0;
  const qr  = results.quickRatio     ?? 0;
  const npm = results.netProfitMargin ?? 0;
  const elig = results.eligibilityAmount ?? 0;

  const verdictGood = cr >= 1.33 && qr >= 1 && elig > 0;
  const verdictMid  = cr >= 1.0  && elig > 0;
  const verdict     = verdictGood ? "ELIGIBLE" : verdictMid ? "BORDERLINE" : "NOT ELIGIBLE";
  const verdictColor = verdictGood ? "#10B981" : verdictMid ? "#F5C842" : "#EF4444";
  const verdictBg    = verdictGood ? "#10B98120" : verdictMid ? "#F5C84220" : "#EF444420";

  const points: { icon: string; color: string; text: string }[] = [
    cr >= 1.33
      ? { icon: "check-circle", color: "#10B981", text: `Current Ratio ${cr.toFixed(2)}x — adequate liquidity` }
      : { icon: "alert-circle", color: "#EF4444", text: `Current Ratio ${cr.toFixed(2)}x — below 1.33x benchmark` },
    qr >= 1
      ? { icon: "check-circle", color: "#10B981", text: `Quick Ratio ${qr.toFixed(2)}x — strong short-term position` }
      : { icon: "alert-circle", color: "#F5C842", text: `Quick Ratio ${qr.toFixed(2)}x — may face liquidity pressure` },
    npm >= 10
      ? { icon: "check-circle", color: "#10B981", text: `Net Margin ${npm.toFixed(1)}% — healthy profitability` }
      : { icon: "info",         color: "#4A9EFF", text: `Net Margin ${npm.toFixed(1)}% — monitor for improvement` },
    { icon: "trending-up", color: "#4A9EFF", text: `WC Cycle: ${(results.workingCapitalCycle ?? 0).toFixed(0)} days — ${(results.workingCapitalCycle ?? 999) < 60 ? "efficient operations" : "review receivables"}` },
  ];

  const recommendation = verdictGood
    ? `Based on the analysis, the applicant demonstrates strong working capital position with Current Ratio ${cr.toFixed(2)}x and WC eligibility of ${compactINR(elig)}. Recommend approval subject to verification of documents.`
    : verdictMid
    ? `The applicant shows borderline working capital adequacy. Consider approving a reduced limit with enhanced monitoring. Current Ratio ${cr.toFixed(2)}x needs improvement to above 1.33x.`
    : `Working capital position is inadequate for loan eligibility at this time. Current Ratio ${cr.toFixed(2)}x is below minimum benchmark. Suggest reapplication after improving current asset position.`;

  return (
    <View style={sumS.wrap}>
      {/* Verdict banner */}
      <View style={[sumS.verdict, { backgroundColor: verdictBg, borderColor: verdictColor + "60" }]}>
        <Feather name={verdictGood ? "check-circle" : verdictMid ? "alert-circle" : "x-circle"} size={22} color={verdictColor} />
        <View style={{ flex: 1 }}>
          <Text style={[sumS.verdictLabel, { color: verdictColor }]}>{verdict}</Text>
          <Text style={sumS.verdictSub}>Working Capital Assessment</Text>
        </View>
        <Text style={[sumS.verdictAmount, { color: verdictColor }]}>{compactINR(elig)}</Text>
      </View>

      {/* Key points */}
      <View style={sumS.pointsWrap}>
        {points.map((p, i) => (
          <View key={i} style={sumS.pointRow}>
            <Feather name={p.icon as any} size={14} color={p.color} />
            <Text style={sumS.pointText}>{p.text}</Text>
          </View>
        ))}
      </View>

      {/* Recommendation */}
      <View style={sumS.recBox}>
        <View style={sumS.recHeader}>
          <Feather name="file-text" size={13} color={C.primary} />
          <Text style={sumS.recTitle}>Recommendation</Text>
        </View>
        <Text style={sumS.recText}>{recommendation}</Text>
      </View>
    </View>
  );
}

const sumS = StyleSheet.create({
  wrap: { gap: 12, marginTop: 4 },
  verdict: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  verdictLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  verdictSub: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 1 },
  verdictAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  pointsWrap: { gap: 8, backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14 },
  pointRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pointText: { flex: 1, fontSize: 12, color: "#9BBDD4", fontFamily: "Inter_400Regular", lineHeight: 18 },
  recBox: { backgroundColor: "#0A1628", borderRadius: 14, borderWidth: 1, borderColor: C.primary + "30", padding: 14, gap: 8 },
  recHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  recTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  recText: { fontSize: 12, color: "#8BAFC9", fontFamily: "Inter_400Regular", lineHeight: 19 },
});

function RatioTile({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  const color = neutral ? "#7A9BB5" : good ? C.success : C.warning;
  return (
    <LinearGradient colors={["#0C1826", "#111F30"]} style={styles.ratioTile}>
      <Text style={styles.ratioVal}>{value}</Text>
      <Text style={[styles.ratioLabel, { color }]}>{label}</Text>
      {!neutral && <View style={[styles.ratioDot, { backgroundColor: good ? C.success : C.warning }]} />}
    </LinearGradient>
  );
}

function MarginCard({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <LinearGradient colors={[good ? C.success + "18" : C.warning + "18", "#152236"]} style={styles.marginCard}>
      <Text style={styles.marginLabel}>{label}</Text>
      <Text style={[styles.marginValue, { color: good ? C.success : C.warning }]}>{value}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 16 },

  uploadGap: { height: 10 },
  parsedChip: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, backgroundColor: C.success + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  parsedText: { fontSize: 11, color: C.success, fontFamily: "Inter_500Medium", flex: 1 },

  hintText: { fontSize: 11, color: "#4A6A84", fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 10, lineHeight: 17 },
  manualToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1A2F45" },
  manualToggleText: { fontSize: 12, color: C.primary, fontFamily: "Inter_500Medium" },

  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#0F1E30" },
  inputLabel: { flex: 1, fontSize: 12, color: "#8BAAC0", fontFamily: "Inter_400Regular" },
  input: { width: 110, textAlign: "right", backgroundColor: "#0C1826", borderWidth: 1, borderColor: "#1E3A54", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: "#E8F4FF", fontFamily: "Inter_600SemiBold" },

  chartSection: { alignItems: "center", gap: 8, marginVertical: 4, backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14 },
  chartSectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#7A9BB5", textTransform: "uppercase", letterSpacing: 0.8, alignSelf: "flex-start" },

  eligCard: { borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "#1E3A54" },
  eligLabel: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  eligAmount: { fontSize: 32, fontFamily: "Inter_700Bold", marginTop: 4 },
  eligSub: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 4 },

  ratioGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  ratioTile: { width: "31%", flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 12, alignItems: "center", gap: 5 },
  ratioVal: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  ratioLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.3 },
  ratioDot: { width: 5, height: 5, borderRadius: 3 },

  marginRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  marginCard: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14, alignItems: "center", gap: 6 },
  marginLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  marginValue: { fontSize: 22, fontFamily: "Inter_700Bold" },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 13, borderWidth: 1, backgroundColor: "#0C1826" },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16, borderWidth: 1, borderColor: "#1E3A54" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  modalInput: { backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: "#E8F4FF", fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#7A9BB5" },
  modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
