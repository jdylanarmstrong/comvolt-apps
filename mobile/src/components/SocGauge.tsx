import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, fontSize } from '../theme';

interface Props {
  soc: number;        // 0–100
  voltage: number;    // V
  isCharging: boolean;
  isIdle: boolean;
  size?: number;
}

const GAUGE_START_DEG = 225; // bottom-left (7:30 on clock face)
const GAUGE_SPAN_DEG  = 270; // total arc

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const span = endDeg - startDeg;
  if (Math.abs(span) < 0.5) return '';
  const start = polarToXY(cx, cy, r, startDeg);
  const end   = polarToXY(cx, cy, r, endDeg);
  const large = span > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export default function SocGauge({ soc, voltage, isCharging, isIdle, size = 200 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.38;
  const strokeWidth = size * 0.07;

  const endDeg = GAUGE_START_DEG + (Math.max(0, Math.min(100, soc)) / 100) * GAUGE_SPAN_DEG;
  const bgPath  = arcPath(cx, cy, r, GAUGE_START_DEG, GAUGE_START_DEG + GAUGE_SPAN_DEG);
  const socPath = soc > 0 ? arcPath(cx, cy, r, GAUGE_START_DEG, endDeg) : '';

  const arcColor = isIdle
    ? colors.idle
    : isCharging
      ? colors.charging
      : colors.discharging;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Background track */}
        <Path
          d={bgPath}
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* SOC arc */}
        {socPath ? (
          <Path
            d={socPath}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>

      {/* Center text */}
      <Text style={[styles.soc, { fontSize: size * 0.18 }]}>{soc}%</Text>
      <Text style={[styles.voltage, { fontSize: size * 0.08 }]}>{voltage.toFixed(1)} V</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  soc: {
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  voltage: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
});
