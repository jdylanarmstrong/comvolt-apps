import { create } from 'zustand';

const MAX_ENTRIES = 500;

export type LogLevel    = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'BLE' | 'PROTO' | 'APP';

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: LogLevel;
  category: LogCategory;
  message: string;
  hex?: string;
}

interface LogState {
  entries: LogEntry[];
  addEntry(level: LogLevel, category: LogCategory, message: string, hex?: string): void;
  clear(): void;
}

let _nextId = 0;

export const useLogStore = create<LogState>()((set) => ({
  entries: [],

  addEntry(level, category, message, hex) {
    const label = `[${category}] [${level.toUpperCase()}]`;
    const hexSuffix = hex ? ` | ${hex}` : '';
    console.log(`${label} ${message}${hexSuffix}`);

    const entry: LogEntry = {
      id: _nextId++,
      timestamp: new Date(),
      level,
      category,
      message,
      hex,
    };

    set((state) => ({
      entries: state.entries.length >= MAX_ENTRIES
        ? [...state.entries.slice(1), entry]
        : [...state.entries, entry],
    }));
  },

  clear() {
    set({ entries: [] });
  },
}));

// Callable outside React components via zustand's getState()
export const logger = {
  debug: (cat: LogCategory, msg: string, hex?: string) =>
    useLogStore.getState().addEntry('debug', cat, msg, hex),
  info: (cat: LogCategory, msg: string, hex?: string) =>
    useLogStore.getState().addEntry('info', cat, msg, hex),
  warn: (cat: LogCategory, msg: string, hex?: string) =>
    useLogStore.getState().addEntry('warn', cat, msg, hex),
  error: (cat: LogCategory, msg: string, hex?: string) =>
    useLogStore.getState().addEntry('error', cat, msg, hex),
};
