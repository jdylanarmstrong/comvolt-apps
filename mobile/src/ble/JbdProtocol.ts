// Comvolt / YNT BMS BLE Protocol  (device: YNT5720)
//
// IMPORTANT: despite advertising JBD-style UUIDs (service FFF0, write FFF2,
// notify FFF1), this device does NOT speak the JBD protocol. It auto-broadcasts
// its own framing on the notify characteristic, ignoring whatever we write.
//
// Frame layout (confirmed against the stock Comvolt app on a YNT5720):
//   0x99 [cmd] [addr=0xC3] [len] [payload(len bytes)] [0x59] [crc_hi] [crc_lo]
//   total length = 7 + len
//
// Status frame is cmd=0xA0, len=0x16 (22). Payload byte map (empirically verified):
//   [1]      SOC %                         (0x64 = 100%)
//   [2:4]    remaining capacity, 0.1Ah     (0x1257 = 469.5 Ah)
//   [9:11]   pack voltage, 10mV            (0x0578 = 14.00 V)
//   [11:13]  current, 10mA signed  *GUESS* (0 at rest — verify under load)
//   [13]     cell count                    (0x04)
//   [16:18]  max cell voltage, mV          (0x0DB0 = 3504 mV)
//   [18:20]  min cell voltage, mV          (0x0DAA = 3498 mV)
//
// Info frame is cmd=0xA1, len=0x08: payload[6:8] = serial (0x1658 = 5720).

export const SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB';
export const WRITE_UUID   = '0000FFF2-0000-1000-8000-00805F9B34FB';
export const NOTIFY_UUID  = '0000FFF1-0000-1000-8000-00805F9B34FB';

export const FRAME_START = 0x99;
export const TRAILER_MARK = 0x59; // first of the 3-byte trailer (0x59 + crc16)

// The device auto-streams data; these legacy JBD reads are kept only as harmless
// keep-alive pokes (the YNT5720 ignores them). Empty arrays are skipped by the
// writer, so they never hit the wire if we decide to stop poking.
export const CMD_READ_STATUS = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
export const CMD_READ_CELLS  = new Uint8Array([0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77]);
export const CMD_READ_INFO   = new Uint8Array([0xDD, 0xA5, 0x05, 0x00, 0xFF, 0xFB, 0x77]);

// FET/switch control command for this device is not yet reverse-engineered.
// Returns an empty array (the writer skips empty payloads) so the Settings
// screen still compiles without sending anything bogus to the battery.
// TODO: capture the stock app's main-switch / inverter toggle and decode it.
export function buildFetCmd(_chargeOn: boolean, _dischargeOn: boolean): Uint8Array {
  return new Uint8Array([]);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BmsStatus {
  voltage: number;        // V
  current: number;        // A  (+ discharge, − charge)  *offset unverified*
  remainAh: number;       // Ah
  nominalAh: number;      // Ah (derived from remain / SOC)
  soc: number;            // 0–100 %
  cycles: number;         // unknown over BLE → 0
  productionDate: string; // unknown over BLE → '—'
  chargeFetOn: boolean;   // unknown mapping → true (battery operational)
  dischargeFetOn: boolean;
  cellCount: number;
  ntcCount: number;       // temps not exposed over BLE → 0
  temps: number[];        // °C, empty for this device
  protectionFlags: number; // fault bit map TBD → 0
  balanceLow: number;     // not exposed → 0
  balanceHigh: number;    // not exposed → 0
  swVersion: number;      // unknown → 0
  maxCellmV: number;
  minCellmV: number;
  rawPayload: string;          // hex of the status payload, for debugging
  currentCandidatesStr: string; // candidate current offsets, for load-test debugging
}

export interface BmsCells {
  voltages: number[]; // mV — for this device: [maxCell, minCell]
}

export type BmsFrame =
  | { type: 'status'; data: BmsStatus }
  | { type: 'cells';  data: BmsCells }
  | { type: 'info';   serial: number }
  | { type: 'unknown'; cmd: number; len: number }
  | { type: 'invalid' };

// Kept for the Alarms screen. The Comvolt fault bit map isn't decoded yet, so
// protectionFlags is always 0 (= all clear) until we capture a fault.
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

/**
 * While the current byte-offset is unverified, log every plausible candidate so
 * that the moment a load is applied we can see which field moves off zero.
 * Returns a compact string for the debug log.
 */
export function currentCandidates(payload: Uint8Array): string {
  const s16 = (o: number) => (o + 1 < payload.length ? readS16BE(payload, o) : 0);
  return `[4]=${s16(4)} [6]=${s16(6)} [11]=${s16(11)} [13]=${s16(13)}`;
}

export function parseFrame(frame: Uint8Array): BmsFrame {
  if (frame.length < 7) return { type: 'invalid' };
  if (frame[0] !== FRAME_START) return { type: 'invalid' };

  const cmd = frame[1];
  const len = frame[3];
  const total = 7 + len;
  if (frame.length < total) return { type: 'invalid' };
  // Trailer sanity check: the 3-byte trailer always starts with 0x59.
  if (frame[4 + len] !== TRAILER_MARK) return { type: 'invalid' };

  const payload = frame.slice(4, 4 + len);

  // Main status frame
  if (cmd === 0xa0 && len === 0x16) {
    const soc      = payload[1];
    const remainAh = readU16BE(payload, 2) / 10;
    const voltage  = readU16BE(payload, 9) / 100;
    const current  = readS16BE(payload, 11) / 100; // GUESS — verify under load
    const cellCount = payload[13];
    const maxCellmV = readU16BE(payload, 16);
    const minCellmV = readU16BE(payload, 18);
    const nominalAh = soc > 0 ? remainAh / (soc / 100) : remainAh;

    return {
      type: 'status',
      data: {
        voltage,
        current,
        remainAh,
        nominalAh,
        soc,
        cycles: 0,
        productionDate: '—',
        chargeFetOn: true,
        dischargeFetOn: true,
        cellCount,
        ntcCount: 0,
        temps: [],
        protectionFlags: 0,
        balanceLow: 0,
        balanceHigh: 0,
        swVersion: 0,
        maxCellmV,
        minCellmV,
        rawPayload: toHexString(payload),
        currentCandidatesStr: currentCandidates(payload),
      },
    };
  }

  // Info frame (serial number)
  if (cmd === 0xa1 && len >= 0x08) {
    return { type: 'info', serial: readU16BE(payload, 6) };
  }

  // Other broadcast frames (e.g. cmd 0xA0/len 0x1F = output channels) — not
  // decoded yet. Report as 'unknown' so the buffer doesn't treat them as errors.
  return { type: 'unknown', cmd, len };
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
      const start = this.buf.indexOf(FRAME_START);
      if (start === -1) {
        this.buf = [];
        break;
      }
      if (start > 0) {
        this.buf = this.buf.slice(start);
      }
      if (this.buf.length < 7) break;

      const len = this.buf[3];
      const total = 7 + len;
      if (this.buf.length < total) break; // wait for the rest of the frame

      // Validate trailer marker; if wrong, this 0x99 was spurious — resync.
      if (this.buf[4 + len] !== TRAILER_MARK) {
        this.buf = this.buf.slice(1);
        continue;
      }

      const frameBytes = new Uint8Array(this.buf.slice(0, total));
      this.buf = this.buf.slice(total);
      frames.push(parseFrame(frameBytes));
    }

    return frames;
  }
}
