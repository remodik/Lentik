import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, radius, spacing, touchMin } from '../theme';

export default function ChatListItem({ chat, onPress }) {
  const pinned = chat.pinned_message;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.icon}>
        <Ionicons name="chatbubble-ellipses" size={28} color={colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{chat.name}</Text>
        {pinned ? (
          <Text style={styles.preview} numberOfLines={1}>
            {pinned.preview_text}
          </Text>
        ) : (
          <Text style={styles.noMsg}>Нет сообщений</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touchMin,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.text, marginBottom: 2 },
  preview: { fontSize: fontSize.sm, color: colors.textSecondary },
  noMsg: { fontSize: fontSize.sm, color: colors.textMuted, fontStyle: 'italic' },
});
