import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, radius, spacing } from '../theme';

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

export default function PinKeypad({ onPress, onDelete }) {
  return (
    <View style={styles.container}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key, ci) => {
            if (key === '') return <View key={ci} style={styles.empty} />;
            if (key === 'del') {
              return (
                <TouchableOpacity
                  key={ci}
                  style={styles.key}
                  onPress={onDelete}
                  activeOpacity={0.65}
                >
                  <Ionicons name="backspace-outline" size={30} color={colors.text} />
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={ci}
                style={styles.key}
                onPress={() => onPress(key)}
                activeOpacity={0.65}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const KEY_SIZE = 82;

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    gap: spacing.lg,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  keyText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  empty: { width: KEY_SIZE, height: KEY_SIZE },
});
