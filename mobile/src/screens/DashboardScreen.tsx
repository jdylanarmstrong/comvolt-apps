import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useShallow } from 'zustand/react/shallow';
import { useBatteryStore } from '../store/batteryStore';
import { PROTECTION_FLAGS } from '../ble/JbdProtocol';
import SocGauge from '../components/SocGauge';
import StatCard from '../components/StatCard';
import { colors, spacing, radius, fontSize } from '../theme';

function formatTimeRemaining(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0) return `~${h}h ${m}m`;
  return `~${m}m`;
}

function useSecondsTicker() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

export default function DashboardScreen() {
  const { status, lastUpdated, prevProtectionFlags, deviceName, outputs } = useBatteryStore(
    useShallow((s) => ({
      status: s.status,
      lastUpdated: s.lastUpdated,
      prevProtectionFlags: s.prevProtectionFlags,
      deviceName: s.deviceName,
      outputs: s.outputs,
    })),
  );

  const tick = useSecondsTicker();
  const faultAlertShown = useRef(false);

  // Proactively alert on newly-tripped protection flags
  useEffect(() => {
    if (!status) return;
    const newFaults = status.protectionFlags & ~prevProtectionFlags;
    if (newFaults !== 0) {
      const names = Object.entries(PROTECTION_FLAGS)
        .filter(([bit]) => (newFaults & (1 << Number(bit))) !== 0)
        .map(([, label]) => label)
        .join('\n• ');
      Alert.alert('⚠️ Battery Fault', `The following protection triggered:\n• ${names}`, [{ text: 'View Alarms', style: 'default' }]);
    }
  }, [status?.protectionFlags]);

  if (!status) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Waiting for data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const power       = status.voltage * status.current;
  const isCharging  = status.current < -0.1;
  const isIdle      = Math.abs(status.current) <= 0.1;
  const isDischarging = status.current > 0.1;

  // Time estimate (guard against zero current)
  let timeEstimate = '—';
  if (isCharging && Math.abs(status.current) > 0.1) {
    const ahNeeded = status.nominalAh - status.remainAh;
    const hrs = ahNeeded / Math.abs(status.current);
    if (isFinite(hrs) && hrs > 0) timeEstimate = `${formatTimeRemaining(hrs)} to full`;
  } else if (isDischarging && status.current > 0.1) {
    const hrs = status.remainAh / status.current;
    if (isFinite(hrs) && hrs > 0) timeEstimate = `${formatTimeRemaining(hrs)} remaining`;
  }

  // Stale indicator
  const secondsAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated) / 1000) : null;
  const isStale = secondsAgo !== null && secondsAgo > 10;

  const statusLabel = isCharging ? 'CHARGING' : isDischarging ? 'DISCHARGING' : 'IDLE';
  const statusColor = isCharging ? colors.charging : isDischarging ? colors.discharging : colors.idle;

  const currentStr = `${status.current >= 0 ? '+' : ''}${status.current.toFixed(2)}`;
  const powerStr   = `${power >= 0 ? '+' : ''}${Math.round(power)}`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.deviceName}>{deviceName ?? 'Comvolt'}</Text>
          <View style={styles.connectedRow}>
            <View style={styles.dot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        </View>

        {/* SOC Gauge */}
        <View style={styles.gaugeContainer}>
          <SocGauge
            soc={status.soc}
            voltage={status.voltage}
            isCharging={isCharging}
            isIdle={isIdle}
            size={200}
          />
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {/* Stat cards */}
        <View style={styles.cardGrid}>
          <View style={styles.cardRow}>
            <StatCard label="Voltage" value={status.voltage.toFixed(2)} unit="V" />
            <View style={{ width: spacing.sm }} />
            <StatCard
              label="Current"
              value={currentStr}
              unit="A"
              valueColor={isCharging ? colors.charging : isDischarging ? colors.discharging : colors.textPrimary}
            />
          </View>
          <View style={styles.cardRow}>
            <StatCard
              label="Power"
              value={powerStr}
              unit="W"
              valueColor={isCharging ? colors.charging : isDischarging ? colors.discharging : colors.textPrimary}
            />
            <View style={{ width: spacing.sm }} />
            <StatCard label="Remaining" value={status.remainAh.toFixed(1)} unit="Ah" />
          </View>
        </View>

        {/* Time estimate */}
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.infoText}>{timeEstimate}</Text>
        </View>

        {/* DC input (charging) */}
        {outputs && outputs.dcInputW > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="battery-charging-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.infoText}>DC input: {outputs.dcInputW} W</Text>
          </View>
        )}

        {/* AC output */}
        {outputs && outputs.acOutputW > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="flash-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.infoText}>AC output: {outputs.acOutputW} W</Text>
          </View>
        )}

        {/* Temperatures */}
        {status.temps.length > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="thermometer-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.infoText}>
              {status.temps.map((t, i) => `Sensor ${i + 1}: ${t.toFixed(1)}°C`).join('  ·  ')}
            </Text>
          </View>
        )}

        {/* Fault indicator */}
        {status.protectionFlags !== 0 && (
          <View style={styles.faultBanner}>
            <Ionicons name="warning" size={16} color={colors.danger} />
            <Text style={styles.faultText}>
              {Object.entries(PROTECTION_FLAGS)
                .filter(([bit]) => (status.protectionFlags & (1 << Number(bit))) !== 0)
                .map(([, label]) => label)
                .join(', ')}
            </Text>
          </View>
        )}

        {/* Stale data indicator */}
        {secondsAgo !== null && (
          <Text style={[styles.lastUpdated, isStale && styles.lastUpdatedStale]}>
            {isStale ? `⚠ Data stale — last updated ${secondsAgo}s ago` : `Updated ${secondsAgo}s ago`}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deviceName: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textPrimary },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  connectedText: { fontSize: fontSize.sm, color: colors.primary },

  gaugeContainer: { alignItems: 'center', marginVertical: spacing.sm },

  statusBadge: {
    alignSelf: 'center', borderWidth: 1.5, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  statusText: { fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 1.5 },

  cardGrid: { gap: spacing.sm },
  cardRow: { flexDirection: 'row' },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm,
  },
  infoText: { color: colors.textSecondary, fontSize: fontSize.sm },

  faultBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.danger,
  },
  faultText: { color: colors.danger, fontSize: fontSize.sm, flex: 1, lineHeight: 18 },

  lastUpdated: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted },
  lastUpdatedStale: { color: colors.amber },
});
