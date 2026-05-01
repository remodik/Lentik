import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, TextInput,
  RefreshControl, Alert, ScrollView, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  listTransactions, createTransaction, getMonthSummary,
  deleteTransaction, getCategories, getBalances,
} from '../api/budget';
import { getFamily } from '../api/families';
import { useFamily } from '../context/FamilyContext';
import { useAuth } from '../context/AuthContext';
import { colors, fontSize, spacing, radius, buttonH } from '../theme';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const CATEGORY_LABELS = {
  // доходы
  salary: 'Зарплата',
  pension: 'Пенсия',
  gift: 'Подарок',
  other_income: 'Другой доход',
  // расходы
  groceries: 'Продукты',
  utilities: 'Коммуналка',
  transport: 'Транспорт',
  health: 'Здоровье',
  entertainment: 'Развлечения',
  education: 'Образование',
  clothing: 'Одежда',
  household: 'Хозяйство',
  other_expense: 'Прочее',
};

const CATEGORY_ICONS = {
  salary: 'wallet-outline',
  pension: 'cash-outline',
  gift: 'gift-outline',
  other_income: 'trending-up-outline',
  groceries: 'cart-outline',
  utilities: 'flash-outline',
  transport: 'bus-outline',
  health: 'medkit-outline',
  entertainment: 'film-outline',
  education: 'book-outline',
  clothing: 'shirt-outline',
  household: 'home-outline',
  other_expense: 'pricetag-outline',
};

const labelFor = (cat) => CATEGORY_LABELS[cat] || cat;
const iconFor = (cat, type) =>
  CATEGORY_ICONS[cat] || (type === 'income' ? 'trending-up-outline' : 'pricetag-outline');

