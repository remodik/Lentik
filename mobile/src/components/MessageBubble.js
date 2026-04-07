import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

export default function MessageBubble({ message, isOwn }) {
  return (
    <View style={[styles.wrapper, isOwn ? styles.wrapperRight : styles.wrapperLeft]}>
      {!isOwn && (
        <Text style={styles.author}>{message.author_display_name || 'Участник'}</Text>
      )}
      <View style={[styles.bubble, isOwn ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.text, isOwn ? styles.textOwn : styles.textTheirs]}>
          {message.text}
        </Text>
        <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeTheirs]}>
          {formatTime(message.created_at)}
          {message.edited ? '  (изм.)' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: spacing.xs,
    marginHorizontal: spacing.md,
    maxWidth: '80%',
  },
  wrapperRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapperLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  author: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: spacing.sm,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  bubbleMine: {
    backgroundColor: colors.bubbleMine,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.bubbleTheirs,
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: fontSize.base, lineHeight: 26 },
  textOwn: { color: colors.text },
  textTheirs: { color: colors.text },
  time: { fontSize: fontSize.xs, marginTop: 4, alignSelf: 'flex-end' },
  timeOwn: { color: colors.textSecondary },
  timeTheirs: { color: colors.textMuted },
});
