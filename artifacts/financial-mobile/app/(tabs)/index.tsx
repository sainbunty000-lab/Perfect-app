import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { calculateWorkingCapital } from "@/lib/calculations";
import type { WorkingCapitalData, WorkingCapitalResults } from "@/lib/calculations";

const C = Colors.light;

// ─── Field definitions ────────────────────────────────────────────────────────
const BS_FIELDS: { key: keyof WorkingCapitalData; label: string }[] = [
  { key: "currentAssets", label: "Current Assets" },
  { key: "currentLiabilities", label: "Current Liabilities" },
  { key: "inventory", label: "Inventory" },
  { key: "debtors", label: "Debtors / Receivables" },
  { key: "creditors", label: "Creditors / Payables" },
  { key: "cash", label: "Cash & Bank Balance" },
];

const PL_FIELDS: { key: keyof WorkingCapitalData; label: string }[] = [
  { key: "sales", label: "Revenue / Sales" },
  { key: "cogs", label: "Cost of Goods Sold" },
  { key: "purchases", label: "Purchases" },
  { key: "expenses", label: "Operating Expenses" },
  { key: "netProfit", label: "Net Profit" },
];

const INITIAL: WorkingCapitalData = {
  currentAssets: 0, currentLiabilities: 0, inventory: 0,
  debtors: 0, creditors: 0, cash: 0,
  sales: 0, cogs: 0, purchases: 0, expenses: 0, netProfit: 0,
};

// ─── Helper ───────────────────────────────────────────────────────────────────
const INR = (n?: number) =>
  n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