const formatAmount = (val) => {
  const n = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (!Number.isFinite(n)) return '0,00';
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

// Делит сумму поровну между N участниками с компенсацией остатка в копейках на первом
const splitEqually = (amount, userIds) => {
  const n = userIds.length;
  if (n === 0) return [];
  const totalCents = Math.round(amount * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainder = totalCents - baseCents * n;
  return userIds.map((uid, idx) => ({
    user_id: uid,
    share: ((baseCents + (idx < remainder ? 1 : 0)) / 100).toFixed(2),
  }));
};

export default function BudgetScreen() {
  const { currentFamily } = useFamily();
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filter, setFilter] = useState('all'); // all | income | expense
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [members, setMembers] = useState([]); // [{user_id, display_name, ...}]
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showBalances, setShowBalances] = useState(false);

  // форма создания
  const [formType, setFormType] = useState('expense');
  const [formCategory, setFormCategory] = useState('groceries');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(todayIso());
  const [formShared, setFormShared] = useState(false);
  const [formPaidBy, setFormPaidBy] = useState(null);
  const [formParticipants, setFormParticipants] = useState({}); // {user_id: true/false}
  const [formCustomShares, setFormCustomShares] = useState({}); // {user_id: '123.45'}
  const [formEqual, setFormEqual] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const filterType = filter === 'all' ? undefined : filter;
      const [txRes, sumRes, catRes, famRes, balRes] = await Promise.all([
        listTransactions(currentFamily.family_id, { year, month, type: filterType }),
        getMonthSummary(currentFamily.family_id, year, month),
        getCategories(currentFamily.family_id),
        getFamily(currentFamily.family_id),
        getBalances(currentFamily.family_id),
      ]);
      setItems(txRes.data);
      setSummary(sumRes.data);
      setCategories(catRes.data);
      setMembers(famRes.data.members || []);
      setBalances(balRes.data || []);
    } catch {
      // тихая ошибка
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFamily, year, month, filter]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const onRefresh = () => { setRefreshing(true); loadAll(); };

  const goPrev = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else { setMonth(month - 1); }
  };
  const goNext = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else { setMonth(month + 1); }
  };

  const openAdd = (type) => {
    setFormType(type);
    setFormCategory(type === 'income' ? 'salary' : 'groceries');
    setFormAmount('');
    setFormDescription('');
    setFormDate(todayIso());
    setFormShared(false);
    setFormPaidBy(user?.id || null);
    const allOn = {};
    members.forEach((m) => { allOn[m.user_id] = true; });
    setFormParticipants(allOn);
    setFormCustomShares({});
    setFormEqual(true);
    setShowAdd(true);
  };

  const buildSplitsPayload = (amountNum) => {
    if (!formShared) return null;
    const selectedIds = members
      .filter((m) => formParticipants[m.user_id])
      .map((m) => m.user_id);
    if (selectedIds.length === 0) return null;

    if (formEqual) {
      return splitEqually(amountNum, selectedIds);
    }
    // кастомные доли
    const splits = selectedIds.map((uid) => ({
      user_id: uid,
      share: (parseFloat((formCustomShares[uid] || '0').replace(',', '.')) || 0).toFixed(2),
    }));
    return splits;
  };

  const handleSave = async () => {
    const amount = parseFloat(formAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Ошибка', 'Укажите корректную сумму');
      return;
    }
    if (!formCategory) {
      Alert.alert('Ошибка', 'Выберите категорию');
      return;
    }

    let splits = null;
    if (formShared) {
      splits = buildSplitsPayload(amount);
      if (!splits || splits.length === 0) {
        Alert.alert('Ошибка', 'Выберите хотя бы одного участника');
        return;
      }
      const sum = splits.reduce((acc, s) => acc + parseFloat(s.share), 0);
      if (Math.abs(sum - amount) > 0.01) {
        Alert.alert('Ошибка', `Сумма долей (${formatAmount(sum)}) должна равняться ${formatAmount(amount)}`);
        return;
      }
      if (!formPaidBy) {
        Alert.alert('Ошибка', 'Укажите, кто заплатил');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        type: formType,
        category: formCategory,
        amount: amount.toFixed(2),
        description: formDescription.trim() || null,
        occurred_on: formDate,
      };
      if (formShared) {
        payload.paid_by = formPaidBy;
        payload.splits = splits;
      }
      await createTransaction(currentFamily.family_id, payload);
      setShowAdd(false);
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Не удалось сохранить';
      Alert.alert('Ошибка', String(msg));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (tx) => {
    Alert.alert(
      'Удалить?',
      `Удалить запись «${labelFor(tx.category)}» на ${formatAmount(tx.amount)} ₽?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(tx.id);
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

  const formCategories = useMemo(() => {
    return formType === 'income' ? categories.income : categories.expense;
  }, [formType, categories]);

  const hasNonZeroBalances = useMemo(
    () => balances.some((b) => Math.abs(Number(b.balance)) > 0.005),
    [balances],
  );

  const renderHeader = () => (
    <View>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goPrev} style={styles.monthBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.monthName}>{MONTH_NAMES[month - 1]}</Text>
          <Text style={styles.monthYear}>{year}</Text>
        </View>
        <TouchableOpacity onPress={goNext} style={styles.monthBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Доходы</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                +{formatAmount(summary.total_income)} ₽
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Расходы</Text>
              <Text style={[styles.summaryValue, { color: colors.error }]}>
                −{formatAmount(summary.total_expense)} ₽
              </Text>
            </View>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Остаток</Text>
            <Text
              style={[
                styles.balanceValue,
                { color: Number(summary.balance) >= 0 ? colors.success : colors.error },
              ]}
            >
              {Number(summary.balance) >= 0 ? '+' : '−'}
              {formatAmount(Math.abs(Number(summary.balance)))} ₽
            </Text>
          </View>
        </View>
      )}

      {hasNonZeroBalances && (
        <TouchableOpacity
          style={styles.balancesBtn}
          onPress={() => setShowBalances(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="people-outline" size={22} color={colors.primary} />
          <Text style={styles.balancesBtnText}>Кто кому должен</Text>
          <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.success }]}
          onPress={() => openAdd('income')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={24} color={colors.white} />
          <Text style={styles.actionText}>Доход</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.error }]}
          onPress={() => openAdd('expense')}
          activeOpacity={0.85}
        >
          <Ionicons name="remove" size={24} color={colors.white} />
          <Text style={styles.actionText}>Расход</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {[
          { key: 'all', label: 'Все' },
          { key: 'income', label: 'Доходы' },
          { key: 'expense', label: 'Расходы' },
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
    </View>
  );

  const renderTxItem = ({ item }) => {
    const isIncome = item.type === 'income';
    const hasSplits = (item.splits || []).length > 0;
    return (
      <TouchableOpacity
        style={styles.txRow}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.txIcon,
            { backgroundColor: isIncome ? colors.success + '22' : colors.error + '22' },
          ]}
        >
          <Ionicons
            name={iconFor(item.category, item.type)}
            size={26}
            color={isIncome ? colors.success : colors.error}
          />
        </View>
        <View style={styles.txInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={styles.txCategory}>{labelFor(item.category)}</Text>
            {hasSplits && (
              <View style={styles.sharedBadge}>
                <Ionicons name="people" size={12} color={colors.primary} />
                <Text style={styles.sharedBadgeText}>общая</Text>
              </View>
            )}
          </View>
          {item.description ? (
            <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <Text style={styles.txMeta}>
            {formatDate(item.occurred_on)}
            {item.paid_by_name
              ? ` · заплатил ${item.paid_by_name}`
              : item.author_name ? ` · ${item.author_name}` : ''}
          </Text>
        </View>
        <Text
          style={[
            styles.txAmount,
            { color: isIncome ? colors.success : colors.error },
          ]}
        >
          {isIncome ? '+' : '−'}
          {formatAmount(item.amount)} ₽
        </Text>
      </TouchableOpacity>
    );
  };

  // Авто-распределение поровну для подсказки в UI кастомных долей
  const equalShareHint = useMemo(() => {
    const amount = parseFloat(formAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const selected = members.filter((m) => formParticipants[m.user_id]);
    if (selected.length === 0) return null;
    return splitEqually(amount, selected.map((m) => m.user_id));
  }, [formAmount, members, formParticipants]);

  const customSharesSum = useMemo(() => {
    const selected = members.filter((m) => formParticipants[m.user_id]);
    return selected.reduce((acc, m) => {
      const v = parseFloat((formCustomShares[m.user_id] || '0').replace(',', '.'));
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [members, formParticipants, formCustomShares]);

  const formAmountNum = parseFloat(formAmount.replace(',', '.')) || 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.titleBar}>
        <Text style={styles.title}>Бюджет семьи</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={64} color={colors.primaryLight} />
              <Text style={styles.emptyTitle}>Нет операций</Text>
              <Text style={styles.emptyText}>
                Добавьте первый доход или расход за этот месяц
              </Text>
            </View>
          }
          renderItem={renderTxItem}
        />
      )}

      {/* Модалка добавления */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {formType === 'income' ? 'Новый доход' : 'Новый расход'}
              </Text>

              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[
                    styles.typeChip,
                    formType === 'income' && {
                      backgroundColor: colors.success, borderColor: colors.success,
                    },
                  ]}
                  onPress={() => { setFormType('income'); setFormCategory('salary'); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.typeText, formType === 'income' && { color: colors.white }]}>
                    Доход
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeChip,
                    formType === 'expense' && {
                      backgroundColor: colors.error, borderColor: colors.error,
                    },
                  ]}
                  onPress={() => { setFormType('expense'); setFormCategory('groceries'); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.typeText, formType === 'expense' && { color: colors.white }]}>
                    Расход
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Сумма, ₽</Text>
              <TextInput
                style={styles.input}
                value={formAmount}
                onChangeText={setFormAmount}
                placeholder="0,00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Категория</Text>
              <View style={styles.catGrid}>
                {formCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, formCategory === cat && styles.catChipActive]}
                    onPress={() => setFormCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={iconFor(cat, formType)}
                      size={20}
                      color={formCategory === cat ? colors.white : colors.primary}
                    />
                    <Text style={[styles.catText, formCategory === cat && { color: colors.white }]}>
                      {labelFor(cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Комментарий (необязательно)</Text>
              <TextInput
                style={styles.input}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Например: молоко и хлеб"
                placeholderTextColor={colors.textMuted}
                maxLength={300}
              />

              <Text style={styles.fieldLabel}>Дата</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setFormDate(shiftDate(formDate, -1))} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={24} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.dateText}>{formatDate(formDate)}</Text>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setFormDate(shiftDate(formDate, 1))} activeOpacity={0.7}>
                  <Ionicons name="chevron-forward" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setFormDate(todayIso())}>
                <Text style={styles.todayLink}>Сегодня</Text>
              </TouchableOpacity>

              {/* Общая трата */}
              {members.length >= 2 && (
                <View style={styles.sharedSection}>
                  <View style={styles.sharedToggle}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sharedTitle}>Разделить между участниками</Text>
                      <Text style={styles.sharedHint}>
                        Учтётся в балансах семьи
                      </Text>
                    </View>
                    <Switch
                      value={formShared}
                      onValueChange={setFormShared}
                      trackColor={{ false: colors.border, true: colors.primaryLight }}
                      thumbColor={formShared ? colors.primary : colors.textMuted}
                    />
                  </View>

                  {formShared && (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={styles.fieldLabel}>Кто заплатил</Text>
                      <View style={styles.payerRow}>
                        {members.map((m) => (
                          <TouchableOpacity
                            key={m.user_id}
                            style={[
                              styles.payerChip,
                              formPaidBy === m.user_id && styles.payerChipActive,
                            ]}
                            onPress={() => setFormPaidBy(m.user_id)}
                            activeOpacity={0.8}
                          >
                            <Text
                              style={[
                                styles.payerText,
                                formPaidBy === m.user_id && { color: colors.white },
                              ]}
                            >
                              {m.display_name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={styles.fieldLabel}>Участники</Text>
                      {members.map((m) => {
                        const on = !!formParticipants[m.user_id];
                        const hint = equalShareHint?.find((s) => s.user_id === m.user_id);
                        return (
                          <View key={m.user_id} style={styles.participantRow}>
                            <Switch
                              value={on}
                              onValueChange={(v) => setFormParticipants((p) => ({ ...p, [m.user_id]: v }))}
                              trackColor={{ false: colors.border, true: colors.primaryLight }}
                              thumbColor={on ? colors.primary : colors.textMuted}
                            />
                            <Text style={[styles.participantName, !on && { color: colors.textMuted }]}>
                              {m.display_name}
                            </Text>
                            {on && !formEqual ? (
                              <TextInput
                                style={styles.shareInput}
                                value={formCustomShares[m.user_id] || ''}
                                onChangeText={(v) => setFormCustomShares((p) => ({ ...p, [m.user_id]: v }))}
                                placeholder={hint ? hint.share : '0,00'}
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                              />
                            ) : on && hint ? (
                              <Text style={styles.equalShare}>{formatAmount(hint.share)} ₽</Text>
                            ) : null}
                          </View>
                        );
                      })}

                      <View style={styles.equalSplitRow}>
                        <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>
                          Поровну
                        </Text>
                        <Switch
                          value={formEqual}
                          onValueChange={setFormEqual}
                          trackColor={{ false: colors.border, true: colors.primaryLight }}
                          thumbColor={formEqual ? colors.primary : colors.textMuted}
                        />
                      </View>

                      {!formEqual && formAmountNum > 0 && (
                        <Text
                          style={[
                            styles.sharesSumHint,
                            {
                              color:
                                Math.abs(customSharesSum - formAmountNum) < 0.005
                                  ? colors.success
                                  : colors.error,
                            },
                          ]}
                        >
                          Сумма долей: {formatAmount(customSharesSum)} ₽
                          {' / '}
                          {formatAmount(formAmountNum)} ₽
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              <View style={{ height: spacing.lg }} />

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

      {/* Модалка балансов */}
      <Modal visible={showBalances} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Балансы участников</Text>
            <Text style={styles.balancesHint}>
              Учитываются только общие траты с разделением.{'\n'}
              «+» — участнику должны вернуть, «−» — должен другим.
            </Text>
            {balances.map((b) => {
              const v = Number(b.balance);
              const sign = v >= 0 ? '+' : '−';
              const color = Math.abs(v) < 0.005
                ? colors.textSecondary
                : v >= 0 ? colors.success : colors.error;
              return (
                <View key={b.user_id} style={styles.balanceItemRow}>
                  <View style={styles.balanceAvatar}>
                    <Text style={styles.balanceAvatarText}>
                      {b.display_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.balanceName}>{b.display_name}</Text>
                  <Text style={[styles.balanceAmount, { color }]}>
                    {sign}{formatAmount(Math.abs(v))} ₽
                  </Text>
                </View>
              );
            })}
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: spacing.lg }]}
              onPress={() => setShowBalances(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleBar: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  monthBtn: { padding: spacing.sm },
  monthName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  monthYear: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },

  summaryCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 38, backgroundColor: colors.border },
  summaryLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 4 },
  summaryValue: { fontSize: fontSize.lg, fontWeight: '700' },
  balanceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  balanceLabel: { fontSize: fontSize.base, fontWeight: '600', color: colors.textSecondary },
  balanceValue: { fontSize: fontSize.xl, fontWeight: '800' },

  balancesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md, marginTop: spacing.md,
    paddingHorizontal: spacing.md, height: buttonH,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.primary + '55',
  },
  balancesBtnText: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.text },

  actionsRow: {
    flexDirection: 'row', gap: spacing.md,
    paddingHorizontal: spacing.md, marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, height: buttonH, borderRadius: radius.md,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3,
  },
  actionText: { fontSize: fontSize.base, fontWeight: '700', color: colors.white },

  filterRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  filterChip: {
    flex: 1, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, backgroundColor: colors.surfaceWarm,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: colors.white },

  txRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    gap: spacing.md,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2,
  },
  txIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txCategory: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  txDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  txMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: fontSize.base, fontWeight: '700' },
  sharedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radius.sm,
  },
  sharedBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },

  empty: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, paddingBottom: 40,
    maxHeight: '92%',
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },

  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeChip: {
    flex: 1, height: 50, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceWarm,
  },
  typeText: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },

  fieldLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    height: buttonH,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1, borderColor: colors.border,
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },

  dateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.inputBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    height: buttonH, paddingHorizontal: spacing.sm,
  },
  dateBtn: { padding: spacing.sm },
  dateText: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  todayLink: {
    fontSize: fontSize.sm, color: colors.primary, fontWeight: '600',
    marginTop: spacing.xs, alignSelf: 'flex-end',
  },

  sharedSection: {
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  sharedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  sharedTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  sharedHint: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },

  payerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  payerChip: {
    paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1, borderColor: colors.border,
  },
  payerChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payerText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },

  participantRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  participantName: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  shareInput: {
    width: 110, height: 44,
    backgroundColor: colors.inputBg, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.base, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
    textAlign: 'right',
  },
  equalShare: {
    fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600',
    minWidth: 90, textAlign: 'right',
  },
  equalSplitRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sharesSumHint: { fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing.xs, textAlign: 'right' },

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

  balancesHint: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    marginBottom: spacing.md, lineHeight: 22,
  },
  balanceItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  balanceAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.surfaceWarm, alignItems: 'center', justifyContent: 'center',
  },
  balanceAvatarText: { fontSize: fontSize.base, fontWeight: '700', color: colors.primary },
  balanceName: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  balanceAmount: { fontSize: fontSize.lg, fontWeight: '800' },
});
