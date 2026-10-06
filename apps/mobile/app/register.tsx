import { Link } from "expo-router";
import { SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

export default function RegisterScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ÑOLA CALCULATION SUITES</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.copy}>
          A verified email address is required before any calculation module can
          be opened.
        </Text>
        <TextInput
          style={styles.input}
          inputMode="email"
          autoCapitalize="none"
          placeholder="Email address"
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Create password"
        />
        <View style={styles.disabledButton}>
          <Text style={styles.buttonText}>Create account</Text>
        </View>
        <Text style={styles.notice}>
          Managed identity integration is enabled in milestone 0.2. This preview
          fails closed.
        </Text>
        <Text style={styles.switch}>
          Already registered?{" "}
          <Link href="/login" style={styles.link}>
            Log in
          </Link>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F7FB", padding: 24 },
  content: { flex: 1, justifyContent: "center", gap: 16 },
  eyebrow: {
    color: "#6750A4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: "#172033",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1,
  },
  copy: { color: "#667085", fontSize: 16, lineHeight: 24 },
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
