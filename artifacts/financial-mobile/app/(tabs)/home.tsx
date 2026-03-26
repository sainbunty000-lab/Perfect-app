import React from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { ErrorFallback } from "@/components/ErrorFallback";
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
  { name: "dashboard", label: "Dashboard",          icon: "activity",      color: C.primary,   iconLib: "feather",   badge: "Analytics"   },
  { name: "index",     label: "Working Capital",    icon: "bar-chart-2",   color: C.secondary, iconLib: "feather",   badge: "Core Module" },
  { name: "banking",   label: "Banking Performance",icon: "bank-outline",  color: C.accent,    iconLib: "material",  badge: "Core Module" },
  { name: "multiyear", label: "Multi-Year Analysis",icon: "trending-up",   color: C.success,   iconLib: "feather",   badge: "Advanced"    },
  { name: "gst-itr",  label: "GST & ITR",           icon: "file-text",     color: "#8B6CC1",   iconLib: "feather",   badge: "Compliance"  },
  { name: "saved",     label: "Saved Cases",        icon: "folder",        color: "#C47A3A",   iconLib: "feather",   badge: "Records"     },
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

  const cardWidth = (width - 28 - 10) / 2;

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
          colors={["#0E1E32", "#0B1426", "#080F1E"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroGlow} />

          <View style={styles.heroLogoRow}>
            <LinearGradient colors={[C.primary, C.secondary]} style={styles.heroLogoCircle}>
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
            <StatPill icon="zap"    label="AI-Powered OCR"  color={C.accent} />
            <StatPill icon="shield" label="100% Accurate"   color={C.success} />
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
                colors={[m.color + "1C", m.color + "08", "#080F1E"]}
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
            colors={[C.primary, C.secondary, "#4A7FA8"]}
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
  scroll: { paddingHorizontal: 14, gap: 12 },

  hero: {
    borderRadius: 18, padding: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "#1E3044", gap: 10,
  },
  heroGlow: {
    position: "absolute", top: -40, right: -40,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#2E6DAB12",
  },
  heroLogoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroLogoCircle: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  brand: {
    fontSize: 8, fontFamily: "Inter_700Bold", color: C.primary,
    letterSpacing: 2, textTransform: "uppercase",
  },
  brandSub: { fontSize: 10, color: "#7A95AD", fontFamily: "Inter_400Regular", marginTop: 1 },
  heroHeadline: {
    fontSize: 22, fontFamily: "Inter_700Bold", color: "#E5ECF5",
    lineHeight: 28, letterSpacing: -0.3,
  },
  heroBody: { fontSize: 11, color: "#8A9DB5", fontFamily: "Inter_400Regular", lineHeight: 17 },
  heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 4,
  },
  pillText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moduleCard: {
    borderRadius: 14, borderWidth: 1, borderColor: "#1E304450",
    padding: 12, gap: 6, overflow: "hidden", position: "relative",
  },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  badge: { alignSelf: "flex-start", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 8, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  moduleLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#D5E2EE", lineHeight: 15 },
  cardCTA: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  ctaText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  cta: {
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  ctaMain: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff", flex: 1, textAlign: "center" },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorFallback error={error} resetError={retry} />;
}
