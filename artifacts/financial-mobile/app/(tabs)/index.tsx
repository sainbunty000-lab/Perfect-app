import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Platform,
  KeyboardAvoidingView, Alert, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { calculateWorkingCapital } from "@/lib/calculations";
import type { WorkingCapitalData, WorkingCapitalResults } from "@/lib/calculations";
import { parseFileViaApi, FORMAT_LABEL } from "@/lib/parseViaApi";
import { exportWorkingCapitalPDF } from "@/lib/pdfExport";
import { useCreateCase } from "@workspace/api-client-react";

const C = Colors.light;

const BS_FIELDS: { key: keyof WorkingCapitalData; label: string }[] = [
  { key: "currentAssets",      label: "Current Assets" },
  { key: "currentLiabilities", label: "Current Liabilities" },
  { key: "inventory",          label: "Inventory" },
  { key: "debtors",            label: "Debtors / Receivables" },
  { key: "creditors",          label: "Creditors / Payables" },
  { key: "cash",               label: "Cash & Bank Balance" },
];

const PL_FIELDS: { key: keyof WorkingCapitalData; label: string }[] = [
  { key: "sales",      label: "Revenue / Sales" },
  { key: "cogs",       label: "Cost of Goods Sold" },
  { key: "purchases",  label: "Purchases" },
  { key: "expenses",   label: "Operating Expenses" },
  { key: "netProfit",  label: "Net Profit" },
];

const INR = (n?: number) =>
  n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

// ─── Improved text parser (handles Indian numbers, 2-column PDFs) ─────────────
function parseIndianNum(raw: string): number | null {
  const s = raw.trim().replace(/[₹$€£]/g, "").replace(/\bRs\.?\b/gi, "").replace(/\s/g, "").replace(/[()]/g, "");
  const cleaned = s.replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : Math.abs(val);
}

function extractNums(str: string): number[] {
  const pattern = /\([\d,]+(?:\.\d+)?\)|[\d,]+(?:\.\d+)?/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(str)) !== null) {
    const v = parseIndianNum(m[0]);
    if (v !== null && v >= 0) out.push(v);
  }
  return out;
}

