import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { listChats } from "../api/chats";
import { useFamily } from "../context/FamilyContext";
import ChatListItem from "../components/ChatListItem";
import { colors, fontSize, spacing } from "../theme";
import type { Chat } from "../api/types";
import type { ChatStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<ChatStackParamList, "ChatsList">;

export default function ChatsListScreen({ navigation }: Props) {
  const { currentFamily, clearFamily } = useFamily();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChats = useCallback(async () => {
    if (!currentFamily) return;
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

  useEffect(() => {
    void loadChats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadChats();
  };

  const handleContactOwner = useCallback(() => {
    // Отдельного «личного» чата с владельцем пока нет — перечитываем список
    // на случай, если владелец только что создал первый чат.
    setLoading(true);
    void loadChats();
  }, [loadChats]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{currentFamily?.family_name ?? ""}</Text>
          <Text style={styles.subtitle}>Чаты</Text>
        </View>
        <TouchableOpacity style={styles.switchBtn} onPress={() => void clearFamily()}>
          <Ionicons name="swap-horizontal-outline" size={26} color={colors.primary} />
          <Text style={styles.switchText}>Семья</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          {/* Тёплая иллюстрация — emoji в круглом цветном контейнере */}
          <View style={styles.emptyIllustration}>
            <Text style={{ fontSize: 36 }}>💌</Text>
          </View>
          <Text style={styles.emptyTitle}>Начните общение</Text>
          <Text style={styles.emptyText}>
            Попросите владельца семьи создать первый чат — или напишите ему напрямую
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={handleContactOwner}>
            <Text style={styles.emptyBtnText}>Написать владельцу</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ChatListItem
              chat={item}
              onPress={() =>
                navigation.navigate("Chat", {
                  chatId: item.id,
                  chatName: item.name,
                  familyId: currentFamily?.family_id ?? "",
                })
              }
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
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
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  switchBtn: { alignItems: "center", paddingTop: spacing.xs },
  switchText: { fontSize: 12, color: colors.primary, marginTop: 2 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f5d5a8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text, marginTop: spacing.lg },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  emptyBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: fontSize.base,
    fontWeight: "600",
  },
});
