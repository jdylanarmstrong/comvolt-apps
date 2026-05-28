# App Architecture

## Overview

**Comvolt** is a React Native mobile app (iOS + Android) for monitoring and controlling the
Comvolt 6000 LiFePO4 battery system. It communicates with the battery's JBD BMS over
Bluetooth Low Energy.

---

## Tech Stack

| Layer         | Technology                                          |
|---------------|-----------------------------------------------------|
| Framework     | React Native 0.85 via Expo SDK 56                  |
| Build         | EAS Build (Expo Application Services)               |
| BLE           | react-native-ble-plx v3                             |
| State         | zustand v5                                          |
| Navigation    | @react-navigation/native + bottom tabs + native stack |
| SVG           | react-native-svg (SOC arc gauge)                    |
| Storage       | @react-native-async-storage/async-storage           |
| Icons         | @expo/vector-icons (Ionicons)                       |

> **Expo Go will not work** — BLE is a native module requiring a compiled development build.

---

## Project Structure

```
comvolt-apps/
├── mobile/                         # React Native app
│   ├── App.tsx                     # Root component (NavigationContainer)
│   ├── app.json                    # Expo config, BLE plugin, permissions
│   ├── babel.config.js             # Reanimated plugin (must be last)
│   ├── package.json
│   └── src/
│       ├── theme.ts                # Design tokens: colors, spacing, radius, fontSize
│       ├── ble/
│       │   ├── JbdProtocol.ts      # Protocol: commands, frame parsing, checksum
│       │   └── BleService.ts       # BLE state machine singleton
│       ├── store/
│       │   ├── batteryStore.ts     # Connection status + live BMS data (zustand)
│       │   └── logStore.ts         # Circular log buffer, 500 entries (zustand)
│       ├── navigation/
│       │   └── index.tsx           # Root stack (Scan or MainTabs based on connection)
│       ├── screens/
│       │   ├── ScanScreen.tsx      # BLE scan, device list, pre-permission prompt
│       │   ├── DashboardScreen.tsx # SOC gauge, stat cards, stale/fault indicators
│       │   ├── CellsScreen.tsx     # Per-cell voltage bars + min/max/delta
│       │   ├── AlarmsScreen.tsx    # Protection flag list (green/red)
│       │   ├── LogsScreen.tsx      # Live BLE log with hex, share button
│       │   └── SettingsScreen.tsx  # FET control + device info + disconnect
│       └── components/
│           ├── SocGauge.tsx        # SVG arc gauge (color = charging vs discharging)
│           ├── StatCard.tsx        # Metric card (label + value + unit)
│           └── CellBars.tsx        # Horizontal bar chart for cell voltages
└── docs/
    ├── ble-protocol.md             # JBD BMS protocol reference (this repo's source of truth)
    ├── architecture.md             # This file
    └── screen-roadmap.md           # Phase 2: PDU integration + Ethernet screen
```

---

## BLE Connection State Machine

```
IDLE ──────────────────────────────── (app start, Bluetooth available)
  │
  │ [user taps Scan]
  ▼
SCANNING ────────────── 15s timeout → IDLE ("No devices found")
  │
  │ [user taps device]
  ▼
CONNECTING ─────────── 10s timeout → IDLE (error toast)
  │
  │ [MTU request + service discovery]
  ▼
CONNECTED (monitoring + polling)
  │
  │ [device drops signal]
  ▼
RECONNECTING ──────────────────────── exponential backoff: 2s, 4s, 8s, 16s, 30s
  │  \
  │   [max retries exhausted] → IDLE
  │
  │ [reconnected]
  ▼
CONNECTED

BLUETOOTH_OFF ─────────────────────── (any state → on Bluetooth PoweredOff event)
  │
  └── [Bluetooth turned back on] → IDLE
```

---

## Data Flow

```
BMS (YNT5720)
    │  BLE notify (FFF1)
    ▼
BleService.handleNotification()
    │  accumulate bytes in FrameBuffer
    │  parse complete frames
    │  verify checksum
    ▼
batteryStore.setStatus() / setCells()    logStore.addEntry()
    │                                           │
    ▼                                           ▼
React screens (zustand selectors)         LogsScreen
```

**Poll cycle (from BleService):**
- Every 3s: write `CMD_READ_STATUS` to FFF2
- Every 6s: additionally write `CMD_READ_CELLS`
- Immediate poll on connect

---

## Key Design Decisions

### Write-Without-Response on FFF2
FFF2 supports both Write and Write Without Response. JBD BMS convention is Write Without
Response (faster, no ACK round-trip). The app uses `writeCharacteristicWithoutResponseForService`.

### Dynamic Status Frame Length
The status response is NOT a fixed 27 bytes. It is `23 + (NTC_count × 2)` bytes.
`NTC_count` is read from byte 22 of the data payload. Different BMS units may have 1–3
temperature sensors.

### Checksum Verification on Received Frames
All incoming frames are checksum-verified before being applied to state. Invalid frames are
discarded and logged with `[PROTO] WARN` level. This handles BLE packet corruption.

### Exponential Backoff Reconnect
On unexpected disconnect, the app retries at 2s → 4s → 8s → 16s → 30s intervals before
giving up. User-initiated disconnects skip the retry loop.

### FET Control Safety
Discharge FET toggle requires a two-step confirmation dialog. After sending, the app
re-polls status after 500ms and reflects the new FET state. The BMS may reject the command
if hardware protection is active.

---

## Building for Device

EAS Build is required because react-native-ble-plx includes native iOS/Android code.

```bash
# One-time setup
npm install -g eas-cli
cd mobile && npm install
eas login
eas build:configure

# Development build (for testing on device)
eas build --platform ios --profile development
eas build --platform android --profile development

# After build installs on device, start the dev server:
npx expo start --dev-client
```

### Native Permissions (auto-configured by Expo plugin)

**iOS** (via `infoPlist` in app.json):
- `NSBluetoothAlwaysUsageDescription`
- `NSBluetoothPeripheralUsageDescription`
- `UIBackgroundModes: [bluetooth-central]`

**Android** (via `android.permissions` in app.json):
- `BLUETOOTH_SCAN` (API ≥ 31)
- `BLUETOOTH_CONNECT` (API ≥ 31)
- `ACCESS_FINE_LOCATION` (API < 31 scan requirement)

---

## What the JBD BMS Provides

| Data point            | Available? | Notes                           |
|-----------------------|------------|---------------------------------|
| State of charge (SOC) | ✅          | 0–100%                          |
| Total voltage         | ✅          | Accurate to 10mV               |
| Current (total)       | ✅          | Positive=discharge, neg=charge  |
| Total power           | ✅          | Calculated: V × I              |
| Remaining capacity    | ✅          | Ah                              |
| Individual cell V     | ✅          | Per cell, in mV                 |
| Temperature(s)        | ✅          | 1–3 sensors depending on build  |
| Cycle count           | ✅          |                                 |
| Production date       | ✅          |                                 |
| Protection faults     | ✅          | 13 fault flags                  |
| FET on/off control    | ✅          | Charge and discharge separately |
| Per-source input      | ❌          | Needs PDU (see screen-roadmap)  |
| Per-channel output    | ❌          | Needs PDU                       |
| Inverter state/control| ❓          | May map to discharge FET        |
