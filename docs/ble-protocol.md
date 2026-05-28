# JBD BMS BLE Protocol Reference

Applies to the **Comvolt 6000** battery system (device name: **YNT5720**).
Protocol identified via nRF Connect on 2026-05-28.

---

## BLE Identifiers

| Role            | UUID                                   |
|-----------------|----------------------------------------|
| Service         | `0000FFF0-0000-1000-8000-00805F9B34FB` |
| Write (TX)      | `0000FFF2-0000-1000-8000-00805F9B34FB` |
| Notify/Read (RX)| `0000FFF1-0000-1000-8000-00805F9B34FB` |

- **FFF2** properties: Write, Write Without Response — use **write-without-response**
- **FFF1** properties: Read, Write, Write Without Response, Notify

---

## Checksum Formula

```
sum      = register + data_length + data[0] + data[1] + ... + data[n-1]
checksum = 0x10000 - (sum & 0xFFFF)
ck_h     = (checksum >> 8) & 0xFF
ck_l     = checksum & 0xFF
```

Verification: reg=`0x03`, len=`0x00` → sum=`0x03` → checksum=`0xFFFD` → `FF FD` ✓

For **received frames**, the checksum covers: `register + status + data_length + data_bytes`.

---

## Read Commands

Write these bytes to FFF2 to request data. Responses arrive as notifications on FFF1.

| Command       | Bytes                          | Notes                  |
|---------------|--------------------------------|------------------------|
| Read Status   | `DD A5 03 00 FF FD 77`         | SOC, V, I, temps, FETs |
| Read Cells    | `DD A5 04 00 FF FC 77`         | Per-cell voltages      |
| Read Info     | `DD A5 05 00 FF FB 77`         | Manufacturer strings   |

---

## Response Frame Format

```
0xDD  [register]  [status]  [data_len]  [...data...]  [ck_h]  [ck_l]  0x77
```

- `status = 0x00` → OK
- `status = 0x80` → Error
- Frame may span multiple BLE notification packets — accumulate in buffer until complete
- Total frame size = `7 + data_len` bytes
- **Always verify checksum before using data**; discard and log invalid frames

---

## Status Response (register `0x03`)

Data length is **dynamic**: `23 + (NTC_count × 2)` bytes.

| Offset | Size   | Field               | Unit    | Conversion                          |
|--------|--------|---------------------|---------|-------------------------------------|
| 0–1    | uint16 | Total voltage       | 10mV    | `÷ 100` → V                        |
| 2–3    | int16  | Current (signed)    | 10mA    | `÷ 100` → A; negative = charging   |
| 4–5    | uint16 | Remaining capacity  | 10mAh   | `÷ 100` → Ah                       |
| 6–7    | uint16 | Nominal capacity    | 10mAh   | `÷ 100` → Ah                       |
| 8–9    | uint16 | Cycle count         | —       |                                     |
| 10–11  | uint16 | Production date     | encoded | `(year-2000)<<9 \| month<<5 \| day`|
| 12–13  | uint16 | Balance bits 1–16   | bitfield| bit N = cell N+1 balancing          |
| 14–15  | uint16 | Balance bits 17–32  | bitfield|                                     |
| 16–17  | uint16 | Protection flags    | bitfield| See table below                     |
| 18     | uint8  | SW version          | —       |                                     |
| 19     | uint8  | SOC                 | %       | 0–100                               |
| 20     | uint8  | FET status          | bitfield| bit0=charge FET on, bit1=discharge  |
| 21     | uint8  | Cell count          | —       |                                     |
| 22     | uint8  | NTC sensor count    | —       | Determines remaining data length    |
| 23+    | uint16 | Temperature(s)      | 0.1K    | `(val − 2731) / 10.0` → °C        |

All multi-byte fields are **big-endian**.

---

## Protection Status Flags (offset 16–17)

| Bit | Fault                       | Description                              |
|-----|-----------------------------|------------------------------------------|
| 0   | Cell overvoltage            | A cell exceeded upper voltage limit      |
| 1   | Cell undervoltage           | A cell dropped below lower voltage limit |
| 2   | Pack overvoltage            | Total pack voltage too high              |
| 3   | Pack undervoltage           | Total pack voltage too low               |
| 4   | Charging overtemperature    | Too hot to charge                        |
| 5   | Charging undertemperature   | Too cold to charge                       |
| 6   | Discharge overtemperature   | Too hot while discharging                |
| 7   | Discharge undertemperature  | Too cold while discharging               |
| 8   | Charging overcurrent        | Charge current exceeded rated max        |
| 9   | Discharge overcurrent       | Discharge current exceeded rated max     |
| 10  | Short circuit               | Short circuit detected                   |
| 11  | IC front-end error          | Internal BMS measurement IC fault        |
| 12  | MOS software lock           | FETs locked off via software             |

---

## Cell Voltage Response (register `0x04`)

- Data length = `2 × cell_count` bytes
- Each cell: `uint16` big-endian, in **mV**
- Cell 1 is at offset 0, cell N at offset `(N-1) × 2`

---

## FET Control Command

```
DD  5A  E1  02  [charge_byte]  [discharge_byte]  [ck_h]  [ck_l]  77
```

- `charge_byte`: `0x00` = FET on, `0x01` = FET off
- `discharge_byte`: `0x00` = FET on, `0x01` = FET off
- Register `0xE1`, data length `0x02`
- Checksum covers: `0xE1 + 0x02 + charge_byte + discharge_byte`

> ⚠️ **Not yet empirically verified on YNT5720** — some JBD variants use a single control byte
> instead of two. Verify via nRF Connect before relying on this in production.

### Example: All FETs on
```
Sum = 0xE1 + 0x02 + 0x00 + 0x00 = 0xE3
Checksum = 0x10000 - 0xE3 = 0xFF1D → FF 1D
Command: DD 5A E1 02 00 00 FF 1D 77
```

---

## Implementation Notes

- **MTU**: Request MTU 512 immediately after connecting (before service discovery) on Android.
  Default MTU of 23 bytes will fragment status responses (31+ bytes).
- **Write type**: Use `writeWithoutResponse` on FFF2. Both write types are advertised but
  `writeWithoutResponse` is the JBD convention and avoids acknowledgement overhead.
- **Buffer accumulation**: A single BLE notification may be only a partial frame. Accumulate
  bytes until `7 + data_len` bytes are received before parsing.
- **Multiple NTCs**: Do not hardcode 27 bytes for the status response. Read `data[22]` for NTC
  count and compute expected length dynamically.

---

## Empirical Verification Log

| Date       | Item                                        | Verified? |
|------------|---------------------------------------------|-----------|
| 2026-05-28 | Service UUID FFF0 on YNT5720                | ✅ nRF Connect |
| 2026-05-28 | FFF2 Write + Write Without Response         | ✅ nRF Connect |
| 2026-05-28 | FFF1 Notify                                 | ✅ nRF Connect |
| pending    | CMD_READ_STATUS response parsing            | ⏳ App test |
| pending    | FET control command format (0xE1, 2 bytes)  | ⏳ App test |
| pending    | NTC sensor count on this specific unit      | ⏳ App test |
