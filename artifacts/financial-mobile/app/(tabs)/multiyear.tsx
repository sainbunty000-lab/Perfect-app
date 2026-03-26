import React, { useState, Component } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, useWindowDimensions, ActivityIndicator, Modal, TextInput,
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
import { LineChart, BarChart, PieChart, ChartLegend, HorizontalBarChart, compactINR } from "@/lib/charts";
import { PageBackground, PageHeader, GlassCard, UploadZone, GradientButton, CardTitle, TabNavBar } from "@/components/UI";

const C = Colors.light;
const GREEN = "#10B981";
const TEAL  = "#4A9EFF";
const AMBER = "#F59E0B";

// ─── Types ────────────────────────────────────────────────────────────────────
interface YearData {
  label: string;    // e.g. "FY 2022-23"
  // From balance sheet
  currentAssets?:      number;
  currentLiabilities?: number;
  inventory?:          number;
  debtors?:            number;
  creditors?:          number;
  cash?:               number;
  totalAssets?:        number;
  netWorth?:           number;
  // From P&L
  sales?:      number;
  cogs?:       number;
  grossProfit?: number;
  netProfit?:  number;
  expenses?:   number;
  ebitda?:     number;
}

interface YearSlot {
  data: YearData;
  bsRawAsset?: DocumentPicker.DocumentPickerAsset;
  bsFile?: string; bsFormat?: string; bsParsing?: boolean;
  plRawAsset?: DocumentPicker.DocumentPickerAsset;
  plFile?: string; plFormat?: string; plParsing?: boolean;
}

const DEFAULT_LABELS = ["FY 2023-24", "FY 2024-25", "FY 2025-26"];

function emptySlot(label: string): YearSlot {
  return { data: { label } };
}

function currentRatio(d: YearData) {
  return d.currentAssets && d.currentLiabilities ? d.currentAssets / d.currentLiabilities : undefined;
}
function wcAmount(d: YearData) {
  return d.currentAssets !== undefined && d.currentLiabilities !== undefined
    ? d.currentAssets - d.currentLiabilities : undefined;
}
function gpMargin(d: YearData) {
  if (!d.sales || d.grossProfit === undefined) return undefined;
  return (d.grossProfit / d.sales) * 100;
}
function npMargin(d: YearData) {
  if (!d.sales || d.netProfit === undefined) return undefined;
  return (d.netProfit / d.sales) * 100;
}

