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
import { calculateBanking } from "@/lib/calculations";
import type { BankingData, BankingResults } from "@/lib/calculations";
import { parseFileViaApi, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportBankingPDF } from "@/lib/pdfExport";
import { useCreateCase } from "@workspace/api-client-react";
import {
  PageBackground, PageHeader, GlassCard, UploadZone,
  GradientButton, MetricTile, CardTitle,
} from "@/components/UI";

const C = Colors.light;

const FIELDS: { key: keyof BankingData; label: string }[] = [
  { key: "totalCredits",       label: "Total Credits" },
  { key: "totalDebits",        label: "Total Debits" },
  { key: "averageBalance",     label: "Average Balance" },
  { key: "minimumBalance",     label: "Minimum Balance" },
  { key: "openingBalance",     label: "Opening Balance" },
  { key: "closingBalance",     label: "Closing Balance" },
  { key: "cashDeposits",       label: "Cash Deposits" },
  { key: "chequeReturns",      label: "Cheque Bounces (#)" },
  { key: "loanRepayments",     label: "Loan Repayments" },
  { key: "overdraftUsage",     label: "Overdraft Usage" },
  { key: "ecsEmiPayments",     label: "ECS / EMI Payments" },
  { key: "transactionFrequency", label: "No. of Transactions" },
];

const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

function parseBankingText(text: string): Partial<BankingData> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const getNum = (keywords: string[]): number | undefined => {
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
  };

  const isCSV = text.includes(",") && lines[0]?.includes(",");
  if (isCSV) {
    const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
    const crIdx = headers.findIndex((h) => h.includes("credit") || h.includes("deposit"));
    const drIdx = headers.findIndex((h) => h.includes("debit") || h.includes("withdrawal"));
    const balIdx = headers.findIndex((h) => h.includes("balance"));
    let totalCr = 0, totalDr = 0;
    const balances: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
      if (crIdx >= 0 && cols[crIdx]) totalCr += parseFloat(cols[crIdx].replace(/,/g, "")) || 0;
      if (drIdx >= 0 && cols[drIdx]) totalDr += parseFloat(cols[drIdx].replace(/,/g, "")) || 0;
      if (balIdx >= 0 && cols[balIdx]) { const b = parseFloat(cols[balIdx].replace(/,/g, "")); if (!isNaN(b)) balances.push(b); }
    }
    return {
      totalCredits: Math.round(totalCr) || undefined,
      totalDebits: Math.round(totalDr) || undefined,
      openingBalance: balances[0],
      closingBalance: balances[balances.length - 1],
      averageBalance: balances.length ? Math.round(balances.reduce((a, b) => a + b, 0) / balances.length) : undefined,
      minimumBalance: balances.length ? Math.round(Math.min(...balances)) : undefined,
      transactionFrequency: lines.length - 1,
    };
  }

  return {
    totalCredits: getNum(["total credits", "total credit", "total amount credited", "total inflow"]),
    totalDebits: getNum(["total debits", "total debit", "total amount debited", "total outflow"]),
    averageBalance: getNum(["average balance", "avg balance", "average monthly balance"]),
    minimumBalance: getNum(["minimum balance", "min balance"]),
    openingBalance: getNum(["opening balance"]),
    closingBalance: getNum(["closing balance"]),
    chequeReturns: getNum(["cheque return", "bounce", "dishonour", "returned"]),
    loanRepayments: getNum(["loan repayment", "emi paid", "loan emi"]),
    overdraftUsage: getNum(["overdraft", "od usage"]),
    ecsEmiPayments: getNum(["ecs", "nach", "emi payment"]),
    cashDeposits: getNum(["cash deposit"]),
    transactionFrequency: getNum(["total transactions", "number of transactions"]),
  };
}

type SlotInfo = { name: string; format: string } | null;

