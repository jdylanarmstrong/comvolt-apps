import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBatteryStore } from '../store/batteryStore';
import { PROTECTION_FLAGS } from '../ble/JbdProtocol';
import { colors, spacing, radius, fontSize } from '../theme';

const FLAG_DESCRIPTIONS: Record<number, string> = {
  0:  'A cell voltage exceeded the upper threshold.',
  1:  'A cell voltage dropped below the lower threshold.',
  2:  'Total pack voltage is too high.',
  3:  'Total pack voltage is too low.',
  4:  'Battery temperature exceeded limit while charging.',
  5:  'Battery temperature is too low to charge safely.',
  6:  'Battery temperature exceeded limit while discharging.',
  7:  'Battery temperature is too low to discharge.',
  8:  'Charge current exceeded the rated maximum.',
  9:  'Discharge current exceeded the rated maximum.',
  10: 'Short circuit detected on the output.',
  11: 'Internal BMS measurement IC error.',
  12: 'FETs locked off via software command.',
};

export default function AlarmsScreen() {
  const status = useBatteryStore((s) => s.status);
  const flags  = status?.protectionFlags ?? 0;
  const allClear = flags === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Protection Alarms</Text>

        {allClear && (
          <View style={styles.allClear}>
            <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            <Text style={styles.allClearText}>All Clear</Text>
            <Text style={styles.allClearSub}>No active faults detected</Text>
          </View>
        )}

        {!status && (
          <Text style={styles.noData}>Waiting for BMS data…</Text>
        )}

        {Object.entries(PROTECTION_FLAGS).map(([bitStr, label]) => {
          const bit    = Number(bitStr);
          const active = (flags & (1 << bit)) !== 0;
          return (
            <View key={bit} style={[styles.row, active && styles.rowActive]}>
              <Ionicons
                name={active ? 'alert-circle' : 'checkmark-circle-outline'}
                size={22}
                color={active ? colors.danger : colors.primary}
              />
              <View style={styles.rowContent}>
                <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{label}</Text>
                {active && (
                  <Text style={styles.rowDesc}>{FLAG_DESCRIPTIONS[bit]}</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },

  allClear: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  allClearText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.primary },
  allClearSub: { fontSize: fontSize.md, color: colors.textSecondary },

  noData: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.lg },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md,
  },
  rowActive: { borderWidth: 1, borderColor: colors.danger },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: fontSize.sm, color: colors.textPrimary },
  rowLabelActive: { color: colors.danger, fontWeight: '600' },
  rowDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4, lineHeight: 16 },
});
