import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@/constants/theme";

type Props = { label: string; selected?: boolean; onPress?: () => void; testID?: string };

export function Chip({ label, selected, onPress, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  selectedLabel: { color: colors.white },
});
