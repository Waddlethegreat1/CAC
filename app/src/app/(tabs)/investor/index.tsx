import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon } from "@/components/icon";
import { colors, layout, radius, type } from "@/constants/theme";

export default function InvestorPlaceholder() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>Scouting</Text>
      <View style={styles.empty}>
        <View style={styles.glyph}>
          <Icon name="trending-up" size={22} color={colors.gold} />
        </View>
        <Text style={styles.line}>Investor mode is on its way</Text>
        <Text style={styles.sub}>Student-led events ranked by investor signal will show here</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: layout.screenPadding },
  title: { ...type.screenTitle, color: colors.ink, paddingVertical: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 80 },
  glyph: { width: 48, height: 48, borderRadius: radius.card, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  line: { ...type.bodyStrong, fontSize: 16, color: colors.ink },
  sub: { ...type.meta, color: colors.muted, textAlign: "center" },
});