export default function WorkingCapitalScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [data, setData] = useState<WorkingCapitalData>({ ...INITIAL });
  const [results, setResults] = useState<WorkingCapitalResults | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

  const set = (key: keyof WorkingCapitalData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  const handleCalculate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = calculateWorkingCapital(data);
    setResults(res);
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/csv", "application/octet-stream"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setParsing(true);
      setUploadedName(asset.name);
      // For mobile: read as text and parse manually
      const response = await fetch(asset.uri);
      const text = await response.text();
      const parsed = parseTextMobile(text);
      setData((d) => ({ ...d, ...parsed }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setParsing(false);
    }
  };

  const wc = results?.workingCapitalAmount ?? 0;
  const wcPositive = wc >= 0;

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
          <Text style={styles.title}>Working Capital</Text>
          <Text style={styles.subtitle}>Upload or enter Balance Sheet & P&L data</Text>
        </View>

        {/* Upload Banner */}
        <TouchableOpacity style={styles.uploadBtn} onPress={handlePickFile} activeOpacity={0.8}>
          {parsing ? (
            <ActivityIndicator color={C.secondary} size="small" />
          ) : (
            <Feather name="upload" size={18} color={C.secondary} />
          )}
          <Text style={styles.uploadText}>
            {uploadedName ? uploadedName : "Upload TXT / CSV"}
          </Text>
          {uploadedName && <Feather name="check-circle" size={16} color={C.success} />}
        </TouchableOpacity>

        {/* Balance Sheet */}
        <SectionCard title="Balance Sheet" color={C.secondary}>
          {BS_FIELDS.map((f) => (
            <InputRow
              key={f.key}
              label={f.label}
              value={data[f.key] === 0 ? "" : String(data[f.key])}
              onChangeText={(v) => set(f.key, v)}
            />
          ))}
        </SectionCard>

        {/* P&L */}
        <SectionCard title="Profit & Loss" color={C.primary}>
          {PL_FIELDS.map((f) => (
            <InputRow
              key={f.key}
              label={f.label}
              value={data[f.key] === 0 ? "" : String(data[f.key])}
              onChangeText={(v) => set(f.key, v)}
            />
          ))}
        </SectionCard>

        {/* Calculate Button */}
        <TouchableOpacity style={styles.calcBtn} onPress={handleCalculate} activeOpacity={0.85}>
          <Feather name="cpu" size={18} color="#fff" />
          <Text style={styles.calcBtnText}>Calculate Ratios</Text>
        </TouchableOpacity>

        {/* Results */}
        {results && (
          <>
            {/* Eligibility + WC */}
            <View style={styles.resultRow}>
              <ResultCard label="Eligibility Amount" value={INR(results.eligibilityAmount)} color={C.primary} accent />
              <ResultCard label="Net Working Capital" value={INR(results.workingCapitalAmount)} color={wcPositive ? C.success : C.danger} />
            </View>

            {/* Ratios Grid */}
            <View style={styles.grid}>
              <RatioTile label="Current Ratio" value={results.currentRatio?.toFixed(2) + "x"} good={(results.currentRatio ?? 0) >= 1.33} />
              <RatioTile label="Quick Ratio" value={results.quickRatio?.toFixed(2) + "x"} good={(results.quickRatio ?? 0) >= 1} />
              <RatioTile label="Inv. Turnover" value={results.inventoryTurnover?.toFixed(2) + "x"} good={(results.inventoryTurnover ?? 0) >= 4} />
              <RatioTile label="Debtor Days" value={results.debtorDays?.toFixed(0) + " d"} good={(results.debtorDays ?? 999) <= 90} />
              <RatioTile label="Creditor Days" value={results.creditorDays?.toFixed(0) + " d"} neutral />
              <RatioTile label="WC Cycle" value={results.workingCapitalCycle?.toFixed(0) + " d"} good={(results.workingCapitalCycle ?? 999) < 60} />
            </View>

            {/* Margin cards */}
            {(results.grossProfitMargin !== undefined || results.netProfitMargin !== undefined) && (
              <View style={styles.resultRow}>
                <ResultCard label="Gross Margin" value={(results.grossProfitMargin ?? 0).toFixed(1) + "%"} color={(results.grossProfitMargin ?? 0) >= 20 ? C.success : C.warning} />
                <ResultCard label="Net Margin" value={(results.netProfitMargin ?? 0).toFixed(1) + "%"} color={(results.netProfitMargin ?? 0) >= 10 ? C.success : C.warning} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Simple text parser for mobile (no PDF.js) ─────────────────────────────────
function parseTextMobile(text: string): Partial<WorkingCapitalData> {
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
  return {
    currentAssets: getNum(["current assets", "ca "]),
    currentLiabilities: getNum(["current liabilities", "cl "]),
    inventory: getNum(["inventory", "closing stock", "stock"]),
    debtors: getNum(["sundry debtors", "trade debtors", "debtors", "receivables"]),
    creditors: getNum(["sundry creditors", "trade creditors", "creditors", "payables"]),
    cash: getNum(["cash and bank", "bank and cash", "cash balance"]),
    sales: getNum(["gross receipts", "net sales", "revenue", "turnover", "sales"]),
    cogs: getNum(["cost of goods sold", "cost of sales", "cogs"]),
    purchases: getNum(["purchases"]),
    expenses: getNum(["total expenses", "operating expenses"]),
    netProfit: getNum(["net profit", "profit after tax", "to net profit"]),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: color }]} />
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InputRow({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={C.textSecondary}
        returnKeyType="done"
      />
    </View>
  );
}

function ResultCard({ label, value, color, accent }: { label: string; value: string; color: string; accent?: boolean }) {
  return (
    <View style={[styles.resultCard, accent && { borderColor: color + "40" }]}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={[styles.resultValue, { color }]}>{value}</Text>
    </View>
  );
}

function RatioTile({ label, value, good, neutral }: { label: string; value: string; good?: boolean; neutral?: boolean }) {
  const color = neutral ? C.secondary : good ? C.success : C.warning;
  return (
    <View style={styles.ratioTile}>
      <Text style={styles.ratioLabel}>{label}</Text>
      <Text style={[styles.ratioValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, gap: 16 },
  header: { marginBottom: 4 },
  brand: { fontSize: 9, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: C.text },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },

  uploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  uploadText: { flex: 1, fontSize: 13, color: C.textSecondary, fontFamily: "Inter_500Medium" },

  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: C.border, overflow: "hidden",
  },
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

  calcBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16,
  },
  calcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  resultRow: { flexDirection: "row", gap: 12 },
  resultCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  resultLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  resultValue: { fontSize: 20, fontFamily: "Inter_700Bold" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ratioTile: {
    width: "30%", flexGrow: 1, backgroundColor: C.card, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: C.border, alignItems: "center",
  },
  ratioLabel: { fontSize: 9, color: C.textSecondary, fontFamily: "Inter_500Medium", textAlign: "center", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  ratioValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