function parseWorkingCapitalText(text: string): Partial<WorkingCapitalData> {
  const lines = text
    .replace(/\t/g, "  ")
    .replace(/ {3,}/g, "   ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const findVal = (keywords: string[], excludeKeywords: string[] = []): number | undefined => {
    const candidates: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      let matchPos = -1, matchLen = 0;
      for (const kw of keywords) {
        const pos = lower.indexOf(kw.toLowerCase());
        if (pos !== -1) { matchPos = pos; matchLen = kw.length; break; }
      }
      if (matchPos === -1) continue;

      if (excludeKeywords.length > 0) {
        const exBefore = lower.slice(0, matchPos);
        const exAfter  = lower.slice(matchPos + matchLen);
        const skip = excludeKeywords.some((ex) => {
          const exL = ex.toLowerCase();
          if (exAfter.includes(exL)) return true;
          const idx = exBefore.lastIndexOf(exL);
          if (idx === -1) return false;
          return matchPos - (idx + exL.length) <= 20;
        });
        if (skip) continue;
      }

      const afterKw = line.slice(matchPos + matchLen);
      const nums = extractNums(afterKw).filter((n) => n >= 1);
      if (nums.length > 0) { candidates.push(nums[0]); continue; }

      for (let d = 1; d <= 3; d++) {
        if (i + d >= lines.length) break;
        const ns = extractNums(lines[i + d]).filter((n) => n >= 1);
        if (ns.length > 0) { candidates.push(ns[0]); break; }
      }
    }
    return candidates.length > 0 ? candidates[0] : undefined;
  };

  const compCash = findVal([
    "bank and cash balance", "cash and bank balance", "cash and bank",
    "cash & bank", "balance with bank", "bank balance", "cash in hand",
  ], ["overdraft", "od limit", "cash credit"]);

  const compDebtors = findVal([
    "sundry debtors", "trade debtors", "trade receivables",
    "accounts receivable", "book debts", "debtors",
  ], ["bad debts", "provision for doubtful", "creditors"]);

  const compInventory = findVal([
    "closing stock", "closing inventory", "stock-in-trade", "inventories",
    "finished goods", "raw material stock", "work-in-progress", "stock",
  ]);

  const compAdvances = findVal([
    "loans & advances", "loans and advances", "advance to", "prepaid", "other current assets",
  ], ["secured loans", "unsecured loans", "term loan"]);

  const caLabel =
    findVal(["total current assets"]) ??
    findVal(["net current assets"]) ??
    findVal(["current assets"], ["non-current", "fixed assets"]);
  const caSum = (compCash || 0) + (compDebtors || 0) + (compInventory || 0) + (compAdvances || 0);
  const currentAssets = caSum > (caLabel || 0) ? caSum : (caLabel || caSum || undefined);

  const compCreditors = findVal([
    "sundry creditors", "trade creditors", "trade payables", "accounts payable", "creditors",
  ], ["debtors", "receivable"]);

  const compProvisions = findVal([
    "other provision b/s", "other current liabilities", "provisions", "accrued liabilities",
  ], ["for taxation", "income tax"]);

  const clLabel =
    findVal(["total current liabilities"]) ??
    findVal(["current liabilities"], ["non-current"]);
  const clSum = (compCreditors || 0) + (compProvisions || 0);
  const currentLiabilities = clLabel ?? (clSum > 0 ? clSum : undefined);

  const compSales = findVal([
    "net sales", "net revenue", "revenue from operations", "total income from operations",
    "gross receipts", "gross sales", "turnover", "revenue", "sales",
  ], ["cost of", "purchase"]);

  const compCogs = findVal(["cost of goods sold", "cost of sales", "cogs"]);
  const compPurchases = findVal(["purchases", "material cost"]);

  const compExpenses = findVal([
    "total expenses", "operating expenses", "total expenditure",
    "expenses", "overheads",
  ], ["depreciation", "finance cost"]);

  const compNetProfit = findVal([
    "profit after tax", "net profit after tax", "profit for the year",
    "net profit", "profit", "pat",
  ]);

  return {
    currentAssets,
    currentLiabilities,
    inventory: compInventory,
    debtors: compDebtors,
    creditors: compCreditors,
    cash: compCash,
    sales: compSales,
    cogs: compCogs,
    purchases: compPurchases,
    expenses: compExpenses,
    netProfit: compNetProfit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

type UploadSlot = { name: string; format: string } | null;

export default function WorkingCapitalScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const createCase = useCreateCase();

  const [data, setData] = useState<WorkingCapitalData>({});
  const [results, setResults] = useState<WorkingCapitalResults | null>(null);
  const [bsParsing, setBsParsing] = useState(false);
  const [plParsing, setPlParsing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bsSlot, setBsSlot] = useState<UploadSlot>(null);
  const [plSlot, setPlSlot] = useState<UploadSlot>(null);
  const [saveModal, setSaveModal] = useState(false);
  const [clientName, setClientName] = useState("");

  const set = (key: keyof WorkingCapitalData, val: string) => {
    const num = parseFloat(val.replace(/,/g, "")) || 0;
    setData((d) => ({ ...d, [key]: num }));
  };

  const pickAndParse = async (section: "bs" | "pl") => {
    const setParsing = section === "bs" ? setBsParsing : setPlParsing;
    const setSlot    = section === "bs" ? setBsSlot    : setPlSlot;

    // Fields relevant to each section
    const bsKeys: (keyof WorkingCapitalData)[] = ["currentAssets","currentLiabilities","inventory","debtors","creditors","cash"];
    const plKeys: (keyof WorkingCapitalData)[] = ["sales","cogs","purchases","expenses","netProfit"];
    const relevantKeys = section === "bs" ? bsKeys : plKeys;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      setParsing(true);
      let merged: Partial<WorkingCapitalData> = {};

      try {
        const parsed = await parseFileViaApi(asset.uri, asset.name, asset.mimeType ?? undefined);
        const all = parseWorkingCapitalText(parsed.text);
        // Only apply fields relevant to this section
        for (const key of relevantKeys) {
          if (all[key] !== undefined) merged[key] = all[key];
        }
        setSlot({ name: asset.name, format: FORMAT_LABEL[parsed.format] });
      } catch {
        Alert.alert("Parse Error", "Could not read the file. Please enter values manually.");
        setParsing(false);
        return;
      }

      if (Object.keys(merged).length > 0) {
        setData((d) => ({ ...d, ...merged }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert(
          "No Data Found",
          `Could not extract ${section === "bs" ? "Balance Sheet" : "P&L"} values automatically. Please enter values manually.`
        );
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
    try {
      await exportWorkingCapitalPDF(clientName || "Client", data, results);
    } catch {
      Alert.alert("Export Failed", "Could not generate PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      Alert.alert("Client Name Required", "Enter a client name to save this case.");
      return;
    }
    if (!results) {
      Alert.alert("Calculate First", "Run the calculation before saving.");
      return;
    }
    setSaving(true);
    try {
      await createCase.mutateAsync({
        clientName: clientName.trim(),
        caseType: "working_capital",
        workingCapitalData: data as any,
        workingCapitalResults: results as any,
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

  const wc = results?.workingCapitalAmount ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
          <Text style={styles.title}>Working Capital</Text>
          <Text style={styles.subtitle}>Balance Sheet & Profit & Loss Analysis</Text>
        </View>

        {/* ── Upload: Balance Sheet ─────────────────────────────────────── */}
        <View style={styles.uploadSection}>
          <View style={styles.uploadSectionHeader}>
            <View style={[styles.uploadDot, { backgroundColor: C.secondary }]} />
            <Text style={styles.uploadSectionTitle}>Balance Sheet</Text>
          </View>
          <TouchableOpacity
            style={[styles.uploadBtn, bsSlot && styles.uploadBtnDone]}
            onPress={() => pickAndParse("bs")}
            activeOpacity={0.8}
            disabled={bsParsing}
          >
            {bsParsing ? (
              <ActivityIndicator color={C.secondary} size="small" />
            ) : bsSlot ? (
              <Feather name="check-circle" size={16} color={C.success} />
            ) : (
              <Feather name="upload" size={16} color={C.secondary} />
            )}
            <Text style={[styles.uploadText, bsSlot && { color: C.text }]} numberOfLines={1}>
              {bsParsing ? "Parsing…" : bsSlot ? bsSlot.name : "Upload Balance Sheet (PDF / Excel / Image)"}
            </Text>
            {bsSlot && (
              <TouchableOpacity onPress={() => { setBsSlot(null); }} hitSlop={8}>
                <Feather name="x" size={14} color={C.textSecondary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {bsSlot && (
            <Text style={styles.formatChip}>{bsSlot.format} — Current Assets, Liabilities, Debtors, Creditors extracted</Text>
          )}
        </View>

        {/* ── Upload: Profit & Loss ─────────────────────────────────────── */}
        <View style={styles.uploadSection}>
          <View style={styles.uploadSectionHeader}>
            <View style={[styles.uploadDot, { backgroundColor: C.primary }]} />
            <Text style={styles.uploadSectionTitle}>Profit & Loss</Text>
          </View>
          <TouchableOpacity
            style={[styles.uploadBtn, plSlot && styles.uploadBtnDone]}
            onPress={() => pickAndParse("pl")}
            activeOpacity={0.8}
            disabled={plParsing}
          >
            {plParsing ? (
              <ActivityIndicator color={C.primary} size="small" />
            ) : plSlot ? (
              <Feather name="check-circle" size={16} color={C.success} />
            ) : (
              <Feather name="upload" size={16} color={C.primary} />
            )}
            <Text style={[styles.uploadText, plSlot && { color: C.text }]} numberOfLines={1}>
              {plParsing ? "Parsing…" : plSlot ? plSlot.name : "Upload P&L Statement (PDF / Excel / Image)"}
            </Text>
            {plSlot && (
              <TouchableOpacity onPress={() => { setPlSlot(null); }} hitSlop={8}>
                <Feather name="x" size={14} color={C.textSecondary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {plSlot && (
            <Text style={styles.formatChip}>{plSlot.format} — Sales, Expenses, Net Profit extracted</Text>
          )}
        </View>

        {/* ── Balance Sheet Fields ────────────────────────────────────── */}
        <SectionCard title="Balance Sheet" color={C.secondary}>
          {BS_FIELDS.map((f) => (
            <InputRow key={f.key} label={f.label}
              value={data[f.key] ? String(data[f.key]) : ""}
              onChangeText={(v) => set(f.key, v)} />
          ))}
        </SectionCard>

        {/* ── P&L Fields ────────────────────────────────────────────── */}
        <SectionCard title="Profit & Loss" color={C.primary}>
          {PL_FIELDS.map((f) => (
            <InputRow key={f.key} label={f.label}
              value={data[f.key] ? String(data[f.key]) : ""}
              onChangeText={(v) => set(f.key, v)} />
          ))}
        </SectionCard>

        {/* Calculate */}
        <TouchableOpacity style={styles.calcBtn} onPress={handleCalculate} activeOpacity={0.85}>
          <Feather name="cpu" size={18} color="#fff" />
          <Text style={styles.calcBtnText}>Calculate Ratios</Text>
        </TouchableOpacity>

        {/* Results */}
        {results && (
          <>
            <View style={styles.resultRow}>
              <ResultCard label="Eligibility Amount" value={INR(results.eligibilityAmount)} color={C.primary} />
              <ResultCard label="Net Working Capital" value={INR(results.workingCapitalAmount)} color={wc >= 0 ? C.success : C.danger} />
            </View>

            <View style={styles.grid}>
              <RatioTile label="Current Ratio" value={(results.currentRatio ?? 0).toFixed(2) + "x"} good={(results.currentRatio ?? 0) >= 1.33} />
              <RatioTile label="Quick Ratio"   value={(results.quickRatio ?? 0).toFixed(2) + "x"}   good={(results.quickRatio ?? 0) >= 1} />
              <RatioTile label="Inv. Turnover" value={(results.inventoryTurnover ?? 0).toFixed(2) + "x"} good={(results.inventoryTurnover ?? 0) >= 4} />
              <RatioTile label="Debtor Days"   value={(results.debtorDays ?? 0).toFixed(0) + "d"}   good={(results.debtorDays ?? 999) <= 90} />
              <RatioTile label="Creditor Days" value={(results.creditorDays ?? 0).toFixed(0) + "d"} neutral />
              <RatioTile label="WC Cycle"      value={(results.workingCapitalCycle ?? 0).toFixed(0) + "d"} good={(results.workingCapitalCycle ?? 999) < 60} />
            </View>

            {results.grossProfitMargin !== undefined && (
              <View style={styles.resultRow}>
                <ResultCard label="Gross Margin" value={(results.grossProfitMargin ?? 0).toFixed(1) + "%"} color={(results.grossProfitMargin ?? 0) >= 20 ? C.success : C.warning} />
                <ResultCard label="Net Margin"   value={(results.netProfitMargin ?? 0).toFixed(1) + "%"}   color={(results.netProfitMargin ?? 0) >= 10 ? C.success : C.warning} />
              </View>
            )}

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
            <Text style={styles.modalTitle}>Save Case</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Client / Company Name"
              placeholderTextColor={C.textSecondary}
              value={clientName}
              onChangeText={setClientName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSaveModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
      <TextInput style={styles.input} value={value} onChangeText={onChangeText}
        keyboardType="numeric" placeholder="0" placeholderTextColor={C.textSecondary} returnKeyType="done" />
    </View>
  );
}

function ResultCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.resultCard}>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, gap: 14 },
  header: { marginBottom: 4 },
  brand:    { fontSize: 9, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 2, marginBottom: 4 },
  title:    { fontSize: 26, fontFamily: "Inter_700Bold", color: C.text },
  subtitle: { fontSize: 12, color: C.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },

  uploadSection: { gap: 6 },
  uploadSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  uploadDot: { width: 8, height: 8, borderRadius: 4 },
  uploadSectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.text, textTransform: "uppercase", letterSpacing: 0.8 },

  uploadBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderStyle: "dashed", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
  },
  uploadBtnDone: {
    borderStyle: "solid", borderColor: C.success + "55",
    backgroundColor: C.success + "10",
  },
  uploadText: { flex: 1, fontSize: 13, color: C.textSecondary, fontFamily: "Inter_500Medium" },
  formatChip: { fontSize: 11, color: C.success, fontFamily: "Inter_400Regular", paddingLeft: 16, marginTop: -2 },

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

  calcBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: C.primary, borderRadius: 16, paddingVertical: 15,
  },
  calcBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },

  resultRow: { flexDirection: "row", gap: 12 },
  resultCard: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  resultLabel: { fontSize: 10, color: C.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  resultValue: { fontSize: 19, fontFamily: "Inter_700Bold" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ratioTile: { width: "30%", flexGrow: 1, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  ratioLabel: { fontSize: 9, color: C.textSecondary, fontFamily: "Inter_500Medium", textAlign: "center", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  ratioValue: { fontSize: 16, fontFamily: "Inter_700Bold" },

  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.text },
  modalInput: {
    backgroundColor: "#0D1B2A", borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text, fontFamily: "Inter_400Regular",
  },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: C.textSecondary },
  modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: C.primary, alignItems: "center" },
  modalSaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
