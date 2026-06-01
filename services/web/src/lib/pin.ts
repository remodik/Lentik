// Общие правила PIN-кода. Сервер принимает 4–8 цифр (старые 4-значные —
// валидны). В сегментированном поле ввода показываем PIN_BOXES ячеек; лишние
// можно не заполнять (например, у старых пользователей PIN из 4 цифр).

export const PIN_BOXES = 6;

export function emptyPin(): string[] {
  return Array.from({ length: PIN_BOXES }, () => "");
}

export function joinPin(parts: string[]): string {
  return parts.join("");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
