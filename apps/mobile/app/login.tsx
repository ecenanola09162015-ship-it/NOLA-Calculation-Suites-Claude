import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

export default function LoginScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Text style={styles.markText}>Ñ</Text>
        </View>
        <View>
          <Text style={styles.brandName}>ÑOLA</Text>
          <Text style={styles.brandSub}>Calculation Suites</Text>
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SECURE ACCOUNT ACCESS</Text>
        <Text style={styles.title}>Log in to continue</Text>
        <Text style={styles.copy}>
          Your projects and calculation history stay synchronized across
          desktop, web, and mobile.
        </Text>
        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="engineer@example.com"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          autoComplete="current-password"
          placeholder="••••••••••••"
        />
        <View style={styles.disabledButton}>
          <Text style={styles.buttonText}>Log in</Text>
        </View>
        <Text style={styles.notice}>
          Managed identity integration is enabled in milestone 0.2. This preview
          fails closed.
        </Text>
        <Text style={styles.switch}>
          New to ÑOLA?{" "}
          <Link href="/register" style={styles.link}>
            Create an account
          </Link>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F7FB", padding: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6750A4",
  },
  markText: { color: "white", fontSize: 28, fontWeight: "900" },
  brandName: {
    color: "#172033",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  brandSub: { color: "#667085" },
  content: { flex: 1, justifyContent: "center", gap: 14 },
  eyebrow: {
    color: "#6750A4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: "#172033",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1,
  },
  copy: { color: "#667085", fontSize: 16, lineHeight: 24, marginBottom: 10 },
  label: { color: "#172033", fontSize: 13, fontWeight: "800" },
  input: {
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: "#D9DDE8",
    borderRadius: 12,
    backgroundColor: "white",
  },
  disabledButton: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#9B8AC5",
    marginTop: 4,
  },
  buttonText: { color: "white", fontWeight: "900" },
  notice: {
    padding: 12,
    borderRadius: 10,
    color: "#7A4B00",
    backgroundColor: "#FFF4D6",
    fontSize: 12,
    lineHeight: 18,
  },
  switch: { color: "#667085", textAlign: "center" },
  link: { color: "#6750A4", fontWeight: "800" },
});
