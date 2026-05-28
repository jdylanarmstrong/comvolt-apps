import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../theme';

interface Props {
  voltages: number[]; // mV
}

export default function CellBars({ voltages }: Props) {
  if (voltages.length === 0) return null;

  const min = Math.min(...voltages);
  const max = Math.max(...voltages);
  const range = max - min || 1;

  return (
    <View>
      {voltages.map((v, i) => {
        const fill = (v - min) / range;
        const isMin = v === min && range > 0;
        const isMax = v === max && range > 0;
        const barColor = isMin ? colors.danger : isMax ? colors.primary : colors.blue;

        return (
          <View key={i} style={styles.row}>
            <Text style={styles.cellLabel}>C{String(i + 1).padStart(2, '0')}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(fill * 100, 2)}%`,
                    backgroundColor: barColor,
                  },
                ]}
              />
            </View>
            <Text style={[styles.cellValue, isMin && styles.minText, isMax && styles.maxText]}>
              {v} mV
              {isMin ? ' ▼' : isMax ? ' ▲' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  cellLabel: {
    width: 32,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  cellValue: {
    width: 90,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
  minText: { color: colors.danger },
  maxText: { color: colors.primary },
});
