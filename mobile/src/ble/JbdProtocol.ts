// JBD BMS BLE Protocol
// Service:    0000FFF0-0000-1000-8000-00805F9B34FB
// Write (TX): 0000FFF2-0000-1000-8000-00805F9B34FB  (write-without-response)
// Notify (RX):0000FFF1-0000-1000-8000-00805F9B34FB

export const SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB';
export const WRITE_UUID   = '0000FFF2-0000-1000-8000-00805F9B34FB';
export const NOTIFY_UUID  = '0000FFF1-0000-1000-8000-00805F9B34FB';

// Hardcoded read commands (verified checksum: 0x10000 - register = result)
export const CMD_READ_STATUS = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
export const CMD_READ_CELLS  = new Uint8Array([0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77]);
export const CMD_READ_INFO   = new Uint8Array([0xDD, 0xA5, 0x05, 0x00, 0xFF, 0xFB, 0x77]);

// Checksum: sum = reg + len + data_bytes; checksum = 0x10000 - (sum & 0xFFFF)
function jbdChecksum(bytes: number[]): [number, number] {
  const sum = bytes.reduce((a, b) => a + b, 0);
  const ck = (0x10000 - (sum & 0xffff)) & 0xffff;
  return [(ck >> 8) & 0xff, ck & 0xff];
}

// FET control command — NOTE: verify on your hardware before using.
// Some JBD variants use a single control byte instead of two.
// 0x00 = FET on, 0x01 = FET off
export function buildFetCmd(chargeOn: boolean, dischargeOn: boolean): Uint8Array {
  const cb = chargeOn    ? 0x00 : 0x01;
  const db = dischargeOn ? 0x00 : 0x01;
  const [ckH, ckL] = jbdChecksum([0xe1, 0x02, cb, db]);
  return new Uint8Array([0xdd, 0x5a, 0xe1, 0x02, cb, db, ckH, ckL, 0x77]);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BmsStatus {
  voltage: number;        // V (÷100 from 10mV)
  current: number;        // A (÷100, negative = charging)
  remainAh: number;       // Ah
  nominalAh: number;      // Ah
  soc: number;            // 0–100 %
  cycles: number;
  productionDate: string; // "YYYY-MM-DD"
  chargeFetOn: boolean;
  dischargeFetOn: boolean;
  cellCount: number;
  ntcCount: number;
  temps: number[];        // °C, one per sensor
  protectionFlags: number; // raw uint16 bitmask
  balanceLow: number;     // cells 1–16 bitmask
  balanceHigh: number;    // cells 17–32 bitmask
  swVersion: number;
}

export interface BmsCells {
  voltages: number[]; // mV per cell
}

export type BmsFrame =
  | { type: 'status'; data: BmsStatus }
  | { type: 'cells';  data: BmsCells }
  | { type: 'error';  register: number }
  | { type: 'invalid' };

// Human-readable protection flag descriptions (bit index → label)
export const PROTECTION_FLAGS: Record<number, string> = {
  0:  'Cell overvoltage',
  1:  'Cell undervoltage',
  2:  'Pack overvoltage',
  3:  'Pack undervoltage',
  4:  'Charging overtemperature',
  5:  'Charging undertemperature',
  6:  'Discharge overtemperature',
  7:  'Discharge undertemperature',
  8:  'Charging overcurrent',
  9:  'Discharge overcurrent',
  10: 'Short circuit',
  11: 'IC front-end error',
  12: 'MOS software lock',
};

// ─── Encoding / Decoding ──────────────────────────────────────────────────────

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

// ─── Frame Parsing ────────────────────────────────────────────────────────────

function readU16BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 8) | buf[offset + 1]) >>> 0;
}

function readS16BE(buf: Uint8Array, offset: number): number {
  const u = readU16BE(buf, offset);
  return u > 0x7fff ? u - 0x10000 : u;
}

