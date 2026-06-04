# Comvolt / YNT BMS BLE Protocol Reference

Applies to the **Comvolt 6000** battery system (BLE device name: **YNT5720**).

> **Important:** despite advertising JBD-style service/characteristic UUIDs, this device
> **does not speak the JBD protocol.** It uses a proprietary YNT framing (every frame starts
> with `0x99`) and **auto-broadcasts** its data on the notify characteristic — it ignores the
> JBD read commands entirely. This document was reverse-engineered from live captures and
> cross-checked field-by-field against the stock Comvolt app, including load and charge tests
> (2026-06).

---

## BLE Identifiers

| Role            | UUID                                   |
|-----------------|----------------------------------------|
| Service         | `0000FFF0-0000-1000-8000-00805F9B34FB` |
| Write (TX)      | `0000FFF2-0000-1000-8000-00805F9B34FB` |
| Notify/Read (RX)| `0000FFF1-0000-1000-8000-00805F9B34FB` |

- The device **streams** frames on FFF1 as notifications without being asked.
- Writes to FFF2 are not required for telemetry. The legacy JBD reads
  (`DD A5 03 00 FF FD 77`, etc.) are accepted but produce no response; the app keeps sending
  them only as harmless keep-alive pokes (and skips empty payloads).

---

## Frame Format

```
0x99  [cmd]  [addr]  [len]  [ ...payload (len bytes)... ]  0x59  [crc_hi]  [crc_lo]
```

- `addr` is `0xC3` on this unit.
- **Total frame length = `7 + len`** (4-byte header + `len` payload + 3-byte trailer).
- The 3-byte trailer always begins with `0x59`, followed by a 2-byte checksum (likely CRC16;
  the exact algorithm is **not** reverse-engineered). The app validates frames by start byte
  (`0x99`), length, and the `0x59` trailer marker rather than by recomputing the CRC.
- A single BLE notification may contain a partial frame **or multiple concatenated frames**
  (e.g. a 67-byte notification = a 38-byte frame + a 29-byte frame). Accumulate bytes in a
  buffer and split on the framing above.
- All multi-byte numeric fields are **big-endian**.

### Frame types observed

| cmd  | len           | Total | Meaning                          |
|------|---------------|-------|----------------------------------|
| `A0` | `0x16` (22)   | 29 B  | **Status** (battery telemetry)   |
| `A0` | `0x1F` (31)   | 38 B  | **Outputs** (AC out / DC in)     |
| `A1` | `0x08` (8)    | 15 B  | **Info** (serial number)         |

---

## Status Frame — `cmd=0xA0`, `len=0x16`

Payload offsets (0-based, within the 22-byte payload). ✅ = verified against the stock app.

| Offset | Type   | Field              | Conversion            | Verified |
|--------|--------|--------------------|-----------------------|----------|
| 1      | uint8  | SOC                | % (0–100)             | ✅ 0x64 = 100% |
| 2–3    | uint16 | Remaining capacity | `÷ 10` → Ah           | ✅ 0x1257 = 469.5 Ah |
| 4–5    | uint16 | Power (magnitude)  | watts                 | ✅ 0x0668 = 1640 W |
| 6      | uint8  | Direction flag     | 0=idle, 1=charge, 2=discharge | ✅ all three states |
| 9–10   | uint16 | Pack voltage       | `÷ 100` → V (10mV)    | ✅ 0x0578 = 14.00 V |
| 11–12  | uint16 | Current magnitude  | `÷ 100` → A (10mA)    | ✅ 0x300C = 123.00 A |
| 13     | uint8  | Cell count         | —                     | ✅ 0x04 = 4 cells |
| 16–17  | uint16 | Max cell voltage   | mV                    | ✅ 0x0DB0 = 3504 mV |
| 18–19  | uint16 | Min cell voltage   | mV                    | ✅ 0x0DAA = 3498 mV |

**Sign convention:** the current field (offset 11–12) is an **unsigned magnitude**; the
charge/discharge **direction comes from the flag at offset 6** (0 = idle/待机中,
1 = charging/充电中, 2 = discharging/放电中). The app applies the sign as negative = charging,
positive = discharging. All three states verified against the stock app.

**Power field:** offset 4–5 is the device's own (unsigned) power reading in watts and matches
the stock app's headline wattage. The app derives signed power as `V × I` (negative when
charging) for the dashboard; the direct field is available as a cross-check.

Bytes `0`, `7–8`, `14–15`, `20–21` are not fully decoded. Byte 7–8 carries a small
direction-dependent value (e.g. `0x0330` discharging, `0x0020` charging, `0` idle) — purpose
unknown.

