import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useBatteryStore } from '../store/batteryStore';
import { bleService } from '../ble/BleService';
import { colors, spacing, radius, fontSize } from '../theme';

export default function SettingsScreen() {
  const { status, deviceName } = useBatteryStore(
    useShallow((s) => ({
      status: s.status,
      deviceName: s.deviceName,
    })),
  );

  async function handleDisconnect() {
    await bleService.disconnect();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>

        {/* Device info — only fields the protocol actually exposes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device</Text>
          <InfoRow label="Name"       value={deviceName ?? '—'} />
          <InfoRow label="Capacity"   value={status ? `${status.nominalAh.toFixed(1)} Ah` : '—'} />
          <InfoRow label="Cell count" value={status ? String(status.cellCount) : '—'} />
        </View>

        {/* Control — not yet available on this protocol */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Control</Text>
          <Text style={styles.note}>
            Switching the main output, inverter, and AC/DC channels isn't available yet — the
            write commands for this battery's protocol haven't been decoded. The app is
            read-only for now. Use the stock app or the 7" screen to toggle outputs.
          </Text>
        </View>

        {/* Disconnect */}
        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
          <Ionicons name="power-outline" size={18} color={colors.danger} />
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },

  section: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs,
  },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '500' },

  note: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },

  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, borderWidth: 1.5, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md,
  },
  disconnectText: { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
});
