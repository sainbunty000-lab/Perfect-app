import React from "react";
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

const MODULES = [
  { name: "index",     label: "Working Capital", icon: "bar-chart-2",   color: "#4A9EFF", desc: "BS & P&L analysis" },
  { name: "banking",   label: "Banking",         icon: "home",          color: "#D4A800", desc: "Statement analysis" },
  { name: "multiyear", label: "Multi-Year",      icon: "trending-up",   color: "#10B981", desc: "3-year trend charts" },
  { name: "gst-itr",  label: "GST & ITR",        icon: "file-text",    color: "#A855F7", desc: "Compliance analysis" },
] as const;

const TYPE_LABEL: Record<string, string> = {
  working_capital: "WC",
  banking:         "Bank",
  gst_itr:         "GST",
  multi_year:      "MYr",
};
const TYPE_COLOR: Record<string, string> = {
  working_capital: "#4A9EFF",
  banking:         "#D4A800",
  gst_itr:         "#A855F7",
  multi_year:      "#10B981",
};

function formatDate(ts: string | number | null | undefined) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return "—"; }
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export default function HomeScreen() {
  const insets      = useSafeAreaInsets();
  const tabHeight   = useBottomTabBarHeight();
  const router      = useRouter();
  const { width }   = useWindowDimensions();
  const chartW      = width - 32 - 36;            // 16px padding each side + 18px card padding

  const { data: cases, isLoading } = useListCases();
  const caseList = cases ?? [];

  // ── Derived stats ────────────────────────────────────────────────────────────
  const total    = caseList.length;
  const byType   = caseList.reduce<Record<string, number>>((acc, c) => {
    const t = (c as any).caseType ?? "other";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});

  // WC trend: last 6 WC eligibility values
  const wcCases   = caseList.filter((c) => (c as any).caseType === "working_capital").slice(-6);
  const wcSpark   = wcCases.map((c) => safeNum((c as any).workingCapitalResults?.eligibilityAmount));

  // Banking trend: last 6 overall scores
  const bankCases = caseList.filter((c) => (c as any).caseType === "banking").slice(-6);
  const bankSpark = bankCases.map((c) => safeNum((c as any).bankingResults?.overallScore));

  // Recent 5 cases
  const recent = [...caseList].sort((a, b) => {
    const ta = new Date((a as any).createdAt ?? 0).getTime();
    const tb = new Date((b as any).createdAt ?? 0).getTime();
    return tb - ta;
  }).slice(0, 5);

  const goTo = (name: string) => {
    if (name === "index") router.push("/(tabs)/");
    else router.push(`/(tabs)/${name}` as any);
  };

  return (
    <PageBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 16, paddingBottom: tabHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Header ───────────────────────────────────────── */}
        <LinearGradient
          colors={["#0D2137", "#0A1628"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <LinearGradient
            colors={[C.primary + "30", "transparent"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
          <Text style={styles.heroTitle}>Financial{"\n"}Intelligence</Text>
          <Text style={styles.heroSub}>
            {isLoading ? "Loading…" : `${total} case${total !== 1 ? "s" : ""} analysed`}
          </Text>
        </LinearGradient>

        {/* ── Summary KPI row ────────────────────────────────────── */}
        <View style={styles.kpiRow}>
          <KpiCard label="Total Cases" value={String(total)} icon="folder" color={C.primary} />
          <KpiCard label="WC Cases"    value={String(byType["working_capital"] ?? 0)} icon="bar-chart-2" color="#4A9EFF" />
          <KpiCard label="Banking"     value={String(byType["banking"] ?? 0)} icon="credit-card" color="#D4A800" />
          <KpiCard label="Multi-Yr"    value={String(byType["multi_year"] ?? 0)} icon="trending-up" color="#10B981" />
        </View>

        {/* ── WC Eligibility Trend ───────────────────────────────── */}
        {wcSpark.length >= 2 && (
          <LinearGradient colors={["#1A2C42", "#152236"]} style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>WC Eligibility Trend</Text>
                <Text style={styles.chartSub}>Last {wcSpark.length} working capital cases</Text>
              </View>
              <Text style={[styles.chartLatest, { color: "#4A9EFF" }]}>
                {compactINR(wcSpark[wcSpark.length - 1])}
              </Text>
            </View>
            <MiniSparkline values={wcSpark} color="#4A9EFF" width={chartW} height={56} />
          </LinearGradient>
        )}

        {/* ── Banking Score Trend ────────────────────────────────── */}
        {bankSpark.length >= 2 && (
          <LinearGradient colors={["#1A2C42", "#152236"]} style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View>
                <Text style={styles.chartTitle}>Banking Score Trend</Text>
                <Text style={styles.chartSub}>Last {bankSpark.length} banking analyses</Text>
              </View>
              <Text style={[styles.chartLatest, { color: "#D4A800" }]}>
                {bankSpark[bankSpark.length - 1].toFixed(0)}/100
              </Text>
            </View>
            <MiniSparkline values={bankSpark} color="#D4A800" width={chartW} height={56} />
          </LinearGradient>
        )}

        {/* ── Module Quick Actions ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={styles.moduleGrid}>
          {MODULES.map((m) => (
            <TouchableOpacity key={m.name} onPress={() => goTo(m.name)} activeOpacity={0.8} style={{ width: "48%" }}>
              <LinearGradient
                colors={[m.color + "22", m.color + "0A"]}
                style={[styles.moduleCard, { borderColor: m.color + "44" }]}
              >
                <View style={[styles.moduleIcon, { backgroundColor: m.color + "22" }]}>
                  <Feather name={m.icon as any} size={20} color={m.color} />
                </View>
                <Text style={styles.moduleLabel}>{m.label}</Text>
                <Text style={styles.moduleDesc}>{m.desc}</Text>
                <View style={[styles.moduleArrow, { backgroundColor: m.color + "22" }]}>
                  <Feather name="arrow-right" size={12} color={m.color} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Recent Cases ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Recent Cases</Text>
        {recent.length === 0 ? (
          <LinearGradient colors={["#1A2C42", "#152236"]} style={styles.emptyCard}>
            <Feather name="inbox" size={28} color="#2A4A65" />
            <Text style={styles.emptyText}>No cases yet</Text>
            <Text style={styles.emptySub}>Upload a document in any module to get started</Text>
          </LinearGradient>
        ) : (
          recent.map((c, i) => {
            const type   = (c as any).caseType ?? "other";
            const color  = TYPE_COLOR[type] ?? C.primary;
            const badge  = TYPE_LABEL[type] ?? type;
            const name   = (c as any).clientName ?? "Unnamed";
            const date   = formatDate((c as any).createdAt);

            // Pull a highlight value
            let highlight = "";
            if (type === "working_capital") {
              const e = safeNum((c as any).workingCapitalResults?.eligibilityAmount);
              if (e) highlight = `Eligible: ${compactINR(e)}`;
            } else if (type === "banking") {
              const s = safeNum((c as any).bankingResults?.overallScore);
              if (s) highlight = `Score: ${s}/100`;
            }

            return (
              <LinearGradient key={(c as any).id ?? i} colors={["#1A2C42", "#152236"]} style={styles.caseCard}>
                <View style={[styles.caseBadge, { backgroundColor: color + "22" }]}>
                  <Text style={[styles.caseBadgeText, { color }]}>{badge}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.caseName} numberOfLines={1}>{name}</Text>
                  {highlight ? <Text style={[styles.caseHighlight, { color }]}>{highlight}</Text> : null}
                </View>
                <Text style={styles.caseDate}>{date}</Text>
              </LinearGradient>
            );
          })
        )}

        {recent.length > 0 && (
          <TouchableOpacity style={styles.viewAllBtn} onPress={() => goTo("saved")} activeOpacity={0.8}>
            <Text style={styles.viewAllText}>View All Cases</Text>
            <Feather name="arrow-right" size={14} color={C.primary} />
          </TouchableOpacity>
        )}

        {/* ── Next / Back nav ────────────────────────────────────── */}
        <TabNavBar current="home" />
      </ScrollView>
    </PageBackground>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <LinearGradient colors={[color + "18", color + "08"]} style={[styles.kpi, { borderColor: color + "33" }]}>
      <Feather name={icon as any} size={14} color={color} />
      <Text style={[styles.kpiVal, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 14 },

  // Hero
  hero: { borderRadius: 24, padding: 24, overflow: "hidden", borderWidth: 1, borderColor: "#1E3A54" },
  brand: { fontSize: 9, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10 },
  heroTitle: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#E8F4FF", lineHeight: 40, letterSpacing: -0.5 },
  heroSub: { fontSize: 13, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 10 },

  // KPI row
  kpiRow: { flexDirection: "row", gap: 8 },
  kpi: { flex: 1, borderRadius: 14, borderWidth: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, gap: 4 },
  kpiVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 9, color: "#7A9BB5", fontFamily: "Inter_500Medium", textAlign: "center" },

  // Charts
  chartCard: { borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54", padding: 16, gap: 10 },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  chartTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#C8DDF0" },
  chartSub: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 2 },
  chartLatest: { fontSize: 16, fontFamily: "Inter_700Bold" },

  // Modules
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#7A9BB5", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 4 },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduleCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 8, overflow: "hidden" },
  moduleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  moduleLabel: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  moduleDesc: { fontSize: 10, color: "#7A9BB5", fontFamily: "Inter_400Regular" },
  moduleArrow: { alignSelf: "flex-start", width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  // Recent cases
  caseCard: { borderRadius: 16, borderWidth: 1, borderColor: "#1E3A54", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  caseBadge: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  caseBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  caseName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#E8F4FF" },
  caseHighlight: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  caseDate: { fontSize: 10, color: "#4A6A84", fontFamily: "Inter_400Regular" },

  // Empty state
  emptyCard: { borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54", padding: 32, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#3D5A74" },
  emptySub: { fontSize: 12, color: "#2A3D52", fontFamily: "Inter_400Regular", textAlign: "center" },

  // View all
  viewAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  viewAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },
});
