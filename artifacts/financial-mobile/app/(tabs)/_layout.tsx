import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: "#3D5A74",
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#0A1628",
          borderTopWidth: 1,
          borderTopColor: "#1E3A54",
          elevation: 0,
          height: 58,
        },
        tabBarLabelStyle: { fontSize: 9, fontFamily: "Inter_500Medium", marginBottom: 4 },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A1628" }]} />
          ),
      }}
    >
      {/* 1. Dashboard — first screen users see */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Dashboard",
          tabBarActiveTintColor: C.primary,
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />

      {/* 2. Working Capital */}
      <Tabs.Screen
        name="index"
        options={{
          title: "WC Analysis",
          tabBarActiveTintColor: "#4A9EFF",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={20} color={color} />,
        }}
      />

      {/* 3. Banking */}
      <Tabs.Screen
        name="banking"
        options={{
          title: "Banking",
          tabBarActiveTintColor: "#D4A800",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bank-outline" size={20} color={color} />
          ),
        }}
      />

      {/* 4. Multi-Year Analysis */}
      <Tabs.Screen
        name="multiyear"
        options={{
          title: "Multi-Year",
          tabBarActiveTintColor: "#10B981",
          tabBarIcon: ({ color }) => <Feather name="trending-up" size={20} color={color} />,
        }}
      />

      {/* 5. GST & ITR */}
      <Tabs.Screen
        name="gst-itr"
        options={{
          title: "GST & ITR",
          tabBarActiveTintColor: "#A855F7",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={20} color={color} />,
        }}
      />

      {/* 6. Saved Cases */}
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarActiveTintColor: "#F5832A",
          tabBarIcon: ({ color }) => <Feather name="folder" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
