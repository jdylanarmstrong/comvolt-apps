import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { Device } from 'react-native-ble-plx';
import { Ionicons } from '@expo/vector-icons';

import { bleService } from '../ble/BleService';
import { useBatteryStore } from '../store/batteryStore';
import { colors, spacing, radius, fontSize } from '../theme';

function rssiToSignal(rssi: number | null): number {
  if (rssi === null) return 0;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

export default function ScanScreen() {
  const connectionStatus = useBatteryStore((s) => s.connectionStatus);
  const [devices, setDevices] = useState<Device[]>([]);
  const [savedDevice, setSavedDevice] = useState<{ id: string; name: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [permissionShown, setPermissionShown] = useState(false);
  const deviceMap = useRef<Map<string, Device>>(new Map());

  useEffect(() => {
    bleService.loadSavedDevice().then(setSavedDevice);
  }, []);

  const isScanning = connectionStatus === 'scanning';
  const isBtOff    = connectionStatus === 'bluetooth_off';

  function handleDevice(d: Device) {
    if (!deviceMap.current.has(d.id)) {
      deviceMap.current.set(d.id, d);
      setDevices(Array.from(deviceMap.current.values()));
    }
  }

  function startScan() {
    setTimedOut(false);
    deviceMap.current.clear();
    setDevices([]);
    bleService.startScan(handleDevice, () => setTimedOut(true));
  }

  async function connectTo(id: string, name: string) {
    bleService.stopScan();
    setConnectingId(id);
    try {
      await bleService.connect(id, name);
    } catch (err: any) {
      setConnectingId(null);
      Alert.alert('Connection Failed', err?.message ?? 'Could not connect. Make sure the battery is on.');
    }
  }

  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Comvolt</Text>
          <Text style={styles.subtitle}>Battery Monitor</Text>
        </View>

        {/* Bluetooth off */}
        {isBtOff && (
          <View style={styles.btOffBanner}>
            <Ionicons name="bluetooth-outline" size={20} color={colors.danger} />
            <Text style={styles.btOffText}>Bluetooth is off — enable it in Settings</Text>
          </View>
        )}

        {/* Saved device reconnect banner */}
        {savedDevice && !isConnecting && !isScanning && (
          <TouchableOpacity
            style={styles.reconnectBanner}
            onPress={() => connectTo(savedDevice.id, savedDevice.name)}
          >
            <Ionicons name="link-outline" size={18} color={colors.primary} />
            <Text style={styles.reconnectText}>Reconnect to {savedDevice.name}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Permission explanation (shown once before first scan) */}
        {!permissionShown && (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Comvolt uses Bluetooth to connect to your battery system. No location data is collected.
            </Text>
          </View>
        )}

        {/* Scan / connecting state */}
        {isConnecting ? (
          <View style={styles.connectingBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.connectingText}>
              {connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.scanBtn, (isScanning || isBtOff) && styles.scanBtnDisabled]}
              onPress={() => {
                setPermissionShown(true);
                isScanning ? bleService.stopScan() : startScan();
              }}
              disabled={isBtOff}
            >
              {isScanning
                ? <ActivityIndicator color={colors.background} size="small" />
                : <Ionicons name="search-outline" size={18} color={colors.background} />}
              <Text style={styles.scanBtnText}>
                {isScanning ? 'Scanning…' : 'Scan for Battery'}
              </Text>
            </TouchableOpacity>

            {timedOut && devices.length === 0 && (
              <Text style={styles.noDevices}>
                No devices found — make sure the battery is powered on, then tap Scan again.
              </Text>
            )}

            <FlatList
              data={devices}
              keyExtractor={(d) => d.id}
              style={styles.list}
              contentContainerStyle={{ gap: spacing.sm }}
              renderItem={({ item }) => {
                const signal = rssiToSignal(item.rssi);
                const isThis = connectingId === item.id;
                return (
                  <TouchableOpacity
                    style={styles.deviceCard}
                    onPress={() => connectTo(item.id, item.name ?? 'Battery')}
                    disabled={connectingId !== null}
                  >
                    <View style={styles.deviceLeft}>
                      <Text style={styles.deviceName}>{item.name ?? 'Unknown'}</Text>
                      <Text style={styles.deviceId}>{item.id}</Text>
                    </View>
                    <View style={styles.deviceRight}>
                      <Text style={styles.rssi}>{item.rssi} dBm</Text>
                      <View style={styles.signalBars}>
                        {[1, 2, 3, 4].map((bar) => (
                          <View
                            key={bar}
                            style={[
                              styles.bar,
                              { height: bar * 4, opacity: bar <= signal ? 1 : 0.2 },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.md },
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  title: { fontSize: 32, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 4 },

  btOffBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.danger,
  },
  btOffText: { color: colors.danger, fontSize: fontSize.sm, flex: 1 },

  reconnectBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.primary,
  },
  reconnectText: { color: colors.primary, fontSize: fontSize.md, flex: 1 },

  permissionBox: {
    backgroundColor: colors.surfaceRaised, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  permissionText: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },

  connectingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  connectingText: { color: colors.textSecondary, fontSize: fontSize.md },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  scanBtnDisabled: { opacity: 0.4 },
  scanBtnText: { color: colors.background, fontWeight: '600', fontSize: fontSize.md },

  noDevices: {
    color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center',
    marginBottom: spacing.md, lineHeight: 20,
  },

  list: { flex: 1 },
  deviceCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, flexDirection: 'row', alignItems: 'center',
  },
  deviceLeft: { flex: 1 },
  deviceName: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: '600' },
  deviceId: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, fontFamily: 'monospace' },
  deviceRight: { alignItems: 'flex-end', gap: 4 },
  rssi: { color: colors.textMuted, fontSize: fontSize.xs },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, backgroundColor: colors.primary, borderRadius: 2 },
});
