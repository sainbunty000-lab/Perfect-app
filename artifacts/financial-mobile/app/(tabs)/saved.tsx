import React, { useState, useCallback } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useListCases, useDeleteCase } from "@workspace/api-client-react";
import Colors from "@/constants/colors";
import { PageBackground, TabNavBar } from "@/components/UI";

const C = Colors.light;
const INR = (n?: number) => n !== undefined ? "₹" + Math.abs(n).toLocaleString("en-IN") : "—";

export default function SavedCasesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { data: cases, isLoading, refetch } = useListCases();
  const deleteCase = useDeleteCase();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = (id: number, name: string) => {
    Alert.alert("Delete Case", `Remove "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => deleteCase.mutate({ id }, { onSuccess: () => refetch() }),
      },
    ]);
  };

  const formatDate = (ts: string | number | null | undefined) => {
    if (!ts) return "—";
    try { return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return "—"; }
  };

  const caseList = cases ?? [];

  return (
    <PageBackground style={{ flex: 1 }}>
      {/* Header */}
      <LinearGradient
        colors={["#0F1E30", "#0A1628"]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Saved Cases</Text>
            <Text style={styles.subtitle}>{caseList.length} case{caseList.length !== 1 ? "s" : ""} stored</Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: C.primary + "22", borderColor: C.primary + "44" }]}>
            <Text style={[styles.countText, { color: C.primary }]}>{caseList.length}</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
      </LinearGradient>

      <FlatList
        data={caseList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 16 }]}
        ListFooterComponent={<TabNavBar current="saved" />}
        showsVerticalScrollIndicator={false}
        scrollEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <>
                <Feather name="loader" size={36} color={C.border} />
                <Text style={styles.emptyText}>Loading cases…</Text>
              </>
            ) : (
              <>
                <View style={styles.emptyIcon}>
                  <Feather name="folder" size={40} color="#2A4060" />
                </View>
                <Text style={styles.emptyTitle}>No saved cases yet</Text>
                <Text style={styles.emptyText}>
                  Cases you save from Working Capital or Banking Analysis will appear here.
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isWC = item.caseType === "working_capital";
          const iconColor = isWC ? C.secondary : C.accent;
          const iconName = isWC ? "bar-chart-2" : "activity";
          const typeLabel = isWC ? "Working Capital" : "Banking";
          const wcResults = item.workingCapitalResults as any;
          const bankResults = item.bankingResults as any;
          const metric = isWC
            ? { label: "Eligibility", value: INR(wcResults?.eligibilityAmount) }
            : { label: "Score", value: bankResults?.overallScore ? bankResults.overallScore + "/100" : "—" };

          return (
            <LinearGradient
              colors={["#1A2C42", "#142030"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              {/* Accent bar */}
              <View style={[styles.cardBar, { backgroundColor: iconColor }]} />

              <View style={styles.cardRow}>
                <LinearGradient
                  colors={[iconColor + "30", iconColor + "15"]}
                  style={styles.iconBox}
                >
                  <Feather name={iconName as any} size={20} color={iconColor} />
                </LinearGradient>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.clientName ?? "Unnamed Case"}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.typePill, { backgroundColor: iconColor + "22" }]}>
                      <Text style={[styles.typeText, { color: iconColor }]}>{typeLabel}</Text>
                    </View>
                    <Text style={styles.cardDate}>{formatDate((item as any).createdAt)}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleDelete(item.id!, item.clientName ?? "this case")}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="trash-2" size={15} color={C.danger} />
                </TouchableOpacity>
              </View>

              {/* Key metric */}
              <LinearGradient
                colors={[iconColor + "18", iconColor + "08"]}
                style={[styles.metricRow, { borderColor: iconColor + "30" }]}
              >
                <Text style={[styles.metricLabel, { color: iconColor + "CC" }]}>{metric.label}</Text>
                <Text style={[styles.metricValue, { color: iconColor }]}>{metric.value}</Text>
              </LinearGradient>
            </LinearGradient>
          );
        }}
      />
    </PageBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  brand: {
    fontSize: 9, fontFamily: "Inter_700Bold", color: C.primary,
    letterSpacing: 2.5, marginBottom: 10, textTransform: "uppercase",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#E8F4FF" },
  subtitle: { fontSize: 13, color: "#7A9BB5", marginTop: 3, fontFamily: "Inter_400Regular" },
  countBadge: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  countText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerDivider: { height: 1, backgroundColor: "#1A2F45", marginTop: 16 },

  list: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: "#131F30", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#1E3048" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#4A6478" },
  emptyText: { fontSize: 13, color: "#3D5A74", fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },

  card: {
    borderRadius: 20, borderWidth: 1, borderColor: "#1E3A54",
    overflow: "hidden", padding: 16, gap: 12,
  },
  cardBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#E8F4FF" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  typePill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  typeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.4 },
  cardDate: { fontSize: 11, color: "#4A6478", fontFamily: "Inter_400Regular" },
  deleteBtn: { padding: 4 },

  metricRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
  },
  metricLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorFallback error={error} resetError={retry} />;
}
