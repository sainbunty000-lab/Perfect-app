import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform,
  KeyboardAvoidingView, Alert, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { calculateBanking } from "@/lib/calculations";
import type { BankingData, BankingResults } from "@/lib/calculations";
import { parseFileViaApi, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportBankingPDF } from "@/lib/pdfExport";
import { useCreateCase } from "@workspace/api-client-react";

const C = Colors.light;

const FIELDS: { key: keyof BankingData; label: string }[] = [
  { key: "totalCredits", label: "Total Credits" },
  { key: "totalDebits", label: "Total Debits" },
  { key: "averageBalance", label: "Average Balance" },
  { key: "minimumBalance", label: "Minimum Balance" },
  { key: "openingBalance", label: "Opening Balance" },
  { key: "closingBalance", label: "Closing Balance" },
  { key: "cashDeposits", label: "Cash Deposits" },
  { key: "chequeReturns", label: "Cheque Bounces (#)" },
  { key: "loanRepayments", label: "Loan Repayments" },
  { key: "overdraftUsage", label: "Overdraft Usage" },
  { key: "ecsEmiPayments", label: "ECS / EMI Payments" },
  { key: "transactionFrequency", label: "No. of Transactions" },
];

const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

// Extract banking metrics from raw text (covers bank statement narration patterns)
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

  // For CSV bank statements — sum credit/debit columns
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
    totalCredits: getNum(["total credits", "total credit", "credit amount"]),
    totalDebits: getNum(["total debits", "total debit", "debit amount"]),
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

