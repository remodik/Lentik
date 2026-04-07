import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listChats } from '../api/chats';
import { useFamily } from '../context/FamilyContext';
import ChatListItem from '../components/ChatListItem';
import { colors, fontSize, spacing, radius } from '../theme';

export default function ChatsListScreen({ navigation }) {
  const { currentFamily, clearFamily } = useFamily();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChats = useCallback(async () => {
    try {
      const { data } = await listChats(currentFamily.family_id);
      setChats(data);
    } catch {
      // Оставляем пустой список при ошибке
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFamily]);

  useEffect(() => { loadChats(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadChats();
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Шапка */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{currentFamily.family_name}</Text>
          <Text style={styles.subtitle}>Чаты</Text>
        </View>
        <TouchableOpacity style={styles.switchBtn} onPress={clearFamily}>
          <Ionicons name="swap-horizontal-outline" size={26} color={colors.primary} />
          <Text style={styles.switchText}>Семья</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.primaryLight} />
          <Text style={styles.emptyTitle}>Нет чатов</Text>
          <Text style={styles.emptyText}>Чаты создаёт владелец семьи</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ChatListItem
              chat={item}
              onPress={() =>
                navigation.navigate('Chat', {
                  chatId: item.id,
                  chatName: item.name,
                  familyId: currentFamily.family_id,
                })
              }
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  switchBtn: { alignItems: 'center', paddingTop: spacing.xs },
  switchText: { fontSize: 12, color: colors.primary, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
});
