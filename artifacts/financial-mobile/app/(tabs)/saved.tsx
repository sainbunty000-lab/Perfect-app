import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useListCases, useDeleteCase } from "@workspace/api-client-react";
import Colors from "@/constants/colors";

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
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.brand}>DHANUSH ENTERPRISES</Text>
        <Text style={styles.title}>Saved Cases</Text>
        <Text style={styles.subtitle}>{caseList.length} case{caseList.length !== 1 ? "s" : ""} stored</Text>
      </View>

      <FlatList
        data={caseList}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!caseList.length}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {isLoading ? (
              <Text style={styles.emptyText}>Loading cases…</Text>
            ) : (
              <>
                <Feather name="folder" size={48} color={C.border} />
                <Text style={styles.emptyTitle}>No saved cases</Text>
                <Text style={styles.emptyText}>Cases saved from Working Capital or Banking Analysis will appear here.</Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isWC = item.caseType === "working_capital";
          const iconColor = isWC ? C.secondary : C.accent;
          const iconName = isWC ? "bar-chart-2" : "activity";
          const typeLabel = isWC ? "Working Capital" : "Banking";

          // Try to get a key metric
          const wcResults = item.workingCapitalResults as any;
          const bankResults = item.bankingResults as any;
          const metric = isWC
            ? { label: "Eligibility", value: INR(wcResults?.eligibilityAmount) }
            : { label: "Score", value: bankResults?.overallScore ? bankResults.overallScore + "/100" : "—" };

          return (
            <View style={styles.card}>
              {/* Icon & Type */}
              <View style={styles.cardRow}>
                <View style={[styles.iconBox, { backgroundColor: iconColor + "20" }]}>
                  <Feather name={iconName} size={20} color={iconColor} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.clientName ?? "Unnamed Case"}</Text>
                  <Text style={styles.cardMeta}>
                    {typeLabel} · {formatDate((item as any).createdAt)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(item.id!, item.clientName ?? "this case")}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={16} color={C.danger} />
                </TouchableOpacity>
              </View>

              {/* Key Metric */}
              <View style={[styles.metricRow, { backgroundColor: iconColor + "10", borderColor: iconColor + "30" }]}>
                <Text style={[styles.metricLabel, { color: iconColor }]}>{metric.label}</Text>
                <Text style={[styles.metricValue, { color: iconColor }]}>{metric.value}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#1A2A3D" },
  brand: { fontSize: 9, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: C.text },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2, fontFamily: "Inter_400Regular" },

  list: { paddingHorizontal: 18, paddingTop: 16, gap: 12 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.textSecondary },
  emptyText: { fontSize: 13, color: C.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },

  card: { backgroundColor: "#1A2A3D", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#253B52", gap: 12 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.text },
  cardMeta: { fontSize: 11, color: C.textSecondary, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: { padding: 4 },

  metricRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
  },
  metricLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
