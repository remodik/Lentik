// Тёплая палитра — удобно для пожилых пользователей
export const colors = {
  background: '#FFF8F0',   // Тёплый белый / бежевый фон
  surface: '#FFFFFF',
  surfaceWarm: '#FEF0E0',
  primary: '#C8693A',      // Тёплый терракот
  primaryLight: '#F5D5B8',
  primaryDark: '#8B4520',
  text: '#2D1B0E',         // Тёмно-коричневый (хороший контраст)
  textSecondary: '#7A5C4A',
  textMuted: '#B09080',
  border: '#E8D5C0',
  inputBg: '#FDF4EC',
  error: '#C0392B',
  success: '#27AE60',
  white: '#FFFFFF',
  online: '#27AE60',
  offline: '#BDC3C7',
  bubbleMine: '#F5D5B8',   // Мои сообщения
  bubbleTheirs: '#FFFFFF', // Чужие сообщения
};

// Минимум 18px согласно требованиям
export const fontSize = {
  xs: 14,
  sm: 16,
  base: 18,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 9999,
};

// Минимум 56dp для кнопок и touch-targets
export const buttonH = 58;
export const touchMin = 56;