export default function BankingScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const createCase = useCreateCase();

  const [data, setData] = useState<BankingData>({});
  const [results, setResults] = useState<BankingResults | null>(null);
  const [parsing, setParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; format: string }[]>([]);
  const [saveModal, setSaveModal] = useState(false);
  const [clientName, setClientName] = useState("");

  const set = (key: keyof BankingData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      setParsing(true);
      const parsed = await parseFileViaApi(asset.uri, asset.name, asset.mimeType ?? undefined);
      const fields = parseBankingText(parsed.text);
      setData((d) => ({ ...d, ...fields }));
      setUploadedFiles((f) => [...f, { name: asset.name, format: FORMAT_LABEL[parsed.format] }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Parse Failed", "Could not read the file. Try a CSV or TXT statement.");
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
    try {
      await exportBankingPDF(clientName || "Client", data, results);
    } catch {
      Alert.alert("Export Failed", "Could not generate PDF.");
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert("Client Name Required"); return; }
    if (!results) { Alert.alert("Calculate First"); return; }
    setSaving(true);
    try {
      await createCase.mutateAsync({
        clientName: clientName.trim(),
        caseType: "banking",
        bankingData: data as any,
        bankingResults: results as any,
      } as any);
      setSaveModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Case saved successfully.");
    } catch {
      Alert.alert("Save Failed", "Could not save the case.");
    } finally {
      setSaving(false);
    }
  };

  const scoreColor = (s: number) => s >= 75 ? C.success : s >= 55 ? C.warning : C.danger;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
          <Text style={styles.title}>Banking Analysis</Text>
          <Text style={styles.subtitle}>Upload bank statement or enter values manually</Text>
        </View>

        {/* Upload */}
        <TouchableOpacity style={styles.uploadBtn} onPress={handlePickFile} activeOpacity={0.8}>
          {parsing ? <ActivityIndicator color={C.accent} size="small" /> : <MaterialCommunityIcons name="bank-outline" size={18} color={C.accent} />}
          <Text style={styles.uploadText}>
            {uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s) loaded` : "Upload PDF / Excel / CSV / Image"}
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

        {/* Manual Input */}
        <View style={styles.card}>
          <View style={[styles.cardAccent, { backgroundColor: C.accent }]} />
          <Text style={styles.cardTitle}>Statement Values</Text>
          {FIELDS.map((f) => (
            <View key={f.key} style={styles.inputRow}>
              <Text style={styles.inputLabel}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={data[f.key] ? String(data[f.key]) : ""}
                onChangeText={(v) => set(f.key, v)}
                keyboardType="numeric" placeholder="0" placeholderTextColor={C.textSecondary} returnKeyType="done"
              />
            </View>
          ))}
        </View>

        {/* Calculate */}
        <TouchableOpacity style={[styles.calcBtn, { backgroundColor: C.accent }]} onPress={handleCalculate} activeOpacity={0.85}>
          <Feather name="activity" size={18} color="#000" />
          <Text style={[styles.calcBtnText, { color: "#000" }]}>Analyze Performance</Text>
        </TouchableOpacity>

        {/* Results */}
        {results && (
          <>
            <View style={[styles.scoreCard, { borderColor: C.accent + "40" }]}>
              <View style={styles.scoreLeft}>
                <Text style={styles.assessLabel}>Credit Risk Assessment</Text>
                <Text style={styles.assessText}>{results.creditRiskAssessment}</Text>
                <View style={[styles.riskBadge, { backgroundColor: scoreColor(results.overallScore) + "20" }]}>
                  <Text style={[styles.riskText, { color: scoreColor(results.overallScore) }]}>Risk: {results.riskLevel}</Text>
                </View>
              </View>
              <View>
                <Text style={[styles.scoreNum, { color: C.accent }]}>{results.overallScore}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
            </View>

            <View style={styles.badgeGrid}>
              {([
                ["Working Capital", results.workingCapitalPosition],
                ["Liquidity", results.liquidityPosition],
                ["Cash Flow", results.cashFlowPosition],
                ["Creditworthiness", results.creditworthiness],
                ["Repayment", results.repaymentCapacity],
                ["Stability", results.financialStability],
                ["Behavior", results.bankingBehavior],
                ["Risk Level", results.riskLevel],
              ] as const).map(([label, value]) => (
                <StatusBadge key={label} label={label} value={value} />
              ))}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={() => setSaveModal(true)} activeOpacity={0.8}>
                <Feather name="save" size={16} color={C.primary} />
                <Text style={[styles.actionBtnText, { color: C.primary }]}>Save Case</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={handleExportPDF} activeOpacity={0.8} disabled={exporting}>
                {exporting ? <ActivityIndicator size="small" color={C.secondary} /> : <Feather name="download" size={16} color={C.secondary} />}
                <Text style={[styles.actionBtnText, { color: C.secondary }]}>Export PDF</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Save Modal */}
      <Modal visible={saveModal} transparent animationType="slide" onRequestClose={() => setSaveModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save Banking Case</Text>
            <TextInput style={styles.modalInput} placeholder="Client / Company Name" placeholderTextColor={C.textSecondary}
              value={clientName} onChangeText={setClientName} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSaveModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: C.accent }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={[styles.modalSaveText, { color: "#000" }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function StatusBadge({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  const good = ["Strong", "Positive", "Low", "Adequate", "Stable", "Disciplined"].includes(value);
  const bad = ["Weak", "Negative", "High", "Insufficient", "Unstable", "Irregular"].includes(value);
  const color = good ? C.success : bad ? C.danger : C.warning;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <View style={[styles.badgeTag, { backgroundColor: color + "20" }]}>
        <Text style={[styles.badgeValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, gap: 14 },
  header: { marginBottom: 4 },
  brand: { fontSize: 9, fontFamily: "Inter_700Bold", color: C.accent, letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: C.text },
  subtitle: { fontSize: 12, color: C.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },

  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  uploadText: { flex: 1, fontSize: 13, color: C.textSecondary, fontFamily: "Inter_500Medium" },
  fileChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#162032", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  fileChipText: { flex: 1, fontSize: 12, color: C.text, fontFamily: "Inter_400Regular" },
  fileChipFormat: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_400Regular" },

  card: { backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.text, marginBottom: 12 },

  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  inputLabel: { flex: 1, fontSize: 12, color: C.textSecondary, fontFamily: "Inter_400Regular" },
  input: { width: 110, textAlign: "right", backgroundColor: "#0D1B2A", borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: C.text, fontFamily: "Inter_500Medium" },

  calcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 15 },
  calcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  scoreCard: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scoreLeft: { flex: 1, gap: 6 },
  assessLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  assessText: { fontSize: 15, fontFamily: "Inter_700Bold", color: C.text },
  riskBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  riskText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scoreNum: { fontSize: 46, fontFamily: "Inter_700Bold", textAlign: "center" },
  scoreMax: { fontSize: 12, color: C.textSecondary, textAlign: "center", fontFamily: "Inter_400Regular" },

  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: { width: "47%", flexGrow: 1, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border },
  badgeLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 },
  badgeTag: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.text },
  modalInput: { backgroundColor: "#0D1B2A", borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text, fontFamily: "Inter_400Regular" },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: C.textSecondary },
  modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center" },
  modalSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
