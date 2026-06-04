# App Architecture

## Overview

**Comvolt** is a React Native mobile app (iOS + Android) for monitoring the Comvolt 6000
LiFePO4 battery system over Bluetooth Low Energy. The battery (BLE name **YNT5720**) speaks a
**proprietary YNT framing** (`0x99` frames) that was reverse-engineered for this app — see
[`ble-protocol.md`](./ble-protocol.md). It is **not** a JBD BMS, despite advertising JBD-style
UUIDs.

---

## Tech Stack

| Layer         | Technology                                          |
|---------------|-----------------------------------------------------|
| Framework     | React Native 0.76.9 via **Expo SDK 52**             |
| Dev build     | `expo prebuild` + `expo run:ios` (local, CocoaPods) |
| BLE           | react-native-ble-plx v3                             |
| State         | zustand v5 (with `useShallow` for multi-field selectors) |
| Navigation    | @react-navigation/native + bottom tabs + native stack |
| SVG           | react-native-svg (SOC arc gauge)                    |
| Storage       | @react-native-async-storage/async-storage           |
| Icons         | @expo/vector-icons (Ionicons)                       |

> **Expo Go will not work** — BLE is a native module requiring a compiled development build.
> SDK 52 / RN 0.76 was chosen deliberately after SDK 56 / RN 0.85 (new architecture) caused
> cascading native build failures.

---

## Project Structure

```
comvolt-apps/
├── mobile/                         # React Native app
│   ├── App.tsx                     # Root component (NavigationContainer)
│   ├── app.json                    # Expo config, BLE plugin, permissions, fmt-fix plugin
│   ├── babel.config.js             # babel-preset-expo only (no reanimated)
│   ├── package.json
│   ├── plugins/
│   │   └── withFmtConstevalFix.js  # Config plugin: patches fmt header (see Build section)
│   └── src/
│       ├── theme.ts                # Design tokens: colors, spacing, radius, fontSize
│       ├── ble/
│       │   ├── JbdProtocol.ts      # YNT `0x99` protocol parser + frame buffer
│       │   │                       #   (filename retained from the original JBD assumption)
│       │   └── BleService.ts       # BLE state machine singleton
│       ├── store/
│       │   ├── batteryStore.ts     # Connection status + live battery data (zustand)
│       │   └── logStore.ts         # Circular log buffer, 500 entries (zustand)
│       ├── navigation/
│       │   └── index.tsx           # Root stack (Scan or MainTabs based on connection)
│       ├── screens/
│       │   ├── ScanScreen.tsx      # BLE scan, device list, pre-permission prompt
│       │   ├── DashboardScreen.tsx # SOC gauge, stat cards, DC-in/AC-out, stale indicator
│       │   ├── CellsScreen.tsx     # Max/min cell voltage + delta
│       │   ├── AlarmsScreen.tsx    # Protection flag list (green/red)
│       │   ├── LogsScreen.tsx      # Live BLE log with hex, share button (throttled render)
│       │   └── SettingsScreen.tsx  # Device info + disconnect (FET control stubbed)
│       └── components/
│           ├── SocGauge.tsx        # SVG arc gauge (color = charging vs discharging)
│           ├── StatCard.tsx        # Metric card (label + value + unit)
│           └── CellBars.tsx        # Horizontal bar chart for cell voltages
└── docs/
    ├── ble-protocol.md             # YNT BLE protocol reference (source of truth)
    ├── architecture.md             # This file
    └── screen-roadmap.md           # 7" screen + per-channel roadmap
```

---

## BLE Connection State Machine

```
IDLE ──────────────────────────────── (app start, Bluetooth available)
  │ [user taps Scan]
  ▼
SCANNING ────────────── 15s timeout → IDLE ("No devices found")
  │ [user taps device]
  ▼
CONNECTING ─────────── failure (e.g. timeout / out of range) → cleanup → IDLE (error toast)
  │ [service discovery + notify subscription]
  ▼
CONNECTED (streaming)
  │ [device drops signal]
  ▼
RECONNECTING ──────────────────────── exponential backoff: 2s, 4s, 8s, 16s, 30s
  │   [max retries exhausted] → IDLE
  │ [reconnected]
  ▼
CONNECTED

BLUETOOTH_OFF ─────────────────────── (any state → on Bluetooth PoweredOff event)
  └── [Bluetooth turned back on] → IDLE
```

