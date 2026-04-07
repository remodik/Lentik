import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getMyFamilies } from '../api/me';
import { createFamily } from '../api/families';
import { useFamily } from '../context/FamilyContext';
import { useAuth } from '../context/AuthContext';
import { colors, fontSize, spacing, radius, buttonH, touchMin } from '../theme';

export default function FamilySelectScreen() {
  const { selectFamily } = useFamily();
  const { logout, user } = useAuth();
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getMyFamilies();
      setFamilies(data);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить список семей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFamilies(); }, []);

  const handleSelect = (fam) => {
    selectFamily({ family_id: fam.family_id, family_name: fam.family_name, role: fam.role });
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      Alert.alert('Ошибка', 'Введите название семьи');
      return;
    }
    setCreating(true);
    try {
      await createFamily(newName.trim());
      setShowModal(false);
      setNewName('');
      await loadFamilies();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Ошибка создания';
      Alert.alert('Ошибка', String(msg));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Заголовок */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Выберите семью</Text>
          <Text style={styles.welcome}>Привет, {user?.display_name}!</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : families.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="home-outline" size={64} color={colors.primaryLight} />
          <Text style={styles.emptyTitle}>Нет ни одной семьи</Text>
          <Text style={styles.emptyText}>Создайте семью или попросите родных прислать инвайт</Text>
        </View>
      ) : (
        <FlatList
          data={families}
          keyExtractor={(f) => f.family_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)} activeOpacity={0.78}>
              <View style={styles.cardIcon}>
                <Ionicons name="home" size={32} color={colors.primary} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{item.family_name}</Text>
                <Text style={styles.cardRole}>
                  {item.role === 'owner' ? 'Владелец' : 'Участник'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {/* Кнопка создать */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
          <Ionicons name="add" size={26} color={colors.white} />
          <Text style={styles.createText}>Создать новую семью</Text>
        </TouchableOpacity>
      </View>

      {/* Модалка создания */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Название семьи</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Например: Семья Ивановых"
              placeholderTextColor={colors.textMuted}
              maxLength={64}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowModal(false); setNewName(''); }}>
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalOk, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
                <Text style={styles.modalOkText}>{creating ? 'Создаю...' : 'Создать'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text },
  welcome: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.xs },
  logoutBtn: { padding: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    minHeight: touchMin + 10,
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
    gap: spacing.md,
  },
  cardIcon: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  cardRole: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 26 },
  footer: { padding: spacing.lg, paddingBottom: spacing.xl },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, height: buttonH,
    borderRadius: radius.md, gap: spacing.sm,
    elevation: 3, shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  createText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  modalInput: {
    backgroundColor: colors.inputBg, borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: buttonH,
    fontSize: fontSize.base, color: colors.text, marginBottom: spacing.lg,
  },
  modalBtns: { flexDirection: 'row', gap: spacing.md },
  modalCancel: { flex: 1, height: buttonH, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  modalCancelText: { fontSize: fontSize.base, fontWeight: '600', color: colors.textSecondary },
  modalOk: { flex: 1, height: buttonH, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  modalOkText: { fontSize: fontSize.base, fontWeight: '700', color: colors.white },
});
