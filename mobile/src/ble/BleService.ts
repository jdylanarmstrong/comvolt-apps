import { BleManager, Device, Subscription, State } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SERVICE_UUID, WRITE_UUID, NOTIFY_UUID,
  CMD_READ_STATUS, CMD_READ_CELLS,
  FrameBuffer,
  uint8ToBase64, base64ToUint8, toHexString,
} from './JbdProtocol';
import { useBatteryStore, ConnectionStatus } from '../store/batteryStore';
import { logger } from '../store/logStore';

const SAVED_DEVICE_KEY = '@comvolt_device_id';
const SAVED_DEVICE_NAME_KEY = '@comvolt_device_name';
const POLL_INTERVAL_MS = 3000;
const SCAN_TIMEOUT_MS = 15000;
const CONNECT_TIMEOUT_MS = 10000;
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

class BleService {
  private readonly manager = new BleManager();
  private device: Device | null = null;
  private notifySub: Subscription | null = null;
  private stateChangeSub: Subscription | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollCount = 0;
  private frameBuffer = new FrameBuffer();
  private reconnectCancelled = false;
  private savedDeviceId: string | null = null;
  private savedDeviceName: string | null = null;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  constructor() {
    this.stateChangeSub = this.manager.onStateChange((state) => {
      if (state === State.PoweredOff) {
        logger.warn('APP', 'Bluetooth powered off');
        this.setStatus('bluetooth_off');
        this.cleanup(false);
      } else if (state === State.PoweredOn) {
        logger.info('APP', 'Bluetooth powered on');
        if (this.getStatus() === 'bluetooth_off') {
          this.setStatus('idle');
        }
      }
    }, true);
  }

  private getStatus(): ConnectionStatus {
    return useBatteryStore.getState().connectionStatus;
  }

  private setStatus(s: ConnectionStatus) {
    useBatteryStore.getState().setConnectionStatus(s);
  }

  // ─── Saved Device ──────────────────────────────────────────────────────────

  async loadSavedDevice(): Promise<{ id: string; name: string } | null> {
    const [id, name] = await Promise.all([
      AsyncStorage.getItem(SAVED_DEVICE_KEY),
      AsyncStorage.getItem(SAVED_DEVICE_NAME_KEY),
    ]);
    if (id) {
      this.savedDeviceId = id;
      this.savedDeviceName = name ?? 'Battery';
      return { id, name: this.savedDeviceName };
    }
    return null;
  }

  private async saveDevice(id: string, name: string) {
    this.savedDeviceId = id;
    this.savedDeviceName = name;
    await Promise.all([
      AsyncStorage.setItem(SAVED_DEVICE_KEY, id),
      AsyncStorage.setItem(SAVED_DEVICE_NAME_KEY, name),
    ]);
  }

  private async clearSavedDevice() {
    this.savedDeviceId = null;
    this.savedDeviceName = null;
    await Promise.all([
      AsyncStorage.removeItem(SAVED_DEVICE_KEY),
      AsyncStorage.removeItem(SAVED_DEVICE_NAME_KEY),
    ]);
  }

  // ─── Scan ──────────────────────────────────────────────────────────────────

  startScan(onDevice: (d: Device) => void, onTimeout: () => void): void {
    if (this.getStatus() === 'bluetooth_off') return;

    this.setStatus('scanning');
    logger.info('APP', `Scanning for JBD BMS (service ${SERVICE_UUID})`);

    this.manager.startDeviceScan(
      [SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          logger.error('BLE', 'Scan error: ' + error.message);
          this.setStatus('idle');
          return;
        }
        if (device) {
          logger.debug('BLE', `Found: ${device.name ?? 'unnamed'} (${device.id}) RSSI:${device.rssi}`);
          onDevice(device);
        }
      },
    );

