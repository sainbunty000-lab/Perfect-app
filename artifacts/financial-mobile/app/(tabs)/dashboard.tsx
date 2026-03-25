/**
 * Dashboard — Analytics & KPI Overview
 * Shows live stats from saved cases: KPIs, sparkline trends,
 * case type breakdown, performance summary, and recent activity.
 */
import React, { useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useListCases } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { PageBackground, TabNavBar } from "@/components/UI";
import { MiniSparkline, compactINR } from "@/lib/charts";

const C = Colors.light;

function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function formatDate(ts: string | number | null | undefined) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "2-digit",
    });
  } catch { return "—"; }
}

const TYPE_COLOR: Record<string, string> = {
  working_capital: "#4A9EFF",
  banking:         "#D4A800",
  gst_itr:         "#A855F7",
  multi_year:      "#10B981",
};
const TYPE_LABEL: Record<string, string> = {
  working_capital: "WC",
  banking:         "Bank",
  gst_itr:         "GST",
  multi_year:      "MYr",
};
const TYPE_ICON: Record<string, string> = {
  working_capital: "bar-chart-2",
  banking:         "credit-card",
  gst_itr:         "file-text",
  multi_year:      "trending-up",
};

export default function DashboardScreen() {
  const insets    = useSafeAreaInsets();
  const tabHeight = useBottomTabBarHeight();
  const router    = useRouter();
  const { width } = useWindowDimensions();
  const chartW    = width - 32 - 32;   // 16px side pads + 16px card pads

  const { data: cases, isLoading, refetch } = useListCases();
  const caseList = useMemo(() => cases ?? [], [cases]);

  // ── Derived analytics ─────────────────────────────────────────────────────
  const total = caseList.length;

  const byType = useMemo(() =>
    caseList.reduce<Record<string, number>>((acc, c) => {
      const t = (c as any).caseType ?? "other";
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {}),
  [caseList]);

  // WC: last 8 eligibility amounts
  const wcCases   = useMemo(() =>
    caseList.filter((c) => (c as any).caseType === "working_capital").slice(-8),
  [caseList]);
  const wcSpark   = wcCases.map((c) => safeNum((c as any).workingCapitalResults?.eligibilityAmount));
  const wcLatest  = wcSpark[wcSpark.length - 1] ?? 0;
  const wcPrev    = wcSpark[wcSpark.length - 2] ?? 0;
  const wcDelta   = wcPrev ? ((wcLatest - wcPrev) / Math.abs(wcPrev)) * 100 : 0;

  // Banking: last 8 overall scores
  const bankCases = useMemo(() =>
    caseList.filter((c) => (c as any).caseType === "banking").slice(-8),
  [caseList]);
  const bankSpark = bankCases.map((c) => safeNum((c as any).bankingResults?.overallScore));
  const bankLatest = bankSpark[bankSpark.length - 1] ?? 0;
  const bankAvg    = bankSpark.length ? bankSpark.reduce((a, b) => a + b, 0) / bankSpark.length : 0;

  // Multi-year: last 6 net profit values (most recent year)
  const myCases  = useMemo(() =>
    caseList.filter((c) => (c as any).caseType === "multi_year").slice(-6),
  [caseList]);
  const mySpark  = myCases.map((c) => {
    const y = (c as any).multiYearResults;
    if (!y) return 0;
    const vals = [y.year1NetProfit, y.year2NetProfit, y.year3NetProfit].filter(Boolean);
    return safeNum(vals[vals.length - 1]);
  });

  // WC max eligibility ever
  const maxWC = wcSpark.length ? Math.max(...wcSpark) : 0;

  // Recent 5
  const recent = useMemo(() =>
    [...caseList].sort((a, b) =>
      new Date((b as any).createdAt ?? 0).getTime() -
      new Date((a as any).createdAt ?? 0).getTime()
    ).slice(0, 5),
  [caseList]);

  const goTo = (name: string) => {
    if (name === "index") router.push("/(tabs)/");
    else router.push(`/(tabs)/${name}` as any);
  };

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <PageBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: tabHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <LinearGradient
          colors={["#0B2540", "#0A1628"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerGlow} />
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
              <Text style={styles.headerTitle}>Analytics Dashboard</Text>
              <Text style={styles.headerDate}>{today}</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => refetch()}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={16} color={C.primary} />
            </TouchableOpacity>
          </View>

          {/* Quick status pills */}
          <View style={styles.headerPills}>
            <Pill icon="database" label={`${total} Total Cases`}    color={C.primary} />
            <Pill icon="zap"      label="Live Data"                  color="#F5C842" />
            <Pill icon="check"    label={isLoading ? "Syncing…" : "Up to date"} color="#10B981" />
          </View>
        </LinearGradient>

        {/* ── KPI Cards ───────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Case Overview</Text>
        <View style={styles.kpiGrid}>
          <KpiCard
            label="Total Cases"  value={String(total)}
            icon="folder"        color="#20B2AA"   wide
          />
          <KpiCard
            label="WC Analysis"  value={String(byType["working_capital"] ?? 0)}
            icon="bar-chart-2"   color="#4A9EFF"
          />
          <KpiCard
            label="Banking"      value={String(byType["banking"] ?? 0)}
            icon="credit-card"   color="#D4A800"
          />
          <KpiCard
            label="Multi-Year"   value={String(byType["multi_year"] ?? 0)}
            icon="trending-up"   color="#10B981"
          />
          <KpiCard
            label="GST & ITR"    value={String(byType["gst_itr"] ?? 0)}
            icon="file-text"     color="#A855F7"
          />
        </View>

        {/* ── WC Eligibility Trend ─────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Working Capital Trend</Text>
        {wcSpark.length >= 2 ? (
          <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.chartCard}>
            <View style={styles.chartTop}>
              <View>
                <Text style={styles.chartTitle}>WC Eligibility Amount</Text>
                <Text style={styles.chartSub}>
                  Last {wcSpark.length} WC cases · Peak: {compactINR(maxWC)}
                </Text>
              </View>
              <View style={styles.chartRight}>
                <Text style={[styles.chartLatest, { color: "#4A9EFF" }]}>
                  {compactINR(wcLatest)}
                </Text>
                {wcDelta !== 0 && (
                  <View style={styles.deltaRow}>
                    <Feather
                      name={wcDelta >= 0 ? "trending-up" : "trending-down"}
                      size={11}
                      color={wcDelta >= 0 ? "#10B981" : "#EF4444"}
                    />
                    <Text style={[styles.deltaText, { color: wcDelta >= 0 ? "#10B981" : "#EF4444" }]}>
                      {wcDelta >= 0 ? "+" : ""}{wcDelta.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <MiniSparkline values={wcSpark} color="#4A9EFF" width={chartW} height={64} />
            <View style={styles.chartFooter}>
              {wcSpark.map((v, i) => (
                <View key={i} style={styles.chartDot}>
                  <View style={[styles.dotMark, { backgroundColor: "#4A9EFF" + (i === wcSpark.length - 1 ? "FF" : "50") }]} />
                </View>
              ))}
            </View>
          </LinearGradient>
        ) : (
          <EmptyChart
            icon="bar-chart-2" color="#4A9EFF"
            label="No WC data yet" sub="Run a Working Capital analysis to see trends"
            onPress={() => goTo("index")}
          />
        )}

        {/* ── Banking Score Trend ──────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Banking Performance Trend</Text>
        {bankSpark.length >= 2 ? (
          <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.chartCard}>
            <View style={styles.chartTop}>
              <View>
                <Text style={styles.chartTitle}>Banking Score (0 – 100)</Text>
                <Text style={styles.chartSub}>
                  Last {bankSpark.length} banking cases · Avg: {bankAvg.toFixed(1)}
                </Text>
              </View>
              <View style={styles.chartRight}>
                <Text style={[styles.chartLatest, { color: "#D4A800" }]}>
                  {bankLatest.toFixed(0)}<Text style={styles.chartUnit}>/100</Text>
                </Text>
                <ScoreBar score={bankLatest} color="#D4A800" />
              </View>
            </View>
            <MiniSparkline values={bankSpark} color="#D4A800" width={chartW} height={64} />
          </LinearGradient>
        ) : (
          <EmptyChart
            icon="credit-card" color="#D4A800"
            label="No banking data yet" sub="Run a Banking Performance analysis to see scores"
            onPress={() => goTo("banking")}
          />
        )}

        {/* ── Multi-Year Profit Trend ──────────────────────────────── */}
        {mySpark.length >= 2 && (
          <>
            <Text style={styles.sectionLabel}>Multi-Year Net Profit Trend</Text>
            <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.chartCard}>
              <View style={styles.chartTop}>
                <View>
                  <Text style={styles.chartTitle}>Net Profit (Most Recent Year)</Text>
                  <Text style={styles.chartSub}>Last {mySpark.length} multi-year analyses</Text>
                </View>
                <Text style={[styles.chartLatest, { color: "#10B981" }]}>
                  {compactINR(mySpark[mySpark.length - 1])}
                </Text>
              </View>
              <MiniSparkline values={mySpark} color="#10B981" width={chartW} height={64} />
            </LinearGradient>
          </>
        )}

        {/* ── Case Type Breakdown ──────────────────────────────────── */}
        {total > 0 && (
          <>
            <Text style={styles.sectionLabel}>Case Distribution</Text>
            <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.breakdownCard}>
              {["working_capital", "banking", "multi_year", "gst_itr"].map((type) => {
                const count = byType[type] ?? 0;
                const pct   = total ? (count / total) * 100 : 0;
                const color = TYPE_COLOR[type];
                return (
                  <View key={type} style={styles.breakRow}>
                    <View style={[styles.breakIcon, { backgroundColor: color + "22" }]}>
                      <Feather name={TYPE_ICON[type] as any} size={13} color={color} />
                    </View>
                    <Text style={styles.breakLabel}>{TYPE_LABEL[type]}</Text>
                    <View style={styles.breakBarBg}>
                      <View
                        style={[styles.breakBarFill, {
                          width: `${Math.max(pct, count > 0 ? 4 : 0)}%` as any,
                          backgroundColor: color,
                        }]}
                      />
                    </View>
                    <Text style={[styles.breakCount, { color }]}>{count}</Text>
                    <Text style={styles.breakPct}>{pct.toFixed(0)}%</Text>
                  </View>
                );
              })}
            </LinearGradient>
          </>
        )}

        {/* ── Recent Activity ──────────────────────────────────────── */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionLabel}>Recent Activity</Text>
          {recent.length > 0 && (
            <TouchableOpacity onPress={() => goTo("saved")} activeOpacity={0.7}>
              <Text style={styles.seeAll}>See All →</Text>
            </TouchableOpacity>
          )}
        </View>

        {recent.length === 0 ? (
          <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.emptyCard}>
            <Feather name="inbox" size={32} color="#1E3A54" />
            <Text style={styles.emptyTitle}>No cases yet</Text>
            <Text style={styles.emptySub}>
              Upload a financial document in any module to begin analysis
            </Text>
            <TouchableOpacity onPress={() => goTo("index")} activeOpacity={0.8} style={styles.emptyBtn}>
              <Text style={[styles.emptyBtnText, { color: C.primary }]}>Start Analysis</Text>
              <Feather name="arrow-right" size={13} color={C.primary} />
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.recentCard}>
            {recent.map((c, i) => {
              const type    = (c as any).caseType ?? "other";
              const color   = TYPE_COLOR[type] ?? C.primary;
              const badge   = TYPE_LABEL[type] ?? "—";
              const name    = (c as any).clientName ?? "Unnamed Case";
              const date    = formatDate((c as any).createdAt);

              let highlight = "";
              if (type === "working_capital") {
                const e = safeNum((c as any).workingCapitalResults?.eligibilityAmount);
                if (e) highlight = `Eligible: ${compactINR(e)}`;
              } else if (type === "banking") {
                const s = safeNum((c as any).bankingResults?.overallScore);
                if (s) highlight = `Score: ${s.toFixed(0)}/100`;
              } else if (type === "multi_year") {
                const r = (c as any).multiYearResults;
                if (r?.year3NetProfit) highlight = `Net Profit: ${compactINR(safeNum(r.year3NetProfit))}`;
              }

              return (
                <View key={(c as any).id ?? i}>
                  <View style={styles.recentRow}>
                    <View style={[styles.recentBadge, { backgroundColor: color + "20" }]}>
                      <Feather name={TYPE_ICON[type] as any ?? "file"} size={13} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.recentName} numberOfLines={1}>{name}</Text>
                      {highlight ? (
                        <Text style={[styles.recentHighlight, { color }]}>{highlight}</Text>
                      ) : (
                        <Text style={[styles.recentType, { color }]}>{badge}</Text>
                      )}
                    </View>
                    <Text style={styles.recentDate}>{date}</Text>
                  </View>
                  {i < recent.length - 1 && <View style={styles.divider} />}
                </View>
              );
            })}
          </LinearGradient>
        )}

        {/* ── Quick Actions Row ────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={styles.quickRow}>
          {[
            { label: "WC Analysis",    name: "index",     color: "#4A9EFF", icon: "bar-chart-2" },
            { label: "Banking",        name: "banking",   color: "#D4A800", icon: "credit-card" },
            { label: "Multi-Year",     name: "multiyear", color: "#10B981", icon: "trending-up" },
            { label: "GST & ITR",      name: "gst-itr",   color: "#A855F7", icon: "file-text" },
          ].map((q) => (
            <TouchableOpacity
              key={q.name}
              style={[styles.quickBtn, { borderColor: q.color + "40", backgroundColor: q.color + "12" }]}
              onPress={() => goTo(q.name)}
              activeOpacity={0.8}
            >
              <Feather name={q.icon as any} size={16} color={q.color} />
              <Text style={[styles.quickLabel, { color: q.color }]}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TabNavBar current="dashboard" />
      </ScrollView>
    </PageBackground>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Pill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={[pillS.wrap, { borderColor: color + "40", backgroundColor: color + "14" }]}>
      <Feather name={icon as any} size={10} color={color} />
      <Text style={[pillS.text, { color }]}>{label}</Text>
    </View>
  );
}
const pillS = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  text: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

function KpiCard({
  label, value, icon, color, wide,
}: {
  label: string; value: string; icon: string; color: string; wide?: boolean;
}) {
  return (
    <LinearGradient
      colors={[color + "1E", color + "08"]}
      style={[kpiS.card, { borderColor: color + "38" }, wide && kpiS.wide]}
    >
      <View style={[kpiS.iconWrap, { backgroundColor: color + "22" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[kpiS.val, { color }]}>{value}</Text>
      <Text style={kpiS.label}>{label}</Text>
    </LinearGradient>
  );
}
const kpiS = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, borderWidth: 1, alignItems: "center", paddingVertical: 14, paddingHorizontal: 8, gap: 5 },
  wide: { flexBasis: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 12 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  val: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 10, color: "#6A8FA8", fontFamily: "Inter_500Medium", textAlign: "center" },
});

function ScoreBar({ score, color }: { score: number; color: string }) {
  const w = Math.min(Math.max(score, 0), 100);
  return (
    <View style={scoreS.bg}>
      <View style={[scoreS.fill, { width: `${w}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const scoreS = StyleSheet.create({
  bg: { width: 56, height: 4, backgroundColor: "#1E3A54", borderRadius: 2, marginTop: 4 },
  fill: { height: "100%", borderRadius: 2 },
});

function EmptyChart({
  icon, color, label, sub, onPress,
}: {
  icon: string; color: string; label: string; sub: string; onPress: () => void;
}) {
  return (
    <LinearGradient colors={["#112034", "#0D1A2A"]} style={styles.emptyChart}>
      <View style={[styles.emptyChartIcon, { backgroundColor: color + "16" }]}>
        <Feather name={icon as any} size={22} color={color + "80"} />
      </View>
      <Text style={styles.emptyChartLabel}>{label}</Text>
      <Text style={styles.emptyChartSub}>{sub}</Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.emptyChartBtn, { borderColor: color + "40" }]}>
        <Text style={[styles.emptyChartBtnText, { color }]}>Analyse Now →</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },

  // Header
  header: {
    borderRadius: 24, padding: 20, overflow: "hidden",
    borderWidth: 1, borderColor: "#1E3A54", gap: 12,
  },
  headerGlow: {
    position: "absolute", top: -30, right: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#20B2AA14",
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  brand: {
    fontSize: 9, fontFamily: "Inter_700Bold", color: C.primary,
    letterSpacing: 2.2, textTransform: "uppercase",
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#E8F4FF", marginTop: 2 },
  headerDate: { fontSize: 11, color: "#6A8FA8", fontFamily: "Inter_400Regular", marginTop: 3 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.primary + "18", borderWidth: 1, borderColor: C.primary + "38",
    alignItems: "center", justifyContent: "center",
  },
  headerPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Section labels
  sectionLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold", color: "#4A6A84",
    textTransform: "uppercase", letterSpacing: 1.4, marginTop: 2,
  },

  // KPI grid
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Charts
  chartCard: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54",
    padding: 16, gap: 12,
  },
  chartTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  chartTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#C0D8EE" },
  chartSub: { fontSize: 10, color: "#5A7A94", fontFamily: "Inter_400Regular", marginTop: 2 },
  chartRight: { alignItems: "flex-end" },
  chartLatest: { fontSize: 18, fontFamily: "Inter_700Bold" },
  chartUnit: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#5A7A94" },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  deltaText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  chartFooter: { flexDirection: "row", justifyContent: "space-around" },
  chartDot: { alignItems: "center" },
  dotMark: { width: 5, height: 5, borderRadius: 3 },

  // Empty chart
  emptyChart: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54",
    padding: 24, alignItems: "center", gap: 8,
  },
  emptyChartIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emptyChartLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#3D5A74" },
  emptyChartSub: { fontSize: 11, color: "#2A3D52", fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyChartBtn: { marginTop: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  emptyChartBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Distribution breakdown
  breakdownCard: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54",
    padding: 16, gap: 12,
  },
  breakRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  breakIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  breakLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#8BAFC9", width: 36 },
  breakBarBg: { flex: 1, height: 6, backgroundColor: "#1E3A54", borderRadius: 3, overflow: "hidden" },
  breakBarFill: { height: "100%", borderRadius: 3 },
  breakCount: { fontSize: 13, fontFamily: "Inter_700Bold", width: 24, textAlign: "right" },
  breakPct: { fontSize: 10, color: "#4A6A84", fontFamily: "Inter_400Regular", width: 30, textAlign: "right" },

  // Recent activity
  recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.primary },
  recentCard: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54", overflow: "hidden",
  },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  recentBadge: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  recentName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#D0E8FF" },
  recentHighlight: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },
  recentType: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },
  recentDate: { fontSize: 10, color: "#3D5A74", fontFamily: "Inter_400Regular" },
  divider: { height: 1, backgroundColor: "#142030", marginHorizontal: 14 },

  // Empty state
  emptyCard: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54",
    padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#2D4A62" },
  emptySub: { fontSize: 12, color: "#1E3250", fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  emptyBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Quick actions
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickBtn: {
    flexBasis: "47%", flex: 1, borderWidth: 1, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 12,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  quickLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
