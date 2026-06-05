# Feature Roadmap

## Phase 1 — BLE App (working)

Connects to the Comvolt 6000 (YNT5720) over Bluetooth and decodes its proprietary YNT
protocol — see [`ble-protocol.md`](./ble-protocol.md).

### What's working now (verified against the stock app)

- **State of charge** (SOC%) with arc gauge
- **Pack voltage, net current, power** — with verified charging / discharging / idle direction
- **Remaining capacity** (Ah) and time-to-empty estimate
- **Max / min cell voltage** with delta (the BMS exposes only max/min, not per-cell)
- **DC input power** and **AC output power** (per-port, over BLE — no PDU hardware needed)
- **Serial number**
- **Full BLE packet log** with raw hex and parsed values, plus share/export
- **Connection resilience** — exponential-backoff reconnect, clean failure handling

### Known limitations / not yet decoded

- **Solar input** — ✅ confirmed in the `DC·IN` field (outputs frame [23:25]). Solar sessions
  show `direction=charging` and non-zero DC·IN; the stock app aggregates all DC charging sources
  into the single "DC·IN" total. No separate solar field observed at ≈25–112 W.
- **Per-channel breakdown** — AC1/AC2 and DC1–8 individual circuits aren't decoded yet; only
  aggregate AC output and DC input are.
- **No temperature, no per-cell voltages, no protection-flag decode** over BLE.
- **No control** — toggling the main switch / inverter / AC1 writes are not captured;
  `buildFetCmd` is a no-op stub.

---

## Phase 2 — Deeper BLE Decode (incremental)

All achievable with the existing BLE link by capturing more scenarios:

1. **Solar input** — ✅ done: solar appears in the existing DC·IN field (outputs frame [23:25]).
   Follow-up: capture simultaneous wall+solar to see if the total exceeds what each shows
   individually, confirming true aggregation vs only one source at a time.
2. **Per-channel power** — toggle individual AC/DC circuits while logging the outputs frame
   (`cmd=0xA0/len=0x1F`); map the currently-zero bytes to channels.
3. **Control writes** — sniff the stock app's main-switch / inverter / AC1 toggles to FFF2
   (e.g. via nRF Connect or an Android HCI snoop log) and implement real control.
4. **EcoFlow-style power-flow diagram** once per-source/per-channel data is available:

```
   [DC IN]                         [AC OUT]
      ↓                               ↑
      └───────► [Comvolt 6000] ──────┘
                 99% · 13.3V
                  ↓        ↓
              [DC 1–8]  [AC 1–2]
```

---

## Phase 3 — 7" Touchscreen (separate project)

**Goal:** a separate, dedicated app for the 7" screen — independent of the phone app
(different form factor 800×480 landscape, different data path). It must communicate with the
system **natively over the existing wiring — no new hardware**.

### Hardware facts (from the nameplate + user manual)
- Model **COMVOLT-70CJ-V02**, resolution **800×480**, capacitive touch, DC 10–60V.
- **No WiFi / no Bluetooth / no USB** exposed — wired only.
- Ports: **YNT-BUS** (power + RS485 to battery), **YNT-CAN** (to PDU), **VE.CAN** (Victron),
  VGA/HDMI video in, dry-contact, backup power.
- Battery comms is **RS485** (the "network cable" is RJ45 carrying RS485, not Ethernet/IP).
- The UI looks like a custom embedded app (likely Linux/RTOS on an ARM SoC), not stock Android.

### Investigation plan (hands-on, when ready)
1. Open the unit and identify the SoC / look for a UART debug console and storage.
2. Determine the OS. If Linux: find how the stock UI launches and whether it can be replaced
   or run alongside. If Android-like: check for ADB.
3. Independently, **decode the RS485/Modbus protocol** on the YNT-BUS (logic analyzer or
   RS485-USB adapter) so a custom UI has a data source. Much of the field knowledge from the
   BLE decode should transfer.
4. Build the screen UI for that platform and data path as its own project.

> This is hardware-investigation work that can't proceed remotely — it starts with physically
> opening the screen and probing it.
