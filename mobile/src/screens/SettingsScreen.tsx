import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, Alert,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBatteryStore } from '../store/batteryStore';
import { bleService } from '../ble/BleService';
import { buildFetCmd } from '../ble/JbdProtocol';
import { colors, spacing, radius, fontSize } from '../theme';

export default function SettingsScreen() {
  const { status, deviceName } = useBatteryStore((s) => ({
    status: s.status,
    deviceName: s.deviceName,
  }));
  const [fetBusy, setFetBusy] = useState(false);

  async function handleDischargeToggle() {
    if (!status) return;
    const willBeOff = status.dischargeFetOn;

    if (willBeOff) {
      // First confirmation
      Alert.alert(
        'Cut Discharge Power?',
        'This will immediately cut power to all connected loads — inverter, DC outputs, everything. This cannot be undone from the battery itself.\n\nAre you sure?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            style: 'destructive',
            onPress: () => {
              // Second confirmation
              Alert.alert(
                'Confirm Power Cut',
                'Tap "Cut Power" to turn off the discharge FET now. BMS hardware protection will still operate normally.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Cut Power',
                    style: 'destructive',
                    onPress: () => sendFet(status.chargeFetOn, false),
                  },
                ],
              );
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Enable Discharge?',
        'This will restore discharge power to all outputs.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => sendFet(status.chargeFetOn, true) },
        ],
      );
    }
  }

  async function sendFet(chargeOn: boolean, dischargeOn: boolean) {
    setFetBusy(true);
    try {
      await bleService.sendFetCommand(buildFetCmd(chargeOn, dischargeOn));
      // BleService re-polls status after 500ms; store will update automatically.
      // If the next poll shows the bit didn't change, the user will see it.
    } catch (err: any) {
      Alert.alert('Command Failed', err?.message ?? 'Could not send FET command.');
    } finally {
      setFetBusy(false);
    }
  }

  async function handleDisconnect() {
    await bleService.disconnect();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>

        {/* Device info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device</Text>
          <InfoRow label="Name"     value={deviceName ?? '—'} />
          <InfoRow label="SW Version" value={status ? `v${status.swVersion}` : '—'} />
          <InfoRow label="Produced"   value={status?.productionDate ?? '—'} />
          <InfoRow label="Capacity"   value={status ? `${status.nominalAh.toFixed(1)} Ah` : '—'} />
          <InfoRow label="Cycles"     value={status ? String(status.cycles) : '—'} />
          <InfoRow label="Cell count" value={status ? String(status.cellCount) : '—'} />
          <InfoRow label="Temp sensors" value={status ? String(status.ntcCount) : '—'} />
        </View>

        {/* FET control */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FET Control</Text>
          <Text style={styles.fetNote}>
            BMS hardware protection (overvoltage, overcurrent, overtemperature) always overrides these controls.
          </Text>

          {/* Charge FET — lower risk, simpler confirmation */}
          <View style={styles.fetRow}>
            <View style={styles.fetLabel}>
              <Text style={styles.fetName}>Charge FET</Text>
              <Text style={styles.fetDesc}>
                {status?.chargeFetOn ? 'On — battery is accepting charge' : 'Off — charging blocked'}
              </Text>
            </View>
            {fetBusy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={status?.chargeFetOn ?? false}
                onValueChange={(on) => sendFet(on, status?.dischargeFetOn ?? true)}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.textPrimary}
                disabled={!status}
              />
            )}
          </View>

          {/* Discharge FET — higher risk, double confirmation */}
          <View style={styles.fetRow}>
            <View style={styles.fetLabel}>
              <Text style={styles.fetName}>Discharge FET</Text>
              <Text style={[styles.fetDesc, !status?.dischargeFetOn && { color: colors.danger }]}>
                {status?.dischargeFetOn ? 'On — loads receiving power' : 'Off — all loads cut'}
              </Text>
            </View>
            {fetBusy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={status?.dischargeFetOn ?? false}
                onValueChange={handleDischargeToggle}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={status?.dischargeFetOn ? colors.textPrimary : colors.danger}
                disabled={!status}
              />
            )}
          </View>
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

  fetNote: {
    fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16,
    borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: spacing.sm,
  },
  fetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  fetLabel: { flex: 1 },
  fetName: { fontSize: fontSize.md, color: colors.textPrimary, fontWeight: '500' },
  fetDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  disconnectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, borderWidth: 1.5, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md,
  },
  disconnectText: { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
});
