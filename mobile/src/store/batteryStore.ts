import { create } from 'zustand';
import { BmsStatus, BmsCells } from '../ble/JbdProtocol';

export type ConnectionStatus =
  | 'idle'
  | 'bluetooth_off'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

interface BatteryState {
  connectionStatus: ConnectionStatus;
  deviceId: string | null;
  deviceName: string | null;
  status: BmsStatus | null;
  prevProtectionFlags: number;
  cells: BmsCells | null;
  lastUpdated: number | null;

  setConnectionStatus(s: ConnectionStatus): void;
  setDevice(id: string, name: string): void;
  clearDevice(): void;
  setStatus(s: BmsStatus): void;
  setCells(c: BmsCells): void;
}

export const useBatteryStore = create<BatteryState>()((set) => ({
  connectionStatus: 'idle',
  deviceId: null,
  deviceName: null,
  status: null,
  prevProtectionFlags: 0,
  cells: null,
  lastUpdated: null,

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setDevice: (deviceId, deviceName) => set({ deviceId, deviceName }),

  clearDevice: () =>
    set({
      deviceId: null,
      deviceName: null,
      status: null,
      cells: null,
      lastUpdated: null,
      prevProtectionFlags: 0,
    }),

  setStatus: (status) =>
    set((state) => ({
      status,
      lastUpdated: Date.now(),
      prevProtectionFlags: state.status?.protectionFlags ?? 0,
    })),

  setCells: (cells) => set({ cells }),
}));
