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
        tabBarInactiveTintColor: "#3D5468",
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#080F1E",
          borderTopWidth: 1,
          borderTopColor: "#1E3044",
          elevation: 0,
          height: 52,
        },
        tabBarLabelStyle: { fontSize: 8, fontFamily: "Inter_500Medium", marginBottom: 4 },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#080F1E" }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarActiveTintColor: C.primary,
          tabBarIcon: ({ color }) => <Feather name="home" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarActiveTintColor: C.primary,
          tabBarIcon: ({ color }) => <Feather name="activity" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "WC",
          tabBarActiveTintColor: C.secondary,
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="banking"
        options={{
          title: "Banking",
          tabBarActiveTintColor: C.accent,
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bank-outline" size={18} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="multiyear"
        options={{
          title: "Trend",
          tabBarActiveTintColor: C.success,
          tabBarIcon: ({ color }) => <Feather name="trending-up" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gst-itr"
        options={{
          title: "GST",
          tabBarActiveTintColor: "#8B6CC1",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Cases",
          tabBarActiveTintColor: "#C47A3A",
          tabBarIcon: ({ color }) => <Feather name="folder" size={18} color={color} />,
        }}
      />
    </Tabs>
  );
}
