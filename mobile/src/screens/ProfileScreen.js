import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, Modal,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getMe, getMyFamilies } from '../api/me';
import { getFamily } from '../api/families';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../context/FamilyContext';
import { colors, fontSize, spacing, radius, buttonH, touchMin } from '../theme';

const roleLabel = (role) => (role === 'owner' ? 'Владелец' : 'Участник');

export default function ProfileScreen() {
  const { user, logout, setUser } = useAuth();
  const { currentFamily, selectFamily, clearFamily } = useFamily();
  const [familyDetail, setFamilyDetail] = useState(null);
  const [allFamilies, setAllFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFamilyModal, setShowFamilyModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [famRes, famListRes] = await Promise.all([
        getFamily(currentFamily.family_id),
        getMyFamilies(),
      ]);
      setFamilyDetail(famRes.data);
      setAllFamilies(famListRes.data);
    } catch {
      // Тихая ошибка
    } finally {
      setLoading(false);
    }
  }, [currentFamily]);

  useEffect(() => { loadData(); }, []);

  const handleLogout = () => {
    Alert.alert('Выйти?', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  const handleSwitchFamily = (fam) => {
    selectFamily({ family_id: fam.family_id, family_name: fam.family_name, role: fam.role });
    setShowFamilyModal(false);
  };

  const avatarInitial = user?.display_name?.charAt(0)?.toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} colors={[colors.primary]} />}
      >
        {/* Аватар и имя */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarInitial}</Text>
          </View>
          <Text style={styles.displayName}>{user?.display_name}</Text>
          <Text style={styles.username}>@{user?.username}</Text>
          {user?.bio && (
            <Text style={styles.bio}>{user.bio}</Text>
          )}
        </View>

        {/* Секция семьи */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Текущая семья</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Ionicons name="home" size={26} color={colors.primary} />
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>{currentFamily.family_name}</Text>
                <Text style={styles.cardSub}>{roleLabel(currentFamily.role)}</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ margin: spacing.md }} />
            ) : familyDetail ? (
              <View style={styles.membersList}>
                <Text style={styles.membersTitle}>Участники ({familyDetail.members.length})</Text>
                {familyDetail.members.map((m) => (
                  <View key={m.user_id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{m.display_name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{m.display_name}</Text>
                      <Text style={styles.memberRole}>{roleLabel(m.role)}</Text>
                    </View>
                    <View style={[styles.onlineDot, { backgroundColor: m.is_online ? colors.online : colors.offline }]} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* Кнопки */}
        <View style={styles.section}>
          {allFamilies.length > 1 && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowFamilyModal(true)} activeOpacity={0.8}>
              <Ionicons name="swap-horizontal-outline" size={24} color={colors.primary} />
              <Text style={styles.actionText}>Сменить семью</Text>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionBtn} onPress={clearFamily} activeOpacity={0.8}>
            <Ionicons name="exit-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>Выйти из семьи</Text>
            <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionBtn, styles.logoutBtn]} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={24} color={colors.error} />
            <Text style={[styles.actionText, { color: colors.error }]}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Lentik v1.0</Text>
      </ScrollView>

      {/* Модалка выбора семьи */}
      <Modal visible={showFamilyModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Выберите семью</Text>
            {allFamilies.map((fam) => (
              <TouchableOpacity
                key={fam.family_id}
                style={[styles.famRow, fam.family_id === currentFamily.family_id && styles.famRowActive]}
                onPress={() => handleSwitchFamily(fam)}
                activeOpacity={0.75}
              >
                <Ionicons name="home" size={24} color={fam.family_id === currentFamily.family_id ? colors.white : colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.famName, fam.family_id === currentFamily.family_id && { color: colors.white }]}>
                    {fam.family_name}
                  </Text>
                  <Text style={[styles.famRole, fam.family_id === currentFamily.family_id && { color: colors.primaryLight }]}>
                    {roleLabel(fam.role)}
                  </Text>
                </View>
                {fam.family_id === currentFamily.family_id && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.white} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowFamilyModal(false)}>
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  avatarSection: { alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  avatarText: { fontSize: fontSize['3xl'], fontWeight: '800', color: colors.white },
  displayName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  username: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.xs },
  bio: { fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 24 },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardContent: { flex: 1 },
  cardLabel: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  membersList: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  membersTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  memberAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: fontSize.base, fontWeight: '700', color: colors.primary },
  memberInfo: { flex: 1 },
  memberName: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  memberRole: { fontSize: fontSize.xs, color: colors.textSecondary },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, height: buttonH, marginBottom: spacing.sm, gap: spacing.md, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 2 },
  actionText: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  logoutBtn: { borderWidth: 1.5, borderColor: colors.error + '40', backgroundColor: colors.surface },
  version: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  famRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceWarm },
  famRowActive: { backgroundColor: colors.primary },
  famName: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  famRole: { fontSize: fontSize.sm, color: colors.textSecondary },
  modalClose: { height: buttonH, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, marginTop: spacing.sm },
  modalCloseText: { fontSize: fontSize.base, fontWeight: '600', color: colors.textSecondary },
});