function pct(n?: number) { return n !== undefined ? n.toFixed(1) + "%" : "—"; }
function trend(vals: (number | null)[]) {
  const clean = vals.filter((v): v is number => v !== null);
  if (clean.length < 2) return null;
  const delta = clean[clean.length - 1] - clean[0];
  return { up: delta >= 0, pct: ((delta / Math.abs(clean[0])) * 100).toFixed(1) };
}

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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MultiYearScreen() {
  const insets    = useSafeAreaInsets();
  const tabHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const chartW    = width - 32 - 36;

  const createCase = useCreateCase();

  const [slots, setSlots] = useState<YearSlot[]>(DEFAULT_LABELS.map(emptySlot));
  const [expanded, setExpanded] = useState<boolean[]>([true, false, false]);
  const [analyzed, setAnalyzed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [clientName, setClientName] = useState("");

  // ── Parse helpers ─────────────────────────────────────────────────────────
  const setSlot = (i: number, patch: Partial<YearSlot>) =>
    setSlots((prev) => prev.map((s, j) => j === i ? { ...s, ...patch } : s));

  // Step 1: select file (no parsing yet)
  const selectBS = async (i: number) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      setSlot(i, { bsRawAsset: res.assets[0], bsFile: undefined });
      setAnalyzed(false);
    } catch { Alert.alert("Error", "Could not open file picker."); }
  };

  const selectPL = async (i: number) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      setSlot(i, { plRawAsset: res.assets[0], plFile: undefined });
      setAnalyzed(false);
    } catch { Alert.alert("Error", "Could not open file picker."); }
  };

  // Step 2: parse the selected file
  const parseBS = async (i: number) => {
    const raw = slots[i].bsRawAsset;
    if (!raw) return;
    setSlot(i, { bsParsing: true });
    try {
      const parsed = await parseFinancialDocument(raw.uri, raw.name, raw.mimeType ?? undefined, "balance_sheet");
      const f = parsed.fields as any;
      // normalizeFields already applied — keys match YearData / WorkingCapitalData
      setSlot(i, {
        bsParsing: false, bsFile: raw.name, bsFormat: FORMAT_LABEL[parsed.format],
        data: {
          ...slots[i].data,
          ...(f.currentAssets      != null && { currentAssets:      f.currentAssets }),
          ...(f.currentLiabilities != null && { currentLiabilities: f.currentLiabilities }),
          ...(f.inventory          != null && { inventory:          f.inventory }),
          ...(f.debtors            != null && { debtors:            f.debtors }),
          ...(f.creditors          != null && { creditors:          f.creditors }),
          ...(f.cash               != null && { cash:               f.cash }),
          ...(f.totalAssets        != null && { totalAssets:        f.totalAssets }),
          ...(f.netWorth           != null && { netWorth:           f.netWorth }),
          ...(f.bankOD             != null && { bankOD:             f.bankOD }),
          ...(f.longTermLoans      != null && { longTermLoans:      f.longTermLoans }),
        },
      });
      setAnalyzed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setSlot(i, { bsParsing: false });
      Alert.alert("Parse Failed", e?.message ?? "Could not read Balance Sheet.");
    }
  };

  const parsePL = async (i: number) => {
    const raw = slots[i].plRawAsset;
    if (!raw) return;
    setSlot(i, { plParsing: true });
    try {
      const parsed = await parseFinancialDocument(raw.uri, raw.name, raw.mimeType ?? undefined, "profit_loss");
      const f = parsed.fields as any;
      // normalizeFields already applied — keys match YearData
      setSlot(i, {
        plParsing: false, plFile: raw.name, plFormat: FORMAT_LABEL[parsed.format],
        data: {
          ...slots[i].data,
          ...(f.sales             != null && { sales:             f.sales }),
          ...(f.cogs              != null && { cogs:              f.cogs }),
          ...(f.purchases         != null && { purchases:         f.purchases }),
          ...(f.grossProfit       != null && { grossProfit:       f.grossProfit }),
          ...(f.netProfit         != null && { netProfit:         f.netProfit }),
          ...(f.expenses          != null && { expenses:          f.expenses }),
          ...(f.EBITDA            != null && { ebitda:            f.EBITDA }),
          ...(f.depreciation      != null && { depreciation:      f.depreciation }),
          ...(f.interestExpenses  != null && { interestExpenses:  f.interestExpenses }),
          ...(f.tax               != null && { tax:               f.tax }),
          ...(f.otherIncome       != null && { otherIncome:       f.otherIncome }),
        },
      });
      setAnalyzed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setSlot(i, { plParsing: false });
      Alert.alert("Parse Failed", e?.message ?? "Could not read P&L Statement.");
    }
  };

  const handleAnalyze = () => {
    try {
      const hasData = slots.some((s) => s.data.sales !== undefined || s.data.currentAssets !== undefined);
      if (!hasData) {
        Alert.alert("No Data", "Upload at least one year's documents first.");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setAnalyzed(true);
    } catch (e: any) {
      Alert.alert("Analysis Failed", e?.message ?? "Could not generate trend analysis.");
    }
  };

  // ── Chart data ────────────────────────────────────────────────────────────
  const labels  = slots.map((s) => s.data.label.replace("FY ", ""));
  const salesV  = slots.map((s) => s.data.sales          ?? null);
  const npV     = slots.map((s) => s.data.netProfit       ?? null);
  const wcV     = slots.map((s) => {
    const w = wcAmount(s.data);
    return w !== undefined ? w : null;
  });
  const crV     = slots.map((s) => {
    const r = currentRatio(s.data);
    return r !== undefined ? r : null;
  });

  const salesTrend = trend(salesV);
  const npTrend    = trend(npV);

  const handleSave = async () => {
    if (!clientName.trim()) { Alert.alert("Client Name Required", "Enter a client name to save."); return; }
    if (!analyzed) { Alert.alert("Analyze First", "Run the analysis before saving."); return; }
    setSaving(true);
    try {
      const filledSlots = slots.filter(s => (s.data.sales ?? 0) > 0);
      const cagr = (base?: number, end?: number) => {
        if (!base || !end || filledSlots.length < 2) return null;
        const yrs = filledSlots.length - 1;
        return ((end / base) ** (1 / yrs) - 1) * 100;
      };
      const sc = filledSlots.length >= 2 ? cagr(filledSlots[0].data.sales, filledSlots[filledSlots.length - 1].data.sales) : null;
      const nc = filledSlots.length >= 2 ? cagr(filledSlots[0].data.netProfit, filledSlots[filledSlots.length - 1].data.netProfit) : null;
      await createCase.mutateAsync({
        clientName: clientName.trim(), caseType: "multi_year",
        multiYearData: slots.map(s => ({ label: s.data.label, data: s.data })) as any,
        multiYearResults: { salesCagr: sc, npCagr: nc, filled: filledSlots.length, years: slots.map(s => s.data) } as any,
      } as any);
      setSaveModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Multi-year case saved successfully.");
    } catch { Alert.alert("Save Failed", "Could not save the case."); }
    finally { setSaving(false); }
  };

  return (
    <>
    <PageBackground>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Multi-Year Analysis"
          subtitle="Upload Balance Sheet + P&L for up to 3 years, then compare trends"
          accentColor={GREEN}
        />

        {/* ── How to use hint ─────────────────────────────────────── */}
        <LinearGradient colors={[GREEN + "14", GREEN + "06"]} style={styles.howToCard}>
          <Feather name="info" size={14} color={GREEN} />
          <Text style={styles.howToText}>
            Expand each year below → Upload documents → Tap{" "}
            <Text style={{ color: GREEN, fontFamily: "Inter_600SemiBold" }}>Generate Trend Analysis</Text>
          </Text>
        </LinearGradient>

        {/* ── Year slots ──────────────────────────────────────────── */}
        {slots.map((slot, i) => (
          <LinearGradient key={i} colors={["#1A2C42", "#152236"]} style={styles.yearCard}>
            {/* Year header / toggle */}
            <TouchableOpacity
              style={styles.yearHeader}
              onPress={() => setExpanded((prev) => prev.map((v, j) => j === i ? !v : v))}
              activeOpacity={0.8}
            >
              <View style={[styles.yearBadge, { backgroundColor: [GREEN, TEAL, AMBER][i] + "22" }]}>
                <Text style={[styles.yearNum, { color: [GREEN, TEAL, AMBER][i] }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.yearLabel}>{slot.data.label}</Text>
                <Text style={styles.yearStatus}>
                  {slot.bsFile && slot.plFile
                    ? "BS + P&L uploaded"
                    : slot.bsFile
                    ? "Balance Sheet uploaded"
                    : slot.plFile
                    ? "P&L uploaded"
                    : "No documents yet"}
                </Text>
              </View>
              <Feather
                name={expanded[i] ? "chevron-up" : "chevron-down"}
                size={18} color="#4A6A84"
              />
            </TouchableOpacity>

            {/* Upload zones (collapsible) */}
            {expanded[i] && (
              <View style={styles.yearBody}>
                {/* Balance Sheet */}
                <Text style={styles.docTypeLabel}>
                  <Feather name="layers" size={11} color={GREEN} /> {"  "}Balance Sheet
                </Text>
                <UploadZone
                  onPress={() => selectBS(i)}
                  loading={slot.bsParsing}
                  uploaded={!!slot.bsFile}
                  fileSelected={!!slot.bsRawAsset && !slot.bsFile}
                  fileName={slot.bsRawAsset?.name ?? slot.bsFile}
                  label="Select Balance Sheet (PDF / Excel / Image)"
                  accentColor={GREEN}
                  onParse={() => parseBS(i)}
                  onClear={() => {
                    setSlot(i, {
                      bsRawAsset: undefined, bsFile: undefined, bsFormat: undefined,
                      data: { ...slot.data, currentAssets: undefined, currentLiabilities: undefined, inventory: undefined, debtors: undefined, creditors: undefined, cash: undefined },
                    });
                    setAnalyzed(false);
                  }}
                />
                {slot.bsFile && (
                  <View style={styles.miniGrid}>
                    {slot.data.currentAssets      !== undefined && <MiniField label="Curr. Assets"  value={compactINR(slot.data.currentAssets)} />}
                    {slot.data.currentLiabilities !== undefined && <MiniField label="Curr. Liab."   value={compactINR(slot.data.currentLiabilities)} />}
                    {slot.data.inventory          !== undefined && <MiniField label="Inventory"     value={compactINR(slot.data.inventory)} />}
                    {slot.data.cash               !== undefined && <MiniField label="Cash & Bank"   value={compactINR(slot.data.cash)} />}
                  </View>
                )}

                {/* P&L */}
                <Text style={[styles.docTypeLabel, { marginTop: 14 }]}>
                  <Feather name="trending-up" size={11} color={TEAL} /> {"  "}Profit & Loss
                </Text>
                <UploadZone
                  onPress={() => selectPL(i)}
                  loading={slot.plParsing}
                  uploaded={!!slot.plFile}
                  fileSelected={!!slot.plRawAsset && !slot.plFile}
                  fileName={slot.plRawAsset?.name ?? slot.plFile}
                  label="Select P&L Statement (PDF / Excel / Image)"
                  accentColor={TEAL}
                  onParse={() => parsePL(i)}
                  onClear={() => {
                    setSlot(i, {
                      plRawAsset: undefined, plFile: undefined, plFormat: undefined,
                      data: { ...slot.data, sales: undefined, grossProfit: undefined, netProfit: undefined, expenses: undefined },
                    });
                    setAnalyzed(false);
                  }}
                />
                {slot.plFile && (
                  <View style={styles.miniGrid}>
                    {slot.data.sales      !== undefined && <MiniField label="Revenue"    value={compactINR(slot.data.sales)} />}
                    {slot.data.grossProfit !== undefined && <MiniField label="Gross Profit" value={compactINR(slot.data.grossProfit)} />}
                    {slot.data.netProfit  !== undefined && <MiniField label="Net Profit" value={compactINR(slot.data.netProfit)} />}
                  </View>
                )}
              </View>
            )}
          </LinearGradient>
        ))}

        {/* ── Analyze button ─────────────────────────────────────── */}
        <GradientButton
          onPress={handleAnalyze}
          label="Generate Trend Analysis"
          icon="bar-chart-2"
          colors={[GREEN, "#059669"]}
        />

        {/* ── RESULTS ───────────────────────────────────────────── */}
        {analyzed && (
          <ResultsErrorBoundary>
          <>
            {/* Year-over-year metrics table */}
            <GlassCard accentColor={GREEN}>
              <CardTitle>Year-over-Year Summary</CardTitle>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, styles.tableLabelCol]}>Metric</Text>
                {slots.map((s, i) => (
                  <Text key={i} style={[styles.tableCell, styles.tableValCol]}>
                    {s.data.label.replace("FY ", "")}
                  </Text>
                ))}
              </View>
              <TableRow label="Revenue"       vals={slots.map((s) => s.data.sales)}          format={compactINR} />
              <TableRow label="Net Profit"    vals={slots.map((s) => s.data.netProfit)}       format={compactINR} />
              <TableRow label="Gross Margin"  vals={slots.map((s) => gpMargin(s.data))}      format={(n) => pct(n)} />
              <TableRow label="Net Margin"    vals={slots.map((s) => npMargin(s.data))}      format={(n) => pct(n)} />
              <TableRow label="Working Cap."  vals={slots.map((s) => wcAmount(s.data))}      format={compactINR} />
              <TableRow label="Current Ratio" vals={slots.map((s) => currentRatio(s.data))} format={(n) => n.toFixed(2)} />
              <TableRow label="Cash & Bank"   vals={slots.map((s) => s.data.cash)}           format={compactINR} />
            </GlassCard>

            {/* Sales Trend */}
            {salesV.some((v) => v !== null) && (
              <GlassCard accentColor={TEAL}>
                <View style={styles.chartTopRow}>
                  <CardTitle>Revenue Trend</CardTitle>
                  {salesTrend && (
                    <View style={[styles.trendBadge, { backgroundColor: salesTrend.up ? "#10B98122" : "#EF444422" }]}>
                      <Feather name={salesTrend.up ? "trending-up" : "trending-down"} size={12} color={salesTrend.up ? GREEN : C.danger} />
                      <Text style={[styles.trendText, { color: salesTrend.up ? GREEN : C.danger }]}>
                        {salesTrend.up ? "+" : ""}{salesTrend.pct}%
                      </Text>
                    </View>
                  )}
                </View>
                <LineChart
                  datasets={[
                    { label: "Revenue",    color: TEAL,  values: salesV },
                    { label: "Net Profit", color: GREEN, values: npV },
                  ]}
                  labels={labels}
                  width={chartW}
                  height={200}
                />
                <ChartLegend items={[{ label: "Revenue", color: TEAL }, { label: "Net Profit", color: GREEN }]} />
              </GlassCard>
            )}

            {/* Working Capital Trend */}
            {wcV.some((v) => v !== null) && (
              <GlassCard accentColor={GREEN}>
                <CardTitle>Working Capital Trend</CardTitle>
                <BarChart
                  datasets={[{ label: "Working Capital", color: GREEN, values: wcV.map((v) => Math.max(0, v ?? 0)) }]}
                  labels={labels}
                  width={chartW}
                  height={180}
                />
              </GlassCard>
            )}

            {/* Current Ratio Trend */}
            {crV.some((v) => v !== null) && (
              <GlassCard accentColor={AMBER}>
                <CardTitle>Current Ratio Trend</CardTitle>
                <LineChart
                  datasets={[{ label: "Current Ratio", color: AMBER, values: crV }]}
                  labels={labels}
                  width={chartW}
                  height={180}
                  formatY={(n) => n.toFixed(2)}
                />
                <Text style={styles.ratioHint}>
                  A current ratio ≥ 1.33 is generally considered bankable. The dotted line at 1.33 is the standard benchmark.
                </Text>
              </GlassCard>
            )}

            {/* Eligibility trend summary */}
            <LinearGradient colors={[GREEN + "18", GREEN + "08"]} style={styles.summaryCard}>
              <Text style={[styles.summaryTitle, { color: GREEN }]}>Eligibility Trend</Text>
              {slots.map((s, i) => {
                const cr = currentRatio(s.data);
                const wc = wcAmount(s.data);
                const eligible = wc !== undefined ? Math.max(0, wc * 0.75) : undefined;
                return (
                  <View key={i} style={styles.summaryRow}>
                    <Text style={styles.summaryYear}>{s.data.label}</Text>
                    <View style={{ flex: 1 }} />
                    {cr !== undefined && (
                      <Text style={[styles.summaryVal, { color: cr >= 1.33 ? GREEN : AMBER }]}>
                        CR {cr.toFixed(2)} {cr >= 1.33 ? "✓" : "⚠"}
                      </Text>
                    )}
                    {eligible !== undefined && (
                      <Text style={[styles.summaryVal, { color: TEAL, marginLeft: 12 }]}>
                        {compactINR(eligible)} eligible
                      </Text>
                    )}
                  </View>
                );
              })}
            </LinearGradient>

            {/* ── Revenue vs Profit pie / bar ─────────────────── */}
            {slots.length >= 2 && (() => {
              const salesVals = slots.map(s => s.data.sales ?? 0);
              const profitVals = slots.map(s => s.data.netProfit ?? 0);
              const cogsVals = slots.map(s => s.data.cogs ?? 0);
              if (salesVals.every(v => v === 0)) return null;
              return (
                <View style={myStyles.chartBox}>
                  <Text style={myStyles.chartBoxTitle}>Revenue vs Profit vs COGS</Text>
                  <BarChart
                    datasets={[
                      { label: "Sales", color: "#4A9EFF", values: salesVals },
                      { label: "COGS",  color: "#EF4444", values: cogsVals },
                      { label: "Profit", color: "#10B981", values: profitVals },
                    ]}
                    labels={slots.map(s => s.data.label.replace("FY ", ""))}
                    width={300}
                    height={160}
                    grouped
                  />
                </View>
              );
            })()}

            {/* ── Multi-Year Final Summary ─────────────────────── */}
            <MultiYearFinalSummary slots={slots} />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: GREEN + "55" }}
                onPress={() => setSaveModal(true)}>
                <Feather name="save" size={16} color={GREEN} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: GREEN }}>Save Case</Text>
              </TouchableOpacity>
            </View>
          </>
          </ResultsErrorBoundary>
        )}

        <TabNavBar current="multiyear" />
      </ScrollView>
    </PageBackground>

    <Modal visible={saveModal} transparent animationType="slide" onRequestClose={() => setSaveModal(false)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}>
        <LinearGradient colors={["#1A2C42", "#111F30"]} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 }}>
          <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#E8F0F8", textAlign: "center" }}>Save Multi-Year Case</Text>
          <TextInput
            style={{ backgroundColor: "#0D1B2A", borderRadius: 14, padding: 14, fontSize: 14, fontFamily: "Inter_500Medium", color: "#E8F0F8", borderWidth: 1, borderColor: "#1E3A54" }}
            placeholder="Client / Company Name" placeholderTextColor="#3D5A74"
            value={clientName} onChangeText={setClientName} autoFocus
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", alignItems: "center" }} onPress={() => setSaveModal(false)}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#7A9BB5" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center", backgroundColor: GREEN }} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#000" />
                : <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#000" }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
    </>
  );
}