A failed **manual** connect resets to IDLE and cleans up so the UI never sticks on
"Connecting…". The reconnect loop manages its own state and only falls back to IDLE after the
backoff is exhausted.

---

## Data Flow

```
Battery (YNT5720)
    │  BLE notify (FFF1) — device auto-broadcasts, no command needed
    ▼
BleService.handleNotification()
    │  accumulate bytes in FrameBuffer; split 0x99 frames; validate 0x59 trailer
    │  parseFrame() → status | outputs | info | unknown
    ▼
batteryStore.setStatus() / setCells() / setOutputs()      logStore.addEntry()
    │                                                            │
    ▼                                                            ▼
React screens (zustand selectors via useShallow)          LogsScreen (sampled @ 2Hz)
```

- The battery **streams** status, outputs, and info frames continuously after the app
  subscribes to FFF1. No polling is required for telemetry.
- The app still writes the legacy JBD read bytes to FFF2 on a 3s timer as a harmless
  keep-alive; the device ignores them.

---

## Key Design Decisions

### zustand v5 selectors
Multi-field selectors must be wrapped in `useShallow` (`zustand/react/shallow`). Returning a
fresh object literal without it triggers an infinite render loop in zustand v5
("Maximum update depth exceeded").

### Frame validation without CRC
The YNT trailer checksum algorithm isn't reverse-engineered. Frames are validated by start
byte (`0x99`), declared length, and the `0x59` trailer marker, with single-byte resync on
mismatch. This is robust enough in practice given BLE's own link-layer CRC.

### Logs screen render throttling
The BLE stream appends ~10 log entries/sec. The Logs screen samples the store every 500ms
(rather than subscribing to every append) and uses memoized rows + FlatList windowing, so the
live stream can't saturate the JS thread and block navigation.

### Exponential backoff reconnect
On unexpected disconnect the app retries at 2s → 4s → 8s → 16s → 30s before giving up.
User-initiated disconnects skip the retry loop.

---

## Building for Device

react-native-ble-plx requires a compiled native build (no Expo Go).

```bash
cd mobile && npm install
npx expo prebuild --clean        # regenerates ios/ (runs the fmt-fix config plugin)
cd ios && pod install && cd ..
npx expo run:ios --device        # builds, installs on iPhone, starts Metro
# subsequent JS-only changes: just `npx expo start --dev-client`
```

### fmt consteval build fix
RN 0.76 bundles `fmt` 11.0.2, whose `consteval` usage newer Apple Clang rejects. A compiler
define can't override it (the header has no `#ifndef` guard), so `plugins/withFmtConstevalFix.js`
patches `Pods/fmt/include/fmt/base.h` in the Podfile `post_install` hook to neutralize
`FMT_CONSTEVAL`. This runs automatically on every `prebuild`/`pod install`.

### Native Permissions (auto-configured by Expo plugins)

**iOS** (`infoPlist` in app.json): `NSBluetoothAlwaysUsageDescription`,
`NSBluetoothPeripheralUsageDescription`, `UIBackgroundModes: [bluetooth-central]`.

**Android** (`android.permissions`): `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (API ≥ 31),
`ACCESS_FINE_LOCATION` (API < 31 scan requirement).

---

## What the Battery Provides Over BLE

| Data point              | Available? | Notes                                   |
|-------------------------|------------|-----------------------------------------|
| State of charge (SOC)   | ✅         | 0–100%                                  |
| Pack voltage            | ✅         | 10mV resolution                         |
| Current (net)           | ✅         | Positive = discharge (charge sign TBD)  |
| Power                   | ✅         | Direct field + `V × I` cross-check       |
| Remaining capacity      | ✅         | Ah (0.1Ah resolution)                   |
| Max / min cell voltage  | ✅         | mV — **only** max/min, not per-cell      |
| AC output power         | ✅         | watts (outputs frame)                   |
| DC input power          | ✅         | watts (outputs frame), metered separately|
| Serial number           | ✅         | 5720                                    |
| Temperature             | ❌         | Not exposed over BLE                     |
| Per-cell voltages       | ❌         | Only max/min available                  |
| Cycle count / prod date | ❌         | Not located in the stream               |
| Protection fault flags  | ❓         | Not yet decoded (status reads "normal") |
| FET / switch control    | ❓         | Write protocol not yet captured (stubbed)|
| Per-channel AC/DC        | ❓         | AC1/AC2, DC1–8 not yet decoded          |

See [`ble-protocol.md`](./ble-protocol.md) "Open Items" for the remaining reverse-engineering
work.