function parseProductionDate(raw: number): string {
  const day   = raw & 0x1f;
  const month = (raw >> 5) & 0x0f;
  const year  = ((raw >> 9) & 0x7f) + 2000;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function verifyFrameChecksum(frame: Uint8Array): boolean {
  // Checksum covers: register + status + data_length + all_data_bytes
  const dataLen = frame[3];
  const covered: number[] = [];
  for (let i = 1; i <= 3 + dataLen; i++) {
    covered.push(frame[i]);
  }
  const [expH, expL] = jbdChecksum(covered);
  return frame[4 + dataLen] === expH && frame[4 + dataLen + 1] === expL;
}

export function parseFrame(frame: Uint8Array): BmsFrame {
  // Minimum valid frame: DD [reg] [status] [len=0] [ck_h] [ck_l] 77 = 7 bytes
  if (frame.length < 7) return { type: 'invalid' };
  if (frame[0] !== 0xdd) return { type: 'invalid' };

  const dataLen = frame[3];
  const totalExpected = 7 + dataLen;
  if (frame.length < totalExpected) return { type: 'invalid' };
  if (frame[4 + dataLen + 2] !== 0x77) return { type: 'invalid' };

  if (!verifyFrameChecksum(frame)) return { type: 'invalid' };

  const register = frame[1];
  const status   = frame[2];

  if (status !== 0x00) return { type: 'error', register };

  const data = frame.slice(4, 4 + dataLen);

  if (register === 0x03) {
    // Status response — dynamic length based on NTC count
    if (data.length < 23) return { type: 'invalid' };

    const ntcCount = data[22];
    const expectedDataLen = 23 + ntcCount * 2;
    if (data.length < expectedDataLen) return { type: 'invalid' };

    const temps: number[] = [];
    for (let i = 0; i < ntcCount; i++) {
      const rawK = readU16BE(data, 23 + i * 2);
      temps.push((rawK - 2731) / 10.0);
    }

    const fetStatus = data[20];

    return {
      type: 'status',
      data: {
        voltage:       readU16BE(data, 0) / 100,
        current:       readS16BE(data, 2) / 100,
        remainAh:      readU16BE(data, 4) / 100,
        nominalAh:     readU16BE(data, 6) / 100,
        soc:           data[19],
        cycles:        readU16BE(data, 8),
        productionDate: parseProductionDate(readU16BE(data, 10)),
        balanceLow:    readU16BE(data, 12),
        balanceHigh:   readU16BE(data, 14),
        protectionFlags: readU16BE(data, 16),
        swVersion:     data[18],
        chargeFetOn:   (fetStatus & 0x01) !== 0,
        dischargeFetOn: (fetStatus & 0x02) !== 0,
        cellCount:     data[21],
        ntcCount,
        temps,
      },
    };
  }

  if (register === 0x04) {
    if (data.length < 2 || data.length % 2 !== 0) return { type: 'invalid' };
    const voltages: number[] = [];
    for (let i = 0; i < data.length; i += 2) {
      voltages.push(readU16BE(data, i));
    }
    return { type: 'cells', data: { voltages } };
  }

  return { type: 'invalid' };
}

// ─── Buffer ───────────────────────────────────────────────────────────────────

export class FrameBuffer {
  private buf: number[] = [];

  append(bytes: Uint8Array): BmsFrame[] {
    for (let i = 0; i < bytes.length; i++) {
      this.buf.push(bytes[i]);
    }
    return this.drain();
  }

  clear(): void {
    this.buf = [];
  }

  private drain(): BmsFrame[] {
    const frames: BmsFrame[] = [];

    while (this.buf.length >= 7) {
      const start = this.buf.indexOf(0xdd);
      if (start === -1) {
        this.buf = [];
        break;
      }
      if (start > 0) {
        this.buf = this.buf.slice(start);
      }
      if (this.buf.length < 4) break;

      const dataLen   = this.buf[3];
      const totalLen  = 7 + dataLen;

      if (this.buf.length < totalLen) break;

      const frameBytes = new Uint8Array(this.buf.slice(0, totalLen));
      this.buf = this.buf.slice(totalLen);

      const result = parseFrame(frameBytes);
      frames.push(result);
    }

    return frames;
  }
}