export default function BankingScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const createCase = useCreateCase();

  const [data, setData] = useState<BankingData>({});
  const [results, setResults] = useState<BankingResults | null>(null);
  const [parsing, setParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slot, setSlot] = useState<SlotInfo>(null);
  const [saveModal, setSaveModal] = useState(false);
  const [clientName, setClientName] = useState("");

  const set = (key: keyof BankingData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"], copyToCacheDirectory: true, multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setParsing(true);
      const parsed = await parseFileViaApi(asset.uri, asset.name, asset.mimeType ?? undefined);
      const fields = parseBankingText(parsed.text);
      setData((d) => ({ ...d, ...fields }));
      setSlot({ name: asset.name, format: FORMAT_LABEL[parsed.format] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Parse Failed", "Could not read the file. Try a CSV or PDF statement.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setParsing(false);
    }
  };

  const handleCalculate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResults(calculateBanking(data));
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

  const scoreColor = (s: number) => s >= 75 ? C.success : s >= 55 ? C.warning : C.danger;

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
            subtitle="Upload a bank statement to analyze performance"
            accentColor={C.accent}
          />

          {/* Upload zone */}
          <UploadZone
            onPress={handlePickFile}
            loading={parsing}
            uploaded={!!slot}
            fileName={slot?.name}
            label="Upload Statement — PDF / Excel / CSV / Image"
            accentColor={C.accent}
            onClear={() => setSlot(null)}
          />
          {slot && (
            <Text style={styles.formatChip}>{slot.format} · values extracted from statement</Text>
          )}

          {/* Manual input card */}
          <GlassCard accentColor={C.accent}>
            <CardTitle>Statement Values</CardTitle>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.inputRow}>
                <Text style={styles.inputLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={data[f.key] ? String(data[f.key]) : ""}
                  onChangeText={(v) => set(f.key, v)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#3D5A74"
                  returnKeyType="done"
                />
              </View>
            ))}
          </GlassCard>

          {/* Calculate button */}
          <GradientButton
            onPress={handleCalculate}
            label="Analyze Performance"
            icon="activity"
            colors={[C.accent, "#D4A800"]}
            textColor="#000"
          />

          {/* Results */}
          {results && (
            <>
              {/* Score card */}
              <LinearGradient
                colors={[scoreColor(results.overallScore) + "22", "#152236"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.scoreCard}
              >
                <View style={styles.scoreLeft}>
                  <Text style={styles.assessLabel}>Credit Risk Assessment</Text>
                  <Text style={styles.assessText}>{results.creditRiskAssessment}</Text>
                  <View style={[styles.riskBadge, { backgroundColor: scoreColor(results.overallScore) + "30" }]}>
                    <Text style={[styles.riskText, { color: scoreColor(results.overallScore) }]}>
                      Risk: {results.riskLevel}
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

              {/* KPI grid */}
              <View style={styles.grid}>
                {([
                  ["Working Capital", results.workingCapitalPosition],
                  ["Liquidity",       results.liquidityPosition],
                  ["Cash Flow",       results.cashFlowPosition],
                  ["Creditworthiness",results.creditworthiness],
                  ["Repayment",       results.repaymentCapacity],
                  ["Stability",       results.financialStability],
                ] as const).map(([label, value]) => (
                  <StatusBadge key={label} label={label} value={value as string} />
                ))}
              </View>

              {/* Action row */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: C.primary + "60" }]}
                  onPress={() => setSaveModal(true)}
                >
                  <Feather name="save" size={16} color={C.primary} />
                  <Text style={[styles.actionBtnText, { color: C.primary }]}>Save Case</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: C.secondary + "60" }]}
                  onPress={handleExportPDF}
                  disabled={exporting}
                >
                  {exporting
                    ? <ActivityIndicator size="small" color={C.secondary} />
                    : <Feather name="download" size={16} color={C.secondary} />}
                  <Text style={[styles.actionBtnText, { color: C.secondary }]}>Export PDF</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </PageBackground>

      {/* Save Modal */}
      <Modal visible={saveModal} transparent animationType="slide" onRequestClose={() => setSaveModal(false)}>
        <View style={styles.modalOverlay}>
          <LinearGradient colors={["#1A2C42", "#111F30"]} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save Banking Case</Text>
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
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: C.accent }]} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={[styles.modalSaveText, { color: "#000" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
      <View style={[styles.badgeTag, { backgroundColor: color + "25" }]}>
        <Text style={[styles.badgeValue, { color }]}>{value}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },

  formatChip: { fontSize: 11, color: C.success, fontFamily: "Inter_400Regular", paddingLeft: 4, marginTop: -6 },

  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  inputLabel: { flex: 1, fontSize: 12, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  input: {
    width: 116, textAlign: "right",
    backgroundColor: "#0C1826", borderWidth: 1, borderColor: "#1E3A54",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: "#E8F4FF", fontFamily: "Inter_500Medium",
  },

  scoreCard: {
    borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#1E3A54",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  scoreLeft: { flex: 1, gap: 8 },
  assessLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  assessText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  riskBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  riskText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scoreRight: { alignItems: "center" },
  scoreNum: { fontSize: 52, fontFamily: "Inter_700Bold", lineHeight: 56 },
  scoreMax: { fontSize: 12, color: "#7A9BB5", fontFamily: "Inter_400Regular", textAlign: "center" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: {
    width: "47%", flexGrow: 1, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#1E3A54", gap: 8,
  },
  badgeLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 },
  badgeTag: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14, paddingVertical: 13, borderWidth: 1,
    backgroundColor: "#131F30",
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16, borderWidth: 1, borderColor: "#1E3A54" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  modalInput: {
    backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54",
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: "#E8F4FF", fontFamily: "Inter_400Regular",
  },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#7A9BB5" },
  modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
