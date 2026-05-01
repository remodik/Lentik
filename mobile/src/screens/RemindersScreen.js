import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput,
  RefreshControl, Alert, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  listReminders, createReminder, toggleReminderDone, deleteReminder,
} from '../api/reminders';
import { useFamily } from '../context/FamilyContext';
import { useAuth } from '../context/AuthContext';
import { colors, fontSize, spacing, radius, buttonH } from '../theme';

const REPEAT_LABELS = {
  none: 'Не повторять',
  daily: 'Каждый день',
  weekly: 'Каждую неделю',
  monthly: 'Каждый месяц',
};

const REPEAT_SHORT = {
  none: '',
  daily: 'каждый день',
  weekly: 'каждую неделю',
  monthly: 'каждый месяц',
};

// ---------- helpers ----------

const pad2 = (n) => String(n).padStart(2, '0');

const toLocalIso = (date) => {
  // ISO с местным временем + смещением, чтобы бэкенд получил TZ-aware datetime
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const tzh = pad2(Math.floor(Math.abs(tz) / 60));
  const tzm = pad2(Math.abs(tz) % 60);
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00${sign}${tzh}:${tzm}`
  );
};

const fromIsoLocal = (iso) => new Date(iso);

const formatWhen = (iso) => {
  const d = fromIsoLocal(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (sameDay) return `Сегодня в ${time}`;
  if (isTomorrow) return `Завтра в ${time}`;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} в ${time}`;
};

const isOverdue = (iso, isDone) => {
  if (isDone) return false;
  return fromIsoLocal(iso).getTime() < Date.now();
};

