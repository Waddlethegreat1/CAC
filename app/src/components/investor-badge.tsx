import { StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";

export function InvestorBadge({ score }: { score: number }) {
  if (score < 60) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>💰 Investors likely</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: colors.moneySoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  text: { color: colors.money, fontSize: 12, fontWeight: "700" },
});
