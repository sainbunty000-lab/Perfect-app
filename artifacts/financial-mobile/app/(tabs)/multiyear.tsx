import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { parseFinancialDocument, FORMAT_LABEL } from "@/lib/parseViaApi";
import { LineChart, BarChart, ChartLegend, compactINR } from "@/lib/charts";
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
  grossProfit?: number;
  netProfit?:  number;
  expenses?:   number;
  ebitda?:     number;
}

interface YearSlot {
  data: YearData;
  bsFile?: string; bsFormat?: string; bsParsing?: boolean;
  plFile?: string; plFormat?: string; plParsing?: boolean;
}

const DEFAULT_LABELS = ["FY 2022-23", "FY 2023-24", "FY 2024-25"];

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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MultiYearScreen() {
  const insets    = useSafeAreaInsets();
  const tabHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const chartW    = width - 32 - 36;

  const [slots, setSlots] = useState<YearSlot[]>(DEFAULT_LABELS.map(emptySlot));
  const [expanded, setExpanded] = useState<boolean[]>([true, false, false]);
  const [analyzed, setAnalyzed] = useState(false);

  // ── Parse helpers ─────────────────────────────────────────────────────────
  const setSlot = (i: number, patch: Partial<YearSlot>) =>
    setSlots((prev) => prev.map((s, j) => j === i ? { ...s, ...patch } : s));

  const pickBS = async (i: number) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      const asset = res.assets[0];
      setSlot(i, { bsParsing: true });
      const parsed = await parseFinancialDocument(asset.uri, asset.name, asset.mimeType ?? undefined, "balance_sheet");
      const f = parsed.fields as any;
      setSlot(i, {
        bsParsing: false,
        bsFile:    asset.name,
        bsFormat:  FORMAT_LABEL[parsed.format],
        data: {
          ...slots[i].data,
          ...(f.currentAssets      !== undefined && { currentAssets:      f.currentAssets }),
          ...(f.currentLiabilities !== undefined && { currentLiabilities: f.currentLiabilities }),
          ...(f.inventory          !== undefined && { inventory:          f.inventory }),
          ...(f.debtors            !== undefined && { debtors:            f.debtors }),
          ...(f.creditors          !== undefined && { creditors:          f.creditors }),
          ...(f.cash               !== undefined && { cash:               f.cash }),
          ...(f.totalAssets        !== undefined && { totalAssets:        f.totalAssets }),
          ...(f.netWorth           !== undefined && { netWorth:           f.netWorth }),
        },
      });
      setAnalyzed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setSlot(i, { bsParsing: false });
      Alert.alert("Parse Failed", e?.message ?? "Could not read Balance Sheet.");
    }
  };

  const pickPL = async (i: number) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      const asset = res.assets[0];
      setSlot(i, { plParsing: true });
      const parsed = await parseFinancialDocument(asset.uri, asset.name, asset.mimeType ?? undefined, "profit_loss");
      const f = parsed.fields as any;
      setSlot(i, {
        plParsing: false,
        plFile:    asset.name,
        plFormat:  FORMAT_LABEL[parsed.format],
        data: {
          ...slots[i].data,
          ...(f.sales       !== undefined && { sales:       f.sales }),
          ...(f.grossProfit !== undefined && { grossProfit: f.grossProfit }),
          ...(f.netProfit   !== undefined && { netProfit:   f.netProfit }),
          ...(f.expenses    !== undefined && { expenses:    f.expenses }),
          ...(f.ebitda      !== undefined && { ebitda:      f.ebitda }),
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
    const hasData = slots.some((s) => s.data.sales !== undefined || s.data.currentAssets !== undefined);
    if (!hasData) {
      Alert.alert("No Data", "Upload at least one year's documents first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAnalyzed(true);
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

  return (
    <PageBackground>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: tabHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Multi-Year Analysis"
          subtitle="Upload up to 3 years of financials and compare trends"
          accentColor={GREEN}
        />

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
                  onPress={() => pickBS(i)}
                  loading={slot.bsParsing}
                  uploaded={!!slot.bsFile}
                  fileName={slot.bsFile}
                  label="Upload Balance Sheet (PDF / Excel / Image)"
                  accentColor={GREEN}
                  onClear={() => {
                    setSlot(i, {
                      bsFile: undefined, bsFormat: undefined,
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
                  onPress={() => pickPL(i)}
                  loading={slot.plParsing}
                  uploaded={!!slot.plFile}
                  fileName={slot.plFile}
                  label="Upload P&L Statement (PDF / Excel / Image)"
                  accentColor={TEAL}
                  onClear={() => {
                    setSlot(i, {
                      plFile: undefined, plFormat: undefined,
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
          </>
        )}

        <TabNavBar current="multiyear" />
      </ScrollView>
    </PageBackground>
  );
}

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
  scroll: { paddingHorizontal: 16, gap: 14 },

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
