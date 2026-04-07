import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, fontSize, spacing, radius, buttonH } from '../theme';
import PinKeypad from '../components/PinKeypad';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [step, setStep] = useState(1); // 1=данные, 2=PIN, 3=подтверждение PIN
  const [loading, setLoading] = useState(false);

  const handleNext = () => {
    if (!displayName.trim()) {
      Alert.alert('Ошибка', 'Введите ваше имя');
      return;
    }
    if (!username.trim() || username.trim().length < 2) {
      Alert.alert('Ошибка', 'Логин должен быть не менее 2 символов');
      return;
    }
    setStep(2);
  };

  const handlePinPress = (digit) => {
    if (step === 2 && pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) setStep(3);
    } else if (step === 3 && pinConfirm.length < 4) {
      const next = pinConfirm + digit;
      setPinConfirm(next);
      if (next.length === 4) handleRegister(next);
    }
  };

  const handlePinDelete = () => {
    if (step === 2) setPin((p) => p.slice(0, -1));
    else if (step === 3) setPinConfirm((p) => p.slice(0, -1));
  };

  const handleRegister = async (confirmPin) => {
    if (pin !== confirmPin) {
      Alert.alert('Ошибка', 'PIN-коды не совпадают. Попробуйте снова.');
      setPin('');
      setPinConfirm('');
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      await register(username.trim().toLowerCase(), displayName.trim(), pin);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Ошибка регистрации';
      Alert.alert('Ошибка', String(msg));
      setPin('');
      setPinConfirm('');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const currentPin = step === 2 ? pin : pinConfirm;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Кнопка назад */}
          <TouchableOpacity style={styles.back} onPress={() => step > 1 ? setStep(step - 1) : navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color={colors.primary} />
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Регистрация</Text>

          {step === 1 && (
            <View>
              <Text style={styles.label}>Ваше имя</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Например: Бабушка Маша"
                placeholderTextColor={colors.textMuted}
                maxLength={64}
              />

              <Text style={styles.label}>Придумайте логин</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Только буквы, цифры, _"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={64}
              />

              <TouchableOpacity style={styles.btn} onPress={handleNext} activeOpacity={0.8}>
                <Text style={styles.btnText}>Далее</Text>
              </TouchableOpacity>
            </View>
          )}

          {(step === 2 || step === 3) && (
            <View>
              <Text style={styles.pinTitle}>
                {step === 2 ? 'Придумайте PIN-код' : 'Повторите PIN-код'}
              </Text>
              <Text style={styles.pinHint}>
                {step === 2
                  ? 'PIN из 4 цифр нужен для входа'
                  : 'Введите тот же PIN ещё раз'}
              </Text>
              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.dot, currentPin.length > i && styles.dotFilled]} />
                ))}
              </View>
              <PinKeypad onPress={handlePinPress} onDelete={handlePinDelete} />
              {loading && <Text style={styles.loading}>Регистрация...</Text>}
            </View>
          )}

          {step === 1 && (
            <TouchableOpacity style={styles.loginLink} onPress={() => navigation.goBack()}>
              <Text style={styles.loginText}>Уже есть аккаунт? Войти</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  back: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  backText: { fontSize: fontSize.base, color: colors.primary },
  title: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  label: { fontSize: fontSize.base, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },
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
  btn: {
    backgroundColor: colors.primary,
    height: buttonH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    elevation: 3,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  btnText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  pinTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.lg },
  pinHint: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
  pinDots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginVertical: spacing.md },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: colors.primary, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.primary },
  loading: { textAlign: 'center', fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing.md },
  loginLink: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.md },
  loginText: { fontSize: fontSize.base, color: colors.primary, fontWeight: '500' },
});
