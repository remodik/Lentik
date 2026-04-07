import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors, fontSize, spacing, radius, buttonH } from '../theme';
import PinKeypad from '../components/PinKeypad';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePinPress = (digit) => {
    if (pin.length < 4) setPin((p) => p + digit);
  };

  const handlePinDelete = () => setPin((p) => p.slice(0, -1));

  const handleLogin = async () => {
    if (!username.trim()) {
      Alert.alert('Ошибка', 'Введите логин');
      return;
    }
    if (pin.length !== 4) {
      Alert.alert('Ошибка', 'Введите 4-значный PIN-код');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim().toLowerCase(), pin);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Неверный логин или PIN-код';
      Alert.alert('Ошибка входа', String(msg));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Заголовок */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>L</Text>
            </View>
            <Text style={styles.logoText}>Lentik</Text>
            <Text style={styles.subtitle}>Семейный мессенджер</Text>
          </View>

          {/* Поле логина */}
          <Text style={styles.label}>Логин</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Введите логин"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
          />

          {/* PIN — точки */}
          <Text style={styles.label}>PIN-код</Text>
          <View style={styles.pinDots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.dot, pin.length > i && styles.dotFilled]}
              />
            ))}
          </View>

          {/* Цифровая клавиатура */}
          <PinKeypad onPress={handlePinPress} onDelete={handlePinDelete} />

          {/* Кнопка входа */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>{loading ? 'Вхожу...' : 'Войти'}</Text>
          </TouchableOpacity>

          {/* Ссылка на регистрацию */}
          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.registerText}>Нет аккаунта? Зарегистрироваться</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  header: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoIcon: { fontSize: 44, fontWeight: '800', color: colors.white },
  logoText: { fontSize: fontSize['3xl'], fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.xs },
  label: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: buttonH,
    fontSize: fontSize.base,
    color: colors.text,
  },
  pinDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginVertical: spacing.md,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.primary },
  btn: {
    backgroundColor: colors.primary,
    height: buttonH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    elevation: 3,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white, letterSpacing: 0.5 },
  registerLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  registerText: { fontSize: fontSize.base, color: colors.primary, fontWeight: '500' },
});
