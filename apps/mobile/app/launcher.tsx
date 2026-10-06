import { moduleRegistry } from "@nola/calc-core";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

export default function LauncherScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>CALCULATION LAUNCHER</Text>
        <Text style={styles.title}>Choose a workflow</Text>
        <Text style={styles.copy}>
          Pilot modules are shown first. Access will be protected by the managed
          session adapter.
        </Text>
        {moduleRegistry.map((module) => (
          <View style={styles.card} key={module.slug}>
            <View style={styles.icon}>
              <Text style={styles.iconText}>
                {module.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.discipline}>{module.discipline}</Text>
              <Text style={styles.name}>{module.name}</Text>
              <Text style={styles.summary}>{module.summary}</Text>
            </View>
            <Text style={styles.phase}>{module.releasePhase}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F7FB" },
  content: { padding: 22, gap: 14 },
  eyebrow: {
    marginTop: 18,
    color: "#6750A4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: "#172033",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1,
  },
  copy: { color: "#667085", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  card: {
    position: "relative",
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D9DDE8",
    borderRadius: 18,
    backgroundColor: "white",
  },
  icon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#6750A4",
  },
  iconText: { color: "white", fontWeight: "900" },
  cardBody: { flex: 1, paddingRight: 56 },
  discipline: { color: "#667085", fontSize: 11 },
  name: { marginTop: 4, color: "#172033", fontSize: 18, fontWeight: "800" },
  summary: { marginTop: 6, color: "#667085", lineHeight: 19 },
  phase: {
    position: "absolute",
    right: 14,
    top: 14,
    color: "#6750A4",
    fontSize: 11,
    fontWeight: "900",
  },
});
