import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBatteryStore } from '../store/batteryStore';
import { colors, spacing, radius, fontSize } from '../theme';

export default function AlarmsScreen() {
  const status = useBatteryStore((s) => s.status);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Alarms</Text>

        {!status ? (
          <Text style={styles.noData}>Waiting for battery data…</Text>
        ) : (
          <>
            {/* Honest state: the protocol's fault/status byte isn't decoded yet,
                so we can't claim to detect specific faults. */}
            <View style={styles.card}>
              <Ionicons name="information-circle-outline" size={28} color={colors.blue} />
              <Text style={styles.cardTitle}>Fault detection not available yet</Text>
              <Text style={styles.cardBody}>
                This battery's protection/fault status bytes haven't been decoded from its
                Bluetooth protocol yet, so the app can't list specific alarms here. As soon as
                we capture a fault event, individual alarms will appear.
              </Text>
            </View>

            <View style={styles.noteCard}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              <Text style={styles.noteText}>
                The battery's own BMS hardware protection (over/under-voltage, over-current,
                over-temperature, short circuit) operates independently and is always active —
                it does not depend on this app.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },

  noData: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.lg },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.lg, gap: spacing.sm, alignItems: 'flex-start',
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  cardBody: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },

  noteCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
  },
  noteText: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
});
