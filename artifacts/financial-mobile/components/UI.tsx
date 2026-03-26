/**
 * Shared UI components — dark navy/teal glassmorphism theme
 */
import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  type ViewStyle, type TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

const C = Colors.light;

// ── Tab navigation order ───────────────────────────────────────────────────────
export const TAB_ORDER: { name: string; label: string }[] = [
  { name: "home",      label: "Home" },
  { name: "dashboard", label: "Dashboard" },
  { name: "index",     label: "WC Analysis" },
  { name: "banking",   label: "Banking" },
  { name: "multiyear", label: "Multi-Year" },
  { name: "saved",     label: "Saved" },
];

// ── Next / Back navigation bar ─────────────────────────────────────────────────
export function TabNavBar({ current }: { current: string }) {
  const router = useRouter();
  const idx = TAB_ORDER.findIndex((t) => t.name === current);
  const prev = idx > 0 ? TAB_ORDER[idx - 1] : null;
  const next = idx < TAB_ORDER.length - 1 ? TAB_ORDER[idx + 1] : null;

  const goTo = (name: string) => {
    if (name === "index") router.push("/(tabs)/");
    else router.push(`/(tabs)/${name}` as any);
  };

  return (
    <View style={navStyles.bar}>
      <TouchableOpacity
        style={[navStyles.btn, !prev && navStyles.disabled]}
        onPress={() => prev && goTo(prev.name)}
        disabled={!prev}
        activeOpacity={0.7}
      >
        <Feather name="arrow-left" size={15} color={prev ? C.primary : "#2A3D52"} />
        <Text style={[navStyles.btnText, { color: prev ? C.primary : "#2A3D52" }]}>
          {prev ? prev.label : "—"}
        </Text>
      </TouchableOpacity>

      {/* Step dots */}
      <View style={navStyles.dots}>
        {TAB_ORDER.map((t, i) => (
          <TouchableOpacity key={t.name} onPress={() => goTo(t.name)} hitSlop={6}>
            <View
              style={[
                navStyles.dot,
                i === idx && navStyles.dotActive,
                i < idx && navStyles.dotDone,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[navStyles.btn, navStyles.btnRight, !next && navStyles.disabled]}
        onPress={() => next && goTo(next.name)}
        disabled={!next}
        activeOpacity={0.7}
      >
        <Text style={[navStyles.btnText, { color: next ? C.accent : "#2A3D52" }]}>
          {next ? next.label : "—"}
        </Text>
        <Feather name="arrow-right" size={15} color={next ? C.accent : "#2A3D52"} />
      </TouchableOpacity>
    </View>
  );
}

const navStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D1520",
    borderWidth: 1,
    borderColor: "#1E3044",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 88,
  },
  btnRight: { justifyContent: "flex-end" },
  disabled: { opacity: 0.35 },
  btnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#1E3044",
  },
  dotActive: { width: 18, borderRadius: 4, backgroundColor: C.accent },
  dotDone: { backgroundColor: C.primary + "88" },
});