// ─── Multi-Year Final Summary ─────────────────────────────────────────────────
function MultiYearFinalSummary({ slots }: { slots: { data: YearData }[] }) {
  if (slots.length < 2) return null;

  const filled = slots.filter(s => (s.data.sales ?? 0) > 0);
  if (filled.length < 2) return null;

  const first = filled[0].data;
  const last  = filled[filled.length - 1].data;
  const years = filled.length - 1;

  const cagr = (base: number | undefined, end: number | undefined) => {
    if (!base || !end || base <= 0) return null;
    return ((end / base) ** (1 / years) - 1) * 100;
  };

  const salesCagr  = cagr(first.sales, last.sales);
  const profitCagr = cagr(first.netProfit, last.netProfit);

  const trend = (salesCagr ?? 0) >= 10 ? "STRONG GROWTH"
    : (salesCagr ?? 0) >= 5  ? "MODERATE GROWTH"
    : (salesCagr ?? 0) >= 0  ? "STABLE"
    : "DECLINING";

  const trendColor = (salesCagr ?? 0) >= 10 ? GREEN
    : (salesCagr ?? 0) >= 5 ? TEAL
    : (salesCagr ?? 0) >= 0 ? AMBER
    : "#EF4444";

  const lastCR = currentRatio(last);
  const latestEligible = (() => {
    const wc = wcAmount(last);
    return wc !== undefined && wc > 0 ? Math.max(0, wc * 0.75) : 0;
  })();

  const recommendation = (salesCagr ?? 0) >= 10 && (lastCR ?? 0) >= 1.33
    ? `The business demonstrates consistent strong growth with ${salesCagr?.toFixed(1)}% sales CAGR over ${years} year(s). Liquidity ratios are satisfactory (CR ${(lastCR ?? 0).toFixed(2)}x). The trend supports credit enhancement or fresh lending with confidence.`
    : (salesCagr ?? 0) >= 0
    ? `The business shows stable-to-moderate performance with ${salesCagr?.toFixed(1)}% sales CAGR. Current Ratio of ${(lastCR ?? 0).toFixed(2)}x ${(lastCR ?? 0) >= 1.33 ? "meets" : "is below"} the 1.33x benchmark. Standard credit terms are appropriate with periodic reviews.`
    : `Revenue trend is declining (${salesCagr?.toFixed(1)}% CAGR). This requires closer scrutiny before sanctioning credit. Consider requesting projections and a business turnaround plan.`;

  const metrics = [
    salesCagr  !== null ? { label: "Revenue CAGR", value: salesCagr.toFixed(1) + "%",  color: salesCagr >= 0 ? GREEN : "#EF4444" } : null,
    profitCagr !== null ? { label: "Profit CAGR",  value: profitCagr.toFixed(1) + "%", color: profitCagr >= 0 ? GREEN : "#EF4444" } : null,
    { label: "Latest CR",   value: (lastCR ?? 0).toFixed(2) + "x", color: (lastCR ?? 0) >= 1.33 ? GREEN : AMBER },
    latestEligible > 0 ? { label: "WC Eligibility", value: compactINR(latestEligible), color: TEAL } : null,
  ].filter(Boolean) as { label: string; value: string; color: string }[];

  return (
    <View style={myStyles.sumWrap}>
      <View style={[myStyles.sumHeader, { backgroundColor: trendColor + "18", borderColor: trendColor + "55" }]}>
        <Feather name="trending-up" size={20} color={trendColor} />
        <View style={{ flex: 1 }}>
          <Text style={[myStyles.sumVerdict, { color: trendColor }]}>{trend}</Text>
          <Text style={myStyles.sumSub}>{years}-Year Multi-Period Analysis</Text>
        </View>
      </View>

      <View style={myStyles.sumMetrics}>
        {metrics.map((m, i) => (
          <View key={i} style={myStyles.metricItem}>
            <Text style={[myStyles.metricVal, { color: m.color }]}>{m.value}</Text>
            <Text style={myStyles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <View style={myStyles.recBox}>
        <View style={myStyles.recHeader}>
          <Feather name="file-text" size={13} color={C.primary} />
          <Text style={myStyles.recTitle}>Multi-Year Recommendation</Text>
        </View>
        <Text style={myStyles.recText}>{recommendation}</Text>
      </View>
    </View>
  );
}

const myStyles = StyleSheet.create({
  chartBox: { alignItems: "center", gap: 8, backgroundColor: "#0C1826", borderRadius: 14, borderWidth: 1, borderColor: "#1E3A54", padding: 14 },
  chartBoxTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#7A9BB5", textTransform: "uppercase", letterSpacing: 0.8, alignSelf: "flex-start" },
  sumWrap: { gap: 10, marginTop: 4 },
  sumHeader: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  sumVerdict: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sumSub: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 2 },
  sumMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricItem: { flex: 1, minWidth: "40%", backgroundColor: "#0C1826", borderRadius: 12, borderWidth: 1, borderColor: "#1E3A54", padding: 12, alignItems: "center", gap: 4 },
  metricVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  recBox: { backgroundColor: "#0A1628", borderRadius: 12, borderWidth: 1, borderColor: C.primary + "30", padding: 12, gap: 8 },
  recHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  recTitle: { fontSize: 10, fontFamily: "Inter_700Bold", color: C.primary, textTransform: "uppercase", letterSpacing: 0.8 },
  recText: { fontSize: 12, color: "#8BAFC9", fontFamily: "Inter_400Regular", lineHeight: 18 },
});

// ─── Sub-components ───────────────────────────────────────────────────────────
function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniField}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function TableRow({ label, vals, format }: { label: string; vals: (number | undefined)[]; format: (n: number) => string }) {
  const filled = vals.filter((v) => v !== undefined);
  if (!filled.length) return null;

  // Detect growth direction
  const numbers = vals.map((v) => v ?? null).filter((v): v is number => v !== null);
  const growing = numbers.length >= 2 && numbers[numbers.length - 1] > numbers[0];

  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.tableLabelCol, styles.rowLabel]}>{label}</Text>
      {vals.map((v, i) => (
        <Text
          key={i}
          style={[
            styles.tableCell, styles.tableValCol, styles.rowVal,
            i === vals.length - 1 && numbers.length >= 2
              ? { color: growing ? "#10B981" : "#F87171" }
              : { color: "#C8DDF0" },
          ]}
        >
          {v !== undefined ? format(v) : "—"}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 16 },

  howToCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#10B98133" },
  howToText: { flex: 1, fontSize: 12, color: "#7A9BB5", fontFamily: "Inter_400Regular", lineHeight: 18 },

  yearCard: { borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54", overflow: "hidden" },
  yearHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  yearBadge: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  yearNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  yearLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#E8F4FF" },
  yearStatus: { fontSize: 11, color: "#4A6A84", fontFamily: "Inter_400Regular", marginTop: 2 },
  yearBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },

  docTypeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#7A9BB5", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 },

  miniGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  miniField: { backgroundColor: "#0C1826", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, gap: 2 },
  miniLabel: { fontSize: 9, color: "#4A6A84", fontFamily: "Inter_400Regular" },
  miniValue: { fontSize: 12, color: "#C8DDF0", fontFamily: "Inter_600SemiBold" },

  chartTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  trendText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1E3A54", paddingBottom: 8, marginBottom: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#0F1E30" },
  tableCell: { fontFamily: "Inter_400Regular" },
  tableLabelCol: { flex: 1.2, fontSize: 11, color: "#7A9BB5" },
  tableValCol: { flex: 1, textAlign: "right", fontSize: 11 },
  rowLabel: { fontFamily: "Inter_500Medium" },
  rowVal: { fontFamily: "Inter_600SemiBold" },

  ratioHint: { fontSize: 10, color: "#4A6A84", fontFamily: "Inter_400Regular", marginTop: 10, lineHeight: 15 },

  summaryCard: { borderRadius: 18, borderWidth: 1, borderColor: "#10B98133", padding: 16, gap: 8 },
  summaryTitle: { fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  summaryRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#10B98115" },
  summaryYear: { fontSize: 12, color: "#C8DDF0", fontFamily: "Inter_500Medium" },
  summaryVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorFallback error={error} resetError={retry} />;
}
