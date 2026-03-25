/**
 * Shared UI components — match the web app's dark navy/teal glassmorphism theme
 */
import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  type ViewStyle, type TextStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const C = Colors.light;

// ── Full-page gradient background ─────────────────────────────────────────────
export function PageBackground({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={["#0A1628", "#0D1B2A", "#111F30"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  );
}

// ── Page header with brand + gradient accent bar ───────────────────────────────
export function PageHeader({
  title,
  subtitle,
  accentColor = C.primary,
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
}) {
  return (
    <View style={hStyles.wrapper}>
      <LinearGradient
        colors={[accentColor + "22", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
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
    borderRadius: 20,
    overflow: "hidden",
    padding: 20,
    borderWidth: 1,
    borderColor: "#1E3048",
    backgroundColor: "#131F30",
    marginBottom: 2,
  },
  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  brand: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: C.primary,
    letterSpacing: 2.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#E8F4FF",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 4,
    fontFamily: "Inter_400Regular",
  },
});

// ── Glass card ────────────────────────────────────────────────────────────────
export function GlassCard({
  children,
  accentColor,
  style,
}: {
  children: React.ReactNode;
  accentColor?: string;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={["#1A2C42", "#152236"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[gStyles.card, style]}
    >
      {accentColor && <View style={[gStyles.bar, { backgroundColor: accentColor }]} />}
      {children}
    </LinearGradient>
  );
}

const gStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1E3A54",
    overflow: "hidden",
    padding: 18,
  },
  bar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
});

// ── Upload zone (dashed border) ───────────────────────────────────────────────
export function UploadZone({
  onPress,
  loading,
  uploaded,
  fileName,
  label,
  accentColor = C.primary,
  onClear,
}: {
  onPress: () => void;
  loading?: boolean;
  uploaded?: boolean;
  fileName?: string;
  label: string;
  accentColor?: string;
  onClear?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={loading}
      style={[
        uStyles.zone,
        uploaded && { borderColor: C.success + "66", borderStyle: "solid" },
        { borderColor: uploaded ? C.success + "66" : accentColor + "55" },
      ]}
    >
      <LinearGradient
        colors={uploaded ? [C.success + "12", C.success + "06"] : [accentColor + "14", accentColor + "06"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={uStyles.row}>
        {loading ? (
          <View style={[uStyles.iconBox, { backgroundColor: accentColor + "22" }]}>
            <Feather name="loader" size={18} color={accentColor} />
          </View>
        ) : uploaded ? (
          <View style={[uStyles.iconBox, { backgroundColor: C.success + "22" }]}>
            <Feather name="check-circle" size={18} color={C.success} />
          </View>
        ) : (
          <View style={[uStyles.iconBox, { backgroundColor: accentColor + "22" }]}>
            <Feather name="upload-cloud" size={18} color={accentColor} />
          </View>
        )}
        <Text
          style={[uStyles.label, { color: uploaded ? C.text : C.textSecondary }]}
          numberOfLines={1}
        >
          {loading ? "Parsing document…" : uploaded ? fileName : label}
        </Text>
        {uploaded && onClear && (
          <TouchableOpacity onPress={onClear} hitSlop={10}>
            <Feather name="x" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        )}
        {!uploaded && !loading && (
          <Feather name="chevron-right" size={16} color={accentColor} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const uStyles = StyleSheet.create({
  zone: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});

// ── Primary action button with gradient ───────────────────────────────────────
export function GradientButton({
  onPress,
  label,
  icon,
  loading,
  colors: gradColors,
  textColor = "#fff",
}: {
  onPress: () => void;
  label: string;
  icon?: string;
  loading?: boolean;
  colors?: [string, string];
  textColor?: string;
}) {
  const gc: [string, string] = gradColors ?? [C.primary, "#1890A8"];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} disabled={loading}>
      <LinearGradient
        colors={gc}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={bStyles.btn}
      >
        {icon && !loading && <Feather name={icon as any} size={18} color={textColor} />}
        <Text style={[bStyles.label, { color: textColor }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const bStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
  },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ── KPI metric tile ───────────────────────────────────────────────────────────
export function MetricTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <LinearGradient
      colors={["#1A2C42", "#152236"]}
      style={mStyles.tile}
    >
      <Text style={mStyles.label}>{label}</Text>
      <Text style={[mStyles.value, { color: color ?? C.text }]}>{value}</Text>
    </LinearGradient>
  );
}

const mStyles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: "29%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E3A54",
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 9,
    color: C.textSecondary,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  value: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
});

// ── Section card title ─────────────────────────────────────────────────────────
export const CardTitle = ({ children, style }: { children: string; style?: TextStyle }) => (
  <Text style={[ctStyles.t, style]}>{children}</Text>
);
const ctStyles = StyleSheet.create({
  t: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#C8DDF0", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.5 },
});

// ── Shared input row ───────────────────────────────────────────────────────────
export { default as Colors } from "@/constants/colors";
