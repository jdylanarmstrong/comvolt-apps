import React, { useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLogStore, LogEntry, LogLevel } from '../store/logStore';
import { colors, spacing, radius, fontSize } from '../theme';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: colors.logDebug,
  info:  colors.logInfo,
  warn:  colors.logWarn,
  error: colors.logError,
};

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const levelColor = LEVEL_COLORS[entry.level];
  return (
    <View style={styles.logRow}>
      <Text style={styles.timestamp}>{formatTime(entry.timestamp)}</Text>
      <View style={[styles.catBadge, { borderColor: levelColor }]}>
        <Text style={[styles.catText, { color: levelColor }]}>{entry.category}</Text>
      </View>
      <View style={styles.msgBlock}>
        <Text style={[styles.message, { color: levelColor }]}>{entry.message}</Text>
        {entry.hex ? (
          <Text style={styles.hex}>{entry.hex}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function LogsScreen() {
  const entries = useLogStore((s) => s.entries);
  const clear   = useLogStore((s) => s.clear);
  const listRef = useRef<FlatList>(null);

  async function handleShare() {
    const text = entries
      .map((e) => {
        const line = `${formatTime(e.timestamp)} [${e.category}] [${e.level.toUpperCase()}] ${e.message}`;
        return e.hex ? `${line}\n  ${e.hex}` : line;
      })
      .join('\n');

    await Share.share({ message: text, title: 'Comvolt BLE Log' });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Logs</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={clear} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No log entries yet — connect to the battery to start logging.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={[...entries].reverse()}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <LogRow entry={item} />}
          onLayout={() => listRef.current?.scrollToOffset({ offset: 0, animated: false })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { padding: spacing.sm },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },

  list: { padding: spacing.sm, gap: 2 },

  logRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  timestamp: {
    fontSize: 10, color: colors.textMuted, fontFamily: 'monospace',
    width: 82, paddingTop: 1,
  },
  catBadge: {
    borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 4, paddingVertical: 1, marginTop: 1,
  },
  catText: { fontSize: 9, fontWeight: '700', fontFamily: 'monospace' },
  msgBlock: { flex: 1 },
  message: { fontSize: 11, fontFamily: 'monospace', flexWrap: 'wrap' },
  hex: {
    fontSize: 10, fontFamily: 'monospace', color: colors.textMuted,
    marginTop: 1, flexWrap: 'wrap',
  },
});
