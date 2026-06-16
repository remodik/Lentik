import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getMessages, sendMessage } from "../api/chats";
import { getWsTicket } from "../api/auth";
import { apiErrorMessage } from "../api/errors";
import { API_BASE_URL } from "../config";
import { useAuth } from "../context/AuthContext";
import MessageBubble from "../components/MessageBubble";
import { colors, fontSize, spacing, radius, buttonH } from "../theme";
import type { Message } from "../api/types";
import type { ChatStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<ChatStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const { chatId, chatName, familyId } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const { data } = await getMessages(familyId, chatId);
      setMessages(data);
    } catch {
      // Тихая ошибка
    } finally {
      setLoading(false);
    }
  }, [familyId, chatId]);

  // Подключение WebSocket. Бэкенд для WS принимает cookie или ?ticket= (НЕ ?token=),
  // поэтому берём одноразовый тикет по Bearer и подключаемся с ним.
  const connectWs = useCallback(async () => {
    try {
      const ticket = await getWsTicket();
      if (!ticket) return;
      const wsBase = API_BASE_URL.replace(/^http/, "ws");
      const url = `${wsBase}/families/${familyId}/chats/${chatId}/ws?ticket=${encodeURIComponent(
        ticket,
      )}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25000);
      };

      ws.onmessage = (event) => {
        const raw = event.data as string;
        if (raw === "pong") return;
        try {
          const payload = JSON.parse(raw);
          if (payload.type === "new_message") {
            setMessages((prev) => [...prev, payload.message as Message]);
          } else if (payload.type === "message_deleted") {
            setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
          } else if (payload.type === "message_edited") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.message.id
                  ? { ...m, text: payload.message.text, edited: true }
                  : m,
              ),
            );
          }
        } catch {}
      };

      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => {
        setWsConnected(false);
        if (pingRef.current) clearInterval(pingRef.current);
      };
    } catch {}
  }, [familyId, chatId]);

  useEffect(() => {
    void loadMessages();
    void connectWs();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    const prevText = trimmed;
    setText("");
    try {
      await sendMessage(familyId, chatId, prevText);
      // Новое сообщение придёт через WS; если WS недоступен — перезагружаем
      if (!wsConnected) await loadMessages();
    } catch (err) {
      setText(prevText);
      Alert.alert("Ошибка", apiErrorMessage(err, "Ошибка отправки"));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.chatName} numberOfLines={1}>
            {chatName}
          </Text>
          <View style={styles.wsStatus}>
            <View
              style={[
                styles.wsDot,
                { backgroundColor: wsConnected ? colors.online : colors.offline },
              ]}
            />
            <Text style={styles.wsText}>{wsConnected ? "онлайн" : "оффлайн"}</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-outline" size={56} color={colors.primaryLight} />
            <Text style={styles.emptyText}>Нет сообщений. Напишите первым!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.author_id === user?.id} />
            )}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Сообщение..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            <Ionicons
              name={sending ? "hourglass-outline" : "send"}
              size={26}
              color={colors.white}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  back: { padding: spacing.sm },
  headerMid: { flex: 1 },
  chatName: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  wsStatus: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  wsDot: { width: 8, height: 8, borderRadius: 4 },
  wsText: { fontSize: fontSize.xs, color: colors.textSecondary },
  messageList: { paddingVertical: spacing.sm, paddingBottom: spacing.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === "ios" ? 14 : 10,
    paddingBottom: Platform.OS === "ios" ? 14 : 10,
    fontSize: fontSize.base,
    color: colors.text,
    maxHeight: 140,
    minHeight: buttonH,
    lineHeight: 24,
  },
  sendBtn: {
    width: buttonH,
    height: buttonH,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  sendDisabled: { backgroundColor: colors.primaryLight },
});
