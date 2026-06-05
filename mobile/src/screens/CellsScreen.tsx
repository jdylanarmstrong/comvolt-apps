import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useBatteryStore } from '../store/batteryStore';
import CellBars from '../components/CellBars';
import { colors, spacing, radius, fontSize } from '../theme';

export default function CellsScreen() {
  const { cells, status } = useBatteryStore(
    useShallow((s) => ({ cells: s.cells, status: s.status })),
  );

  if (!cells || cells.voltages.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Waiting for cell data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const voltages = cells.voltages;
  const min   = Math.min(...voltages);
  const max   = Math.max(...voltages);
  const delta = max - min;

  const isBalanced = delta <= 20; // within 20mV

  // Balance bits from status
  const balanceLow  = status?.balanceLow ?? 0;
  const balanceHigh = status?.balanceHigh ?? 0;
  const isBalancing = balanceLow !== 0 || balanceHigh !== 0;

  // The battery reports actual cell count in the status frame; the BLE broadcast
  // only exposes max/min voltages (not per-cell), so voltages.length is always 2.
  const cellCount = status?.cellCount ?? voltages.length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header stats */}
        <View style={styles.header}>
          <Text style={styles.title}>{cellCount} Cells</Text>
          <View style={[styles.badge, { borderColor: isBalanced ? colors.primary : colors.amber }]}>
            <Text style={[styles.badgeText, { color: isBalanced ? colors.primary : colors.amber }]}>
              {isBalancing ? 'Balancing' : isBalanced ? 'Balanced' : 'Imbalanced'}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'Min', value: `${min} mV`, color: colors.danger },
            { label: 'Max', value: `${max} mV`, color: colors.primary },
            { label: 'Δ',   value: `${delta} mV`, color: delta > 50 ? colors.danger : delta > 20 ? colors.amber : colors.primary },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.statBox}>
              <Text style={styles.statLabel}>{label}</Text>
              <Text style={[styles.statValue, { color }]}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.note}>BLE exposes max/min only — per-cell voltages not available</Text>

        {/* Cell bars */}
        <View style={styles.barsCard}>
          <CellBars voltages={voltages} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },

  badge: {
    borderWidth: 1.5, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  badgeText: { fontSize: fontSize.sm, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase' },
  statValue: { fontSize: fontSize.sm, fontWeight: '600' },

  barsCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md,
  },
  note: {
    fontSize: fontSize.xs, color: colors.textSecondary,
    textAlign: 'center', fontStyle: 'italic',
    marginTop: -spacing.xs,
  },
});
