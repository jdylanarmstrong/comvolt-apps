# Feature Roadmap

## Phase 1 — BLE App (current)

Connects to the JBD BMS in the Comvolt 6000 over Bluetooth.

### What's available now

- **State of charge** (SOC%) with arc gauge
- **Total voltage**, current, power
- **Charge/discharge status** and direction
- **Individual cell voltages** with min/max/delta and balance status
- **Temperature** (1–3 sensors)
- **13 protection alarm flags** with live alerting
- **FET control** — charge and discharge FETs (inverter may map to discharge FET)
- **Time estimate** — time to full or time to empty
- **Full BLE packet log** with raw hex and parsed values

### Limitations

- **No per-source input breakdown** — the BMS knows only total current. It does not know whether
  charging current came from solar, shore power, or the alternator.
- **No per-channel output breakdown** — the BMS knows total discharge current, not which
  channel (AC output 1 vs DC channel 3) is drawing what.
- **No inverter state** (beyond FET status) without PDU data.

---

## Phase 2 — PDU Integration (when PDUs arrive)

The AC Power Distribution Unit and DC Power Distribution Unit will expose per-channel data.
Communication method is TBD (USB, RS485, or a separate BLE/WiFi module).

### Planned additions

- **Per-input monitoring**: Solar wattage, shore power wattage, alternator wattage
- **Per-output monitoring**: Each AC and DC channel — on/off state, current draw, wattage
- **Channel control**: Toggle individual AC/DC channels from the app
- **EcoFlow-style power flow diagram**: Sources → battery → outputs with live wattage labels

### Implementation approach (TBD)
Once the PDUs arrive, identify the communication interface (likely a USB serial or dedicated
module). Sniff the protocol using a logic analyzer or serial terminal. The data will either
be polled or pushed to the app alongside BLE data.

---

## Phase 3 — 7" Touchscreen (when screen arrives)

The Comvolt 7" touchscreen connects to the battery via **Ethernet cable**, not BLE.

### Investigation plan

1. Connect the screen and a laptop/phone to the same LAN as the battery.
2. Run Wireshark on the LAN interface while the screen is operating normally.
3. Identify the protocol from captured TCP/UDP traffic:
   - **Modbus TCP** (port 502): most common for battery/inverter systems
   - **Custom TCP socket**: next most common (look for binary framing)
   - **HTTP/REST**: possible if the BMS has a web server
4. Once identified, map registers/commands to data fields using the Wireshark capture.

### Possible outcomes

| Finding               | Path forward                                                   |
|-----------------------|----------------------------------------------------------------|
| Android-based screen  | Check `adb devices` over USB; sideload custom APK             |
| Linux + custom app    | Replace the UI process with an Electron or React app           |
| Modbus TCP protocol   | Add Modbus TCP client to the phone app (same data, more fields)|
| Custom binary protocol| Reverse-engineer and document, similar to JBD BLE work        |

The Ethernet interface may expose additional data beyond what BLE provides — particularly
per-input source monitoring — making it the richer data source once integrated.

---

## UI Upgrade — Power Flow Diagram

Once per-source and per-output data is available (Phase 2 or 3), the Dashboard will be
upgraded from a stat-card layout to an EcoFlow-style power flow diagram:

```
  [Solar]  [Shore]  [Alternator]
      ↓        ↓         ↓
      └────────┴─────────┘
               ↓
        [Comvolt 6000]
         87%  ·  50.9V
               ↓
      ┌────────┴─────────┐
      ↓                  ↓
   [AC Out]           [DC Out]
   [Inv ON]         [Ch 1–8]
```

Each arrow shows live wattage. The diagram only makes sense with per-channel data — which
is why the initial Phase 1 UI uses simple stat cards instead.
