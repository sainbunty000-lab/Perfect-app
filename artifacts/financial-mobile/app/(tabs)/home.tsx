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

const C = Colors.light;

const MODULES = [
  { name: "dashboard", label: "Dashboard",          icon: "activity",      color: "#20B2AA", iconLib: "feather",   badge: "Analytics"   },
  { name: "index",     label: "Working Capital",    icon: "bar-chart-2",   color: "#4A9EFF", iconLib: "feather",   badge: "Core Module" },
  { name: "banking",   label: "Banking Performance",icon: "bank-outline",  color: "#D4A800", iconLib: "material",  badge: "Core Module" },
  { name: "multiyear", label: "Multi-Year Analysis",icon: "trending-up",   color: "#10B981", iconLib: "feather",   badge: "Advanced"    },
  { name: "gst-itr",  label: "GST & ITR",           icon: "file-text",     color: "#A855F7", iconLib: "feather",   badge: "Compliance"  },
  { name: "saved",     label: "Saved Cases",        icon: "folder",        color: "#F5832A", iconLib: "feather",   badge: "Records"     },
] as const;

export default function HomeScreen() {
  const insets    = useSafeAreaInsets();
  const tabHeight = useBottomTabBarHeight();
  const router    = useRouter();
  const { width } = useWindowDimensions();

  const { data: cases } = useListCases();
  const total = (cases ?? []).length;

  const goTo = (name: string) => {
    if (name === "index") router.push("/(tabs)/");
    else router.push(`/(tabs)/${name}` as any);
  };

  const cardWidth = (width - 32 - 12) / 2;

  return (
    <PageBackground>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: tabHeight + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Banner ──────────────────────────────────────────── */}
        <LinearGradient
          colors={["#0B2540", "#0A1628", "#071220"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />

          <View style={styles.heroLogoRow}>
            <LinearGradient colors={[C.primary, "#0EA5A0"]} style={styles.heroLogoCircle}>
              <MaterialCommunityIcons name="finance" size={26} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
              <Text style={styles.brandSub}>Financial Intelligence Platform</Text>
            </View>
          </View>

          <Text style={styles.heroHeadline}>Smart Analysis.{"\n"}Instant Results.</Text>
          <Text style={styles.heroBody}>
            AI-powered document parsing — upload any Balance Sheet, P&L, Bank Statement, GST return, or ITR and get structured financials in seconds.
          </Text>

          <View style={styles.heroStats}>
            <StatPill icon="folder" label={`${total} Case${total !== 1 ? "s" : ""} Saved`} color={C.primary} />
            <StatPill icon="zap"    label="AI-Powered OCR"  color="#F5C842" />
            <StatPill icon="shield" label="100% Accurate"   color="#10B981" />
          </View>
        </LinearGradient>

        {/* ── Modules Grid ─────────────────────────────────────────── */}
        <View style={styles.grid}>
          {MODULES.map((m) => (
            <TouchableOpacity
              key={m.name}
              style={{ width: cardWidth }}
              onPress={() => goTo(m.name)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[m.color + "1C", m.color + "08", "#0A1628"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.moduleCard}
              >
                <View style={[styles.cardAccent, { backgroundColor: m.color }]} />
                <View style={[styles.badge, { backgroundColor: m.color + "22" }]}>
                  <Text style={[styles.badgeText, { color: m.color }]}>{m.badge}</Text>
                </View>
                <LinearGradient colors={[m.color + "30", m.color + "14"]} style={styles.iconWrap}>
                  {m.iconLib === "material" ? (
                    <MaterialCommunityIcons name={m.icon as any} size={22} color={m.color} />
                  ) : (
                    <Feather name={m.icon as any} size={22} color={m.color} />
                  )}
                </LinearGradient>
                <Text style={styles.moduleLabel}>{m.label}</Text>
                <View style={styles.cardCTA}>
                  <Text style={[styles.ctaText, { color: m.color }]}>Open</Text>
                  <Feather name="arrow-right" size={11} color={m.color} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Primary CTA ──────────────────────────────────────────── */}
        <TouchableOpacity onPress={() => goTo("index")} activeOpacity={0.85}>
          <LinearGradient
            colors={[C.primary, "#0EA5A0", "#0D8F8A"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            <Feather name="upload-cloud" size={18} color="#fff" />
            <Text style={styles.ctaMain}>Start New Analysis</Text>
            <Feather name="chevron-right" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <TabNavBar current="home" />
      </ScrollView>
    </PageBackground>
  );
}

function StatPill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color + "40", backgroundColor: color + "14" }]}>
      <Feather name={icon as any} size={11} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, gap: 16 },

  hero: {
    borderRadius: 24, padding: 22, overflow: "hidden",
    borderWidth: 1, borderColor: "#1E3A54", gap: 14,
  },
  heroGlow: {
    position: "absolute", top: -40, right: -40,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "#20B2AA18",
  },
  heroLogoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroLogoCircle: {
    width: 50, height: 50, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  brand: {
    fontSize: 10, fontFamily: "Inter_700Bold", color: C.primary,
    letterSpacing: 2.2, textTransform: "uppercase",
  },
  brandSub: { fontSize: 11, color: "#7A9BB5", fontFamily: "Inter_400Regular", marginTop: 2 },
  heroHeadline: {
    fontSize: 30, fontFamily: "Inter_700Bold", color: "#E8F4FF",
    lineHeight: 36, letterSpacing: -0.5,
  },
  heroBody: { fontSize: 13, color: "#8BAFC9", fontFamily: "Inter_400Regular", lineHeight: 20 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  pillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  moduleCard: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A5450",
    padding: 14, gap: 8, overflow: "hidden", position: "relative",
  },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  badge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  iconWrap: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  moduleLabel: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#E0EDF8", lineHeight: 17 },
  cardCTA: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ctaText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  cta: {
    borderRadius: 18, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  ctaMain: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", flex: 1, textAlign: "center" },
});