// ── Full-page gradient background ─────────────────────────────────────────────
export function PageBackground({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={["#080F1E", "#0B1426", "#0F1A2B"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  );
}

// ── Page header ────────────────────────────────────────────────────────────────
export function PageHeader({
  title, subtitle, accentColor = C.primary,
}: {
  title: string; subtitle?: string; accentColor?: string;
}) {
  return (
    <View style={hStyles.wrapper}>
      <LinearGradient
        colors={[accentColor + "22", "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={hStyles.accent}
      />
      <Text style={hStyles.brand}>DHANUSH ENTERPRISES</Text>
      <Text style={hStyles.title}>{title}</Text>
      {subtitle ? <Text style={hStyles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const hStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 16, overflow: "hidden", padding: 14,
    borderWidth: 1, borderColor: "#1C2D40",
    backgroundColor: "#111C2A", marginBottom: 2,
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  brand: { fontSize: 8, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 2, marginBottom: 4, textTransform: "uppercase" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#E5ECF5", letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: C.textSecondary, marginTop: 3, fontFamily: "Inter_400Regular" },
});

// ── Glass card ─────────────────────────────────────────────────────────────────
export function GlassCard({ children, accentColor, style }: {
  children: React.ReactNode; accentColor?: string; style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={["#15202F", "#121B28"]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[gStyles.card, style]}
    >
      {accentColor && <View style={[gStyles.bar, { backgroundColor: accentColor }]} />}
      {children}
    </LinearGradient>
  );
}

const gStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, borderColor: "#1E3044", overflow: "hidden", padding: 14 },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
});

// ── Upload zone (dashed) ───────────────────────────────────────────────────────
export function UploadZone({
  onPress, loading, uploaded, fileSelected, fileName, label, accentColor = C.primary, onClear, onParse,
}: {
  onPress: () => void; loading?: boolean; uploaded?: boolean; fileSelected?: boolean;
  fileName?: string; label: string; accentColor?: string; onClear?: () => void; onParse?: () => void;
}) {
  const isReady = fileSelected && !uploaded && !loading;
  const borderColor = uploaded ? C.success + "66" : isReady ? "#F5C842AA" : accentColor + "55";
  const borderStyle = uploaded || isReady ? "solid" : "dashed";
  const bgFrom = uploaded ? C.success + "12" : isReady ? "#F5C84218" : accentColor + "14";
  const bgTo   = uploaded ? C.success + "06" : isReady ? "#F5C84208" : accentColor + "06";

  return (
    <View style={uStyles.wrapper}>
      {/* File selector row */}
      <TouchableOpacity
        onPress={onPress} activeOpacity={0.8} disabled={loading || uploaded}
        style={[uStyles.zone, { borderColor, borderStyle }]}
      >
        <LinearGradient colors={[bgFrom, bgTo]} style={StyleSheet.absoluteFill} />
        <View style={uStyles.row}>
          {loading ? (
            <View style={[uStyles.iconBox, { backgroundColor: accentColor + "22" }]}>
              <ActivityIndicator size="small" color={accentColor} />
            </View>
          ) : uploaded ? (
            <View style={[uStyles.iconBox, { backgroundColor: C.success + "22" }]}>
              <Feather name="check-circle" size={18} color={C.success} />
            </View>
          ) : isReady ? (
            <View style={[uStyles.iconBox, { backgroundColor: "#F5C84222" }]}>
              <Feather name="file-text" size={18} color="#F5C842" />
            </View>
          ) : (
            <View style={[uStyles.iconBox, { backgroundColor: accentColor + "22" }]}>
              <Feather name="upload-cloud" size={18} color={accentColor} />
            </View>
          )}
          <Text
            style={[uStyles.label, { color: uploaded ? C.text : isReady ? "#F5C842" : C.textSecondary }]}
            numberOfLines={1}
          >
            {loading
              ? "Parsing document…"
              : uploaded
              ? fileName
              : isReady
              ? fileName
              : label}
          </Text>
          {(uploaded || isReady) && onClear && (
            <TouchableOpacity onPress={onClear} hitSlop={10}>
              <Feather name="x" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          )}
          {!uploaded && !loading && !isReady && (
            <Feather name="chevron-right" size={16} color={accentColor} />
          )}
        </View>
      </TouchableOpacity>

      {/* ── START PARSING button — appears only after file is selected ── */}
      {isReady && onParse && (
        <TouchableOpacity onPress={onParse} activeOpacity={0.85} style={uStyles.parseBtn}>
          <LinearGradient
            colors={["#F5C842", "#D4A000"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={uStyles.parseBtnGrad}
          >
            <Feather name="zap" size={16} color="#000" />
            <Text style={uStyles.parseBtnText}>Start Parsing</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Uploaded confirmation chip */}
      {uploaded && (
        <View style={uStyles.doneChip}>
          <Feather name="check-circle" size={12} color={C.success} />
          <Text style={uStyles.doneText}>Values extracted successfully</Text>
        </View>
      )}
    </View>
  );
}

const uStyles = StyleSheet.create({
  wrapper: { gap: 6 },
  zone: { borderRadius: 12, borderWidth: 1.5, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  parseBtn: { borderRadius: 12, overflow: "hidden" },
  parseBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, paddingHorizontal: 16 },
  parseBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#000" },
  doneChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#2D8B5F15", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  doneText: { fontSize: 10, color: "#2D8B5F", fontFamily: "Inter_500Medium" },
});

// ── Gradient button ────────────────────────────────────────────────────────────
export function GradientButton({
  onPress, label, icon, loading, colors: gradColors, textColor = "#fff",
}: {
  onPress: () => void; label: string; icon?: string;
  loading?: boolean; colors?: [string, string]; textColor?: string;
}) {
  const gc: [string, string] = gradColors ?? [C.primary, "#1890A8"];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} disabled={loading}>
      <LinearGradient colors={gc} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={bStyles.btn}>
        {loading
          ? <ActivityIndicator size="small" color={textColor} />
          : icon
          ? <Feather name={icon as any} size={18} color={textColor} />
          : null}
        <Text style={[bStyles.label, { color: textColor }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const bStyles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

// ── KPI metric tile ────────────────────────────────────────────────────────────
export function MetricTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <LinearGradient colors={["#1A2C42", "#152236"]} style={mStyles.tile}>
      <Text style={mStyles.label}>{label}</Text>
      <Text style={[mStyles.value, { color: color ?? C.text }]}>{value}</Text>
    </LinearGradient>
  );
}

const mStyles = StyleSheet.create({
  tile: { flex: 1, minWidth: "29%", borderRadius: 12, borderWidth: 1, borderColor: "#1E3044", padding: 10, alignItems: "center", gap: 4 },
  label: { fontSize: 8, color: C.textSecondary, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" },
  value: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
});

// ── Section card title ─────────────────────────────────────────────────────────
export const CardTitle = ({ children, style }: { children: string; style?: TextStyle }) => (
  <Text style={[ctStyles.t, style]}>{children}</Text>
);
const ctStyles = StyleSheet.create({
  t: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#B8CCE0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
});

export { default as Colors } from "@/constants/colors";