const isToday = (iso) => {
  const d = fromIsoLocal(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const initialRemindAt = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
};

// ---------- screen ----------

export default function RemindersScreen() {
  const { currentFamily } = useFamily();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('upcoming'); // upcoming | all | done
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDate, setFormDate] = useState(initialRemindAt());
  const [formRepeat, setFormRepeat] = useState('none');
  const [formPersonal, setFormPersonal] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const { data } = await listReminders(currentFamily.family_id);
      setItems(data);
    } catch {
      // тихая ошибка
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFamily]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'done') return items.filter((r) => r.is_done);
    return items.filter((r) => !r.is_done);
  }, [items, filter]);

  const openAdd = () => {
    setFormTitle('');
    setFormNotes('');
    setFormDate(initialRemindAt());
    setFormRepeat('none');
    setFormPersonal(false);
    setShowAdd(true);
  };

  const handleSave = async () => {
    const title = formTitle.trim();
    if (!title) {
      Alert.alert('Ошибка', 'Введите название напоминания');
      return;
    }
    if (formDate.getTime() < Date.now() - 60 * 1000 && formRepeat === 'none') {
      Alert.alert(
        'Время в прошлом',
        'Указанное время уже прошло. Сохранить всё равно?',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сохранить', onPress: () => doSave(title) },
        ],
      );
      return;
    }
    doSave(title);
  };

  const doSave = async (title) => {
    setSaving(true);
    try {
      await createReminder(currentFamily.family_id, {
        title,
        notes: formNotes.trim() || null,
        remind_at: toLocalIso(formDate),
        is_personal: formPersonal,
        repeat_rule: formRepeat,
      });
      setShowAdd(false);
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Не удалось сохранить';
      Alert.alert('Ошибка', String(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r) => {
    try {
      await toggleReminderDone(r.id);
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Не удалось обновить';
      Alert.alert('Ошибка', String(msg));
    }
  };

  const handleDelete = (r) => {
    if (r.author_id !== user?.id) {
      Alert.alert('Нельзя удалить', 'Удалять может только автор напоминания');
      return;
    }
    Alert.alert(
      'Удалить?',
      `Удалить «${r.title}»?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReminder(r.id);
              await loadAll();
            } catch (err) {
              const msg = err?.response?.data?.detail || 'Не удалось удалить';
              Alert.alert('Ошибка', String(msg));
            }
          },
        },
      ],
    );
  };

  // ---------- date/time stepper helpers ----------

  const shiftDate = (delta) => {
    const d = new Date(formDate);
    d.setDate(d.getDate() + delta);
    setFormDate(d);
  };

  const setToday = () => {
    const d = new Date();
    d.setHours(formDate.getHours(), formDate.getMinutes(), 0, 0);
    if (d.getTime() < Date.now()) {
      // если сегодня уже прошло — на час вперёд
      d.setHours(new Date().getHours() + 1, 0, 0, 0);
    }
    setFormDate(d);
  };

  const shiftHours = (delta) => {
    const d = new Date(formDate);
    d.setHours(d.getHours() + delta);
    setFormDate(d);
  };

  const shiftMinutes = (delta) => {
    const d = new Date(formDate);
    d.setMinutes(d.getMinutes() + delta);
    setFormDate(d);
  };

  // ---------- render ----------

  const renderItem = ({ item }) => {
    const overdue = isOverdue(item.remind_at, item.is_done);
    const today = isToday(item.remind_at);
    const repeatShort = REPEAT_SHORT[item.repeat_rule];
    return (
      <View
        style={[
          styles.row,
          item.is_done && styles.rowDone,
          overdue && styles.rowOverdue,
          today && !item.is_done && !overdue && styles.rowToday,
        ]}
      >
        <TouchableOpacity
          onPress={() => handleToggle(item)}
          style={styles.checkBox}
          activeOpacity={0.7}
        >
          {item.is_done ? (
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
          ) : (
            <Ionicons name="ellipse-outline" size={32} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        <View style={styles.rowInfo}>
          <Text
            style={[
              styles.rowTitle,
              item.is_done && { textDecorationLine: 'line-through', color: colors.textMuted },
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          {item.notes ? (
            <Text style={styles.rowNotes} numberOfLines={2}>{item.notes}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons
              name={overdue ? 'alert-circle' : 'time-outline'}
              size={14}
              color={overdue ? colors.error : colors.textSecondary}
            />
            <Text style={[styles.rowMeta, overdue && { color: colors.error, fontWeight: '700' }]}>
              {formatWhen(item.remind_at)}
            </Text>
            {repeatShort ? (
              <>
                <Text style={styles.rowMeta}> · </Text>
                <Ionicons name="repeat" size={14} color={colors.primary} />
                <Text style={[styles.rowMeta, { color: colors.primary }]}>{repeatShort}</Text>
              </>
            ) : null}
            {item.is_personal && (
              <>
                <Text style={styles.rowMeta}> · </Text>
                <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
                <Text style={styles.rowMeta}>личное</Text>
              </>
            )}
          </View>
          {item.author_name && !item.is_personal ? (
            <Text style={styles.rowAuthor}>от {item.author_name}</Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn} activeOpacity={0.6}>
          <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>Напоминания</Text>
        <TouchableOpacity style={styles.addBtnInline} onPress={openAdd} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={32} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {[
          { key: 'upcoming', label: 'Активные' },
          { key: 'all', label: 'Все' },
          { key: 'done', label: 'Готовые' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="alarm-outline" size={64} color={colors.primaryLight} />
              <Text style={styles.emptyTitle}>
                {filter === 'done' ? 'Нет выполненных' : 'Нет напоминаний'}
              </Text>
              <Text style={styles.emptyText}>
                {filter === 'done'
                  ? 'Здесь появятся выполненные пункты'
                  : 'Нажмите «+», чтобы добавить первое'}
              </Text>
              {filter !== 'done' && (
                <TouchableOpacity style={styles.emptyBtn} onPress={openAdd} activeOpacity={0.85}>
                  <Ionicons name="add" size={24} color={colors.white} />
                  <Text style={styles.emptyBtnText}>Добавить напоминание</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={renderItem}
        />
      )}

      {/* Модалка создания */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Новое напоминание</Text>

              <Text style={styles.fieldLabel}>Что напомнить</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Например: принять таблетки"
                placeholderTextColor={colors.textMuted}
                maxLength={200}
              />

              <Text style={styles.fieldLabel}>Заметка (необязательно)</Text>
              <TextInput
                style={[styles.input, { minHeight: 70, paddingTop: spacing.sm }]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Дополнительные детали"
                placeholderTextColor={colors.textMuted}
                maxLength={2000}
                multiline
              />

              {/* Дата */}
              <Text style={styles.fieldLabel}>Дата</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => shiftDate(-1)} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={26} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>
                  {pad2(formDate.getDate())}.{pad2(formDate.getMonth() + 1)}.{formDate.getFullYear()}
                </Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => shiftDate(1)} activeOpacity={0.7}>
                  <Ionicons name="chevron-forward" size={26} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={setToday}>
                <Text style={styles.todayLink}>Сегодня</Text>
              </TouchableOpacity>

              {/* Время: часы + минуты */}
              <Text style={styles.fieldLabel}>Время</Text>
              <View style={styles.timeRow}>
                <View style={styles.timeBlock}>
                  <TouchableOpacity style={styles.timeBtn} onPress={() => shiftHours(1)} activeOpacity={0.7}>
                    <Ionicons name="chevron-up" size={24} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.timeValue}>{pad2(formDate.getHours())}</Text>
                  <TouchableOpacity style={styles.timeBtn} onPress={() => shiftHours(-1)} activeOpacity={0.7}>
                    <Ionicons name="chevron-down" size={24} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.timeUnit}>часы</Text>
                </View>
                <Text style={styles.timeColon}>:</Text>
                <View style={styles.timeBlock}>
                  <TouchableOpacity style={styles.timeBtn} onPress={() => shiftMinutes(5)} activeOpacity={0.7}>
                    <Ionicons name="chevron-up" size={24} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.timeValue}>{pad2(formDate.getMinutes())}</Text>
                  <TouchableOpacity style={styles.timeBtn} onPress={() => shiftMinutes(-5)} activeOpacity={0.7}>
                    <Ionicons name="chevron-down" size={24} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.timeUnit}>минуты</Text>
                </View>
              </View>

              {/* Повторение */}
              <Text style={styles.fieldLabel}>Повторение</Text>
              <View style={styles.repeatGrid}>
                {Object.entries(REPEAT_LABELS).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.repeatChip, formRepeat === key && styles.repeatChipActive]}
                    onPress={() => setFormRepeat(key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.repeatText, formRepeat === key && { color: colors.white }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Личное */}
              <View style={styles.personalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Только для меня</Text>
                  <Text style={styles.personalHint}>
                    Остальные участники семьи не увидят это напоминание
                  </Text>
                </View>
                <Switch
                  value={formPersonal}
                  onValueChange={setFormPersonal}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={formPersonal ? colors.primary : colors.textMuted}
                />
              </View>

              <View style={{ height: spacing.md }} />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveText}>Сохранить</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowAdd(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  addBtnInline: { padding: 4 },

  filterRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  filterChip: {
    flex: 1, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, backgroundColor: colors.surfaceWarm,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: colors.white },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
    borderLeftWidth: 4, borderLeftColor: colors.border,
  },
  rowDone: { opacity: 0.6 },
  rowOverdue: { borderLeftColor: colors.error },
  rowToday: { borderLeftColor: colors.primary },
  checkBox: { padding: 4 },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  rowNotes: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  rowMeta: { fontSize: fontSize.xs, color: colors.textSecondary },
  rowAuthor: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: spacing.xs },

  empty: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl, height: buttonH,
    borderRadius: radius.md, marginTop: spacing.xl,
  },
  emptyBtnText: { fontSize: fontSize.base, fontWeight: '700', color: colors.white },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 40,
    maxHeight: '92%',
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },

  fieldLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    minHeight: buttonH,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },

  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.inputBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    height: buttonH, paddingHorizontal: spacing.sm,
  },
  stepperBtn: { padding: spacing.sm },
  stepperValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  todayLink: {
    fontSize: fontSize.sm, color: colors.primary, fontWeight: '600',
    marginTop: spacing.xs, alignSelf: 'flex-end',
  },

  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.inputBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  timeBlock: { alignItems: 'center', minWidth: 80 },
  timeBtn: { padding: 4 },
  timeValue: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text, paddingVertical: 2 },
  timeUnit: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  timeColon: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text },

  repeatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  repeatChip: {
    paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1, borderColor: colors.border,
  },
  repeatChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  repeatText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },

  personalRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  personalHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  saveBtn: {
    height: buttonH, backgroundColor: colors.primary,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveText: { fontSize: fontSize.base, fontWeight: '700', color: colors.white },
  cancelBtn: {
    height: buttonH, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  cancelText: { fontSize: fontSize.base, fontWeight: '600', color: colors.textSecondary },
});
