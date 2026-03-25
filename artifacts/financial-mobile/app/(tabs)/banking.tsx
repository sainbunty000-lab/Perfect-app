import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Papa from "papaparse";
import Colors from "@/constants/colors";
import { calculateBanking } from "@/lib/calculations";
import type { BankingData, BankingResults } from "@/lib/calculations";

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

export default function BankingScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [data, setData] = useState<BankingData>({});
  const [results, setResults] = useState<BankingResults | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const set = (key: keyof BankingData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  const handlePickCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/csv", "application/octet-stream"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setParsing(true);
      setUploadedName(asset.name);

      const response = await fetch(asset.uri);
      const text = await response.text();

      // Try CSV parse first
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true, skipEmptyLines: true,
        transformHeader: (h) => h.trim().replace(/\*/g, ""),
      });

      if (parsed.data?.length > 0) {
        const extracted = extractBankingFromCsv(parsed.data);
        setData(extracted);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setParsing(false);
    }
  };

  const handleCalculate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResults(calculateBanking(data));
  };

  const scoreColor = (s: number) => s >= 75 ? C.success : s >= 55 ? C.warning : C.danger;
  const gradeColor = (g: string) => g === "A" ? C.success : g === "B" ? C.secondary : g === "C" ? C.warning : C.danger;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
          <Text style={styles.title}>Banking Analysis</Text>
          <Text style={styles.subtitle}>Upload bank statement CSV or enter values</Text>
        </View>

        {/* Upload */}
        <TouchableOpacity style={styles.uploadBtn} onPress={handlePickCSV} activeOpacity={0.8}>
          {parsing ? (
            <ActivityIndicator color={C.accent} size="small" />
          ) : (
            <MaterialCommunityIcons name="bank-outline" size={18} color={C.accent} />
          )}
          <Text style={styles.uploadText}>
            {uploadedName ?? "Upload Bank Statement (CSV)"}
          </Text>
          {uploadedName && <Feather name="check-circle" size={16} color={C.success} />}
        </TouchableOpacity>

        {/* Manual Input */}
        <View style={styles.card}>
          <View style={[styles.cardAccent, { backgroundColor: C.accent }]} />
          <Text style={styles.cardTitle}>Manual Input</Text>
          {FIELDS.map((f) => (
            <View key={f.key} style={styles.inputRow}>
              <Text style={styles.inputLabel}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={data[f.key] ? String(data[f.key]) : ""}
                onChangeText={(v) => set(f.key, v)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={C.textSecondary}
                returnKeyType="done"
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
            {/* Score Card */}
            <View style={[styles.scoreCard, { borderColor: C.accent + "40" }]}>
              <View style={styles.scoreLeft}>
                <Text style={styles.assessmentLabel}>Overall Assessment</Text>
                <Text style={styles.assessmentText}>{results.creditRiskAssessment}</Text>
                <View style={[styles.riskBadge, { backgroundColor: scoreColor(results.overallScore) + "20" }]}>
                  <Text style={[styles.riskBadgeText, { color: scoreColor(results.overallScore) }]}>
                    Risk: {results.riskLevel}
                  </Text>
                </View>
              </View>
              <View style={styles.scoreRight}>
                <Text style={[styles.scoreNum, { color: C.accent }]}>{results.overallScore}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
            </View>

            {/* Status Grid */}
            <View style={styles.badgeGrid}>
              {([
                { label: "Working Capital", value: results.workingCapitalPosition },
                { label: "Liquidity", value: results.liquidityPosition },
                { label: "Cash Flow", value: results.cashFlowPosition },
                { label: "Creditworthiness", value: results.creditworthiness },
                { label: "Repayment Capacity", value: results.repaymentCapacity },
                { label: "Financial Stability", value: results.financialStability },
                { label: "Banking Behavior", value: results.bankingBehavior },
                { label: "Risk Level", value: results.riskLevel },
              ] as const).map((item) => (
                <StatusBadge key={item.label} label={item.label} value={item.value} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── CSV Extractor ─────────────────────────────────────────────────────────────
function detectCol(headers: string[], candidates: string[]): string | undefined {
  return headers.find((h) => candidates.some((c) => h.toLowerCase().includes(c)));
}

function toNum(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[^-\d.]/g, ""));
  return isNaN(n) ? 0 : Math.abs(n);
}

function extractBankingFromCsv(rows: Record<string, string>[]): BankingData {
  const headers = Object.keys(rows[0]);
  const creditCol = detectCol(headers, ["credit", "deposit", "cr amount", "credit amount"]);
  const debitCol  = detectCol(headers, ["debit", "withdrawal", "dr amount", "debit amount"]);
  const balCol    = detectCol(headers, ["balance", "closing balance", "closing bal"]);
  const descCol   = detectCol(headers, ["description", "narration", "particulars", "remarks"]);

  let totalCredits = 0, totalDebits = 0, bounces = 0, emiPay = 0, cashDep = 0;
  const balances: number[] = [];

  rows.forEach((row) => {
    const cr = toNum(creditCol ? row[creditCol] : undefined);
    const dr = toNum(debitCol  ? row[debitCol]  : undefined);
    const bal = balCol ? parseFloat(String(row[balCol]).replace(/[^-\d.]/g, "")) : NaN;

    totalCredits += cr;
    totalDebits  += dr;
    if (!isNaN(bal)) balances.push(bal);

    const desc = (descCol ? row[descCol] ?? "" : "").toLowerCase();
    if (/bounce|returned|dishonour/i.test(desc)) bounces++;
    if (/ach|ecs|nach|emi/i.test(desc)) emiPay += dr;
    if (/cash dep|atm dep/i.test(desc)) cashDep += cr;
  });

  const avgBal = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;
  const minBal = balances.length ? Math.min(...balances) : 0;

  return {
    totalCredits: Math.round(totalCredits),
    totalDebits: Math.round(totalDebits),
    openingBalance: balances[0] ?? 0,
    closingBalance: balances[balances.length - 1] ?? 0,
    averageBalance: Math.round(avgBal),
    minimumBalance: Math.round(minBal),
    chequeReturns: bounces,
    ecsEmiPayments: Math.round(emiPay),
    cashDeposits: Math.round(cashDep),
    transactionFrequency: rows.length,
  };
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  const good = ["Strong", "Positive", "Low", "Adequate", "Stable", "Disciplined"].includes(value);
  const bad  = ["Weak", "Negative", "High", "Insufficient", "Unstable", "Irregular"].includes(value);
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
  scroll: { paddingHorizontal: 18, gap: 16 },
  header: { marginBottom: 4 },
  brand: { fontSize: 9, fontFamily: "Inter_700Bold", color: C.accent, letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: C.text },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },

  uploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  uploadText: { flex: 1, fontSize: 13, color: C.textSecondary, fontFamily: "Inter_500Medium" },

  card: { backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.text, marginBottom: 12 },

  inputRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  inputLabel: { flex: 1, fontSize: 12, color: C.textSecondary, fontFamily: "Inter_400Regular" },
  input: {
    width: 110, textAlign: "right", backgroundColor: "#0D1B2A",
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: C.text, fontFamily: "Inter_500Medium",
  },

  calcBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  calcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  scoreCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  scoreLeft: { flex: 1, gap: 6 },
  assessmentLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  assessmentText: { fontSize: 15, fontFamily: "Inter_700Bold", color: C.text },
  riskBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  riskBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  scoreRight: { alignItems: "center" },
  scoreNum: { fontSize: 48, fontFamily: "Inter_700Bold" },
  scoreMax: { fontSize: 12, color: C.textSecondary, fontFamily: "Inter_400Regular" },

  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: {
    width: "47%", flexGrow: 1, backgroundColor: C.card, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: C.border,
  },
  badgeLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 },
  badgeTag: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