### Example
```
99 A0 C3 16  03 64 12 50 06 68 02 03 30 05 36 30 0C 04 01 01 0D 0B 0D 08 00 0A  59 21 3D
             └payload──────────────────────────────────────────────────────┘  └trailer┘
SOC = 0x64 = 100%
Remaining = 0x1250 = 4688 ÷10 = 468.8 Ah
Power = 0x0668 = 1640 W
Direction = 0x02 = discharging
Voltage = 0x0536 = 1334 ÷100 = 13.34 V
Current = 0x300C = 12300 ÷100 = 123.00 A (sign from direction → +discharge)
Cells = 0x04 = 4
Max cell = 0x0D0B = 3339 mV,  Min cell = 0x0D08 = 3336 mV
```

> This device exposes only **max/min** cell voltage (not per-cell), and **no temperature**
> over BLE.

---

## Outputs Frame — `cmd=0xA0`, `len=0x1F`

| Offset | Type   | Field             | Conversion | Verified |
|--------|--------|-------------------|------------|----------|
| 7–8    | uint16 | AC output power   | watts      | ✅ 0x05A6 = 1446 W (matches AC·OUT) |
| 14–15  | uint16 | AC output power   | watts      | ✅ duplicate of 7–8 |
| 23–24  | uint16 | DC input power    | watts      | ✅ 0x0124 = 292 W (matches DC·IN) |
| 29–30  | uint16 | Battery power     | watts      | ✅ echoes status power field |
| 12     | uint8? | AC energy counter | ~Wh        | ⏳ increments slowly; scale unconfirmed |

DC input is metered **independently** of net battery current: during a load test the pack was
net-discharging (≈99 A out) while DC input simultaneously read ≈297 W in.

### Example
```
99 A0 C3 1F  05 00 00 00 00 00 00 05 CA 00 00 00 55 01 05 CA 00 00 00 00 00 00 00 01 24 00 00 00 00 05 0E  59 B4 00
AC output = 0x05CA = 1482 W (offset 7)
DC input  = 0x0124 = 292 W  (offset 23)
Battery power = 0x050E = 1294 W (offset 29)
```

---

## Info Frame — `cmd=0xA1`, `len=0x08`

| Offset | Type   | Field         | Verified |
|--------|--------|---------------|----------|
| 6–7    | uint16 | Serial number | ✅ 0x1658 = 5720 (→ "YNT**5720**") |

```
99 A1 C3 08  00 01 10 00 00 00 16 58  59 19 EF
                              └ 0x1658 = 5720
```

---

## Implementation Notes

- **MTU:** on iOS, `requestMTU` reports `23` but the OS negotiates a larger ATT MTU
  automatically and `react-native-ble-plx` reassembles — multi-packet frames arrive intact.
  On Android, request a larger MTU explicitly to avoid fragmentation.
- **Frame buffering:** accumulate notification bytes, locate `0x99`, read `len` at offset 3,
  wait for `7 + len` bytes, and validate the `0x59` trailer marker before parsing. Resync by
  dropping one byte if the marker is wrong.
- **No commands needed:** telemetry streams continuously after subscribing to FFF1.

---

## Empirical Verification Log

| Date       | Item                                              | Result |
|------------|---------------------------------------------------|--------|
| 2026-05-28 | Service FFF0 / FFF2 write / FFF1 notify           | ✅ nRF Connect |
| 2026-06    | Device is NOT JBD; uses `0x99` YNT framing        | ✅ live capture |
| 2026-06    | SOC, voltage, remaining Ah (status frame)         | ✅ vs stock app (100%, 14.00V, 469.5Ah) |
| 2026-06    | Current offset 11 + power offset 4 (≈123 A load)  | ✅ vs stock app (123 A, 1640 W) |
| 2026-06    | Direction flag offset 6 (idle/charge/discharge)   | ✅ all 3 states vs stock app |
| 2026-06    | Max/min cell voltage tracks live load sag         | ✅ vs stock app |
| 2026-06    | AC output (outputs frame offset 7)                | ✅ vs stock app (1446/1437/1482 W) |
| 2026-06    | DC input (outputs frame offset 23)                | ✅ vs stock app (≈297 W) |
| 2026-06    | Serial number (info frame)                        | ✅ 5720 |

---

## Open Items / Not Yet Reverse-Engineered

- **Solar input** — the system has separate solar input ports. Not yet captured. The DC·IN
  field (outputs frame [23:25]) may aggregate solar + wall/alternator, or solar may have its
  own field. **Test planned next** (solar charging session).
- **Per-channel breakdown** — AC1/AC2 and DC1–8 individual channels (the stock app and screen
  show these). Likely in the outputs frame's currently-zero bytes; capture while toggling
  individual circuits.
- **AC energy (Wh) counter** — outputs frame offset 12 increments; confirm field width/scale.
- **Status byte 7–8** — small direction-dependent value (`0x0330` discharging, `0x0020`
  charging, `0` idle); purpose unknown.
- **Trailer checksum** — 2 bytes after the `0x59` marker; CRC algorithm not identified.
- **FET / switch control** — the write protocol for toggling main switch / inverter / AC1 is
  not captured. `buildFetCmd` is currently a no-op stub. Capture the stock app's toggle writes
  to FFF2 to decode it.