    this.scanTimer = setTimeout(() => {
      this.manager.stopDeviceScan();
      this.setStatus('idle');
      logger.info('APP', 'Scan timed out after 15s');
      onTimeout();
    }, SCAN_TIMEOUT_MS);
  }

  stopScan(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.manager.stopDeviceScan();
    this.setStatus('idle');
    logger.info('APP', 'Scan stopped by user');
  }

  // ─── Connect ───────────────────────────────────────────────────────────────

  async connect(deviceId: string, deviceName: string): Promise<void> {
    this.reconnectCancelled = false;
    try {
      await this.connectInternal(deviceId, deviceName);
    } catch (err) {
      // Manual connect failed (e.g. out of range / timed out). Reset state so
      // the UI doesn't stay stuck on the "Connecting…" spinner.
      this.cleanup(false);
      this.setStatus('idle');
      throw err;
    }
  }

  private async connectInternal(deviceId: string, deviceName: string): Promise<void> {
    this.setStatus('connecting');
    logger.info('APP', `Connecting to ${deviceName} (${deviceId})`);

    try {
      this.device = await this.manager.connectToDevice(deviceId, {
        timeout: CONNECT_TIMEOUT_MS,
        requestMTU: 512,
      });
      // requestMTU resolves to the Device with the negotiated .mtu number.
      const negotiated = await this.device.requestMTU(512);
      logger.info('APP', `Connected. MTU=${negotiated.mtu}`);

      this.setStatus('connecting'); // still discovering
      await this.device.discoverAllServicesAndCharacteristics();
      logger.info('APP', 'Services discovered');

      this.frameBuffer.clear();

      this.notifySub = this.device.monitorCharacteristicForService(
        SERVICE_UUID,
        NOTIFY_UUID,
        (error, char) => {
          if (error) {
            if (error.errorCode === 201 || error.errorCode === 205) {
              logger.warn('BLE', 'Notify lost: ' + error.message);
              this.handleUnexpectedDisconnect(deviceId, deviceName);
            }
            return;
          }
          if (char?.value) {
            const bytes = base64ToUint8(char.value);
            logger.debug('BLE', `← FFF1 (${bytes.length}B)`, toHexString(bytes));
            this.handleNotification(bytes);
          }
        },
      );

      this.device.onDisconnected((_error, _dev) => {
        if (this.reconnectCancelled) return;
        logger.warn('APP', 'Device disconnected unexpectedly');
        this.handleUnexpectedDisconnect(deviceId, deviceName);
      });

      await this.saveDevice(deviceId, deviceName);
      useBatteryStore.getState().setDevice(deviceId, deviceName);
      this.setStatus('connected');
      logger.info('APP', `Polling started`);
      this.startPolling();
    } catch (err: any) {
      logger.error('APP', 'Connection failed: ' + (err?.message ?? String(err)));
      this.device = null;
      throw err;
    }
  }

  // ─── Disconnect ────────────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    this.reconnectCancelled = true;
    this.cleanup(true);
    await this.clearSavedDevice();
    useBatteryStore.getState().clearDevice();
    this.setStatus('idle');
    logger.info('APP', 'Disconnected by user');
  }

  private cleanup(userInitiated: boolean) {
    this.stopPolling();
    this.notifySub?.remove();
    this.notifySub = null;
    this.frameBuffer.clear();

    if (this.device) {
      this.device.cancelConnection().catch(() => {});
      this.device = null;
    }

    if (!userInitiated) {
      // status is set by caller (reconnecting or bluetooth_off)
    }
  }

  // ─── Reconnect ─────────────────────────────────────────────────────────────

  private handleUnexpectedDisconnect(deviceId: string, deviceName: string) {
    if (this.reconnectCancelled) return;
    this.cleanup(false);
    this.setStatus('reconnecting');
    this.reconnectWithBackoff(deviceId, deviceName);
  }

  private async reconnectWithBackoff(deviceId: string, deviceName: string): Promise<void> {
    for (const delay of RECONNECT_DELAYS) {
      if (this.reconnectCancelled) return;

      logger.info('APP', `Reconnecting in ${delay / 1000}s...`);
      await sleep(delay);
      if (this.reconnectCancelled) return;

      try {
        await this.connectInternal(deviceId, deviceName);
        logger.info('APP', 'Reconnected successfully');
        return;
      } catch {
        logger.warn('APP', 'Reconnect attempt failed, will retry');
      }
    }

    logger.error('APP', 'Reconnect failed after max attempts');
    this.setStatus('idle');
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  private startPolling() {
    this.pollCount = 0;
    // Immediate first poll
    this.sendCmd(CMD_READ_STATUS);
    this.sendCmd(CMD_READ_CELLS);

    this.pollTimer = setInterval(() => {
      this.sendCmd(CMD_READ_STATUS);
      if (this.pollCount % 2 === 0) {
        this.sendCmd(CMD_READ_CELLS);
      }
      this.pollCount++;
    }, POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  private async sendCmd(bytes: Uint8Array): Promise<void> {
    if (!this.device || bytes.length === 0) return;
    logger.debug('BLE', `→ FFF2 (${bytes.length}B)`, toHexString(bytes));
    try {
      await this.device.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        WRITE_UUID,
        uint8ToBase64(bytes),
      );
    } catch (err: any) {
      logger.error('BLE', 'Write failed: ' + (err?.message ?? String(err)));
    }
  }

  async sendFetCommand(bytes: Uint8Array): Promise<void> {
    await this.sendCmd(bytes);
    // Re-poll status immediately to verify FET state changed
    await sleep(500);
    await this.sendCmd(CMD_READ_STATUS);
  }

  // ─── Notification Handling ─────────────────────────────────────────────────

  private handleNotification(bytes: Uint8Array) {
    const frames = this.frameBuffer.append(bytes);
    const store = useBatteryStore.getState();

    for (const frame of frames) {
      if (frame.type === 'invalid') {
        logger.debug('PROTO', 'Partial/unrecognized frame skipped');
        continue;
      }
      if (frame.type === 'unknown') {
        // Other broadcast frames (e.g. output channels) — not decoded yet.
        continue;
      }
      if (frame.type === 'info') {
        logger.debug('PROTO', `Device serial: ${frame.serial}`);
        continue;
      }
      if (frame.type === 'status') {
        const s = frame.data;
        const power = (s.voltage * s.current).toFixed(0);
        logger.info('PROTO',
          `SOC:${s.soc}% V:${s.voltage.toFixed(2)}V I:${s.current.toFixed(2)}A P:${power}W ` +
          `Cell max:${s.maxCellmV}mV min:${s.minCellmV}mV (${s.cellCount} cells)`
        );
        // While current's byte offset is unverified, surface all candidates so a
        // load test instantly reveals which field is the real current.
        logger.debug('PROTO', `current? ${s.currentCandidatesStr}`);
        store.setStatus(s);
        // This device reports only max/min cell voltage, not per-cell values.
        store.setCells({ voltages: [s.maxCellmV, s.minCellmV] });
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const bleService = new BleService();
