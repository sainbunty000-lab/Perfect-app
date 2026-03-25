import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Working Capital</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="banking">
        <Icon sf={{ default: "building.columns", selected: "building.columns.fill" }} />
        <Label>Banking</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gst-itr">
        <Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        <Label>GST & ITR</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <Icon sf={{ default: "folder", selected: "folder.fill" }} />
        <Label>Saved Cases</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : C.card,
          borderTopWidth: 1,
          borderTopColor: C.border,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontFamily: "Inter_500Medium" },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.card }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "WC Analysis",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="banking"
        options={{
          title: "Banking",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="bank-outline" size={21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gst-itr"
        options={{
          title: "GST & ITR",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={21} color={color} />,
          tabBarActiveTintColor: "#A855F7",
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved Cases",
          tabBarIcon: ({ color }) => <Feather name="folder" size={21} color={color} />,
          tabBarActiveTintColor: "#F5832A",
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
