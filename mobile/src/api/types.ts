// Типы API, выровненные по бэкенду (services/api/app/schemas).
// Держим в синхроне с веб-клиентом (services/web/src/lib/api.ts).

export type UiMode = "simple" | "advanced" | "expert";

// MeResponse (app/schemas/me.py)
export interface Me {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
  ui_mode: UiMode;
  is_developer: boolean;
}

// AuthResponse (app/schemas/auth_pin.py). access_token приходит только если
// клиент прислал заголовок X-Auth-Return-Token (мобильный — да, веб — нет).
export interface AuthResponse {
  user_id: string;
  access_token: string | null;
}

// MyFamilyResponse (app/schemas/me.py)
export interface MyFamily {
  family_id: string;
  family_name: string;
  role: string;
  joined_at: string;
}

export interface UpdateProfileInput {
  display_name?: string;
  username?: string;
  bio?: string | null;
  birthday?: string | null;
  ui_mode?: UiMode;
}

// Decimal сериализуется в JSON как число или строка — допускаем оба.
export type Money = number | string;
export type Role = "owner" | "member";

// ─── Семья (app/schemas/families.py) ────────────────────────────────────────
export interface Family {
  id: string;
  name: string;
  created_at: string;
}

export interface FamilyMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  birthday: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  role: Role;
  is_developer: boolean;
  is_banned: boolean;
  joined_at: string;
}

export interface FamilyDetail extends Family {
  members: FamilyMember[];
}

// ─── Чаты и сообщения (app/schemas/chats.py) ────────────────────────────────
export interface PinnedMessagePreview {
  preview_text: string;
  author_display_name: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  family_id: string;
  name: string;
  description: string | null;
  slow_mode_seconds: number;
  is_18plus: boolean;
  created_by: string | null;
  pinned_message_id: string | null;
  pinned_message: PinnedMessagePreview | null;
  created_at: string;
}

export type AttachmentKind = "image" | "video" | "file" | "voice";

export interface MessageAttachment {
  kind: AttachmentKind;
  url: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface ReaderInfo {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Message {
  id: string;
  chat_id: string;
  author_id: string | null;
  author_username: string | null;
  author_display_name: string | null;
  text: string;
  edited: boolean;
  reply_to_id: string | null;
  mentions: string[];
  attachments: MessageAttachment[];
  reactions: ReactionSummary[];
  readers: ReaderInfo[];
  created_at: string;
}

// ─── Галерея (app/schemas/gallery.py) ───────────────────────────────────────
export type MediaType = "image" | "video" | "file";

export interface GalleryItem {
  id: string;
  family_id: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  media_type: MediaType;
  url: string;
  file_name: string | null;
  file_size: number | null;
  caption: string | null;
  created_at: string;
}

// ─── Бюджет (app/schemas/budget.py) ─────────────────────────────────────────
export type BudgetType = "income" | "expense";

export interface BudgetSplitInput {
  user_id: string;
  share: Money;
}

export interface BudgetSplit {
  user_id: string;
  user_name: string | null;
  share: Money;
}

export interface BudgetTransaction {
  id: string;
  family_id: string;
  author_id: string | null;
  author_name: string | null;
  paid_by: string | null;
  paid_by_name: string | null;
  type: BudgetType;
  category: string;
  amount: Money;
  currency: string;
  description: string | null;
  occurred_on: string;
  splits: BudgetSplit[];
  created_at: string;
}

export interface BudgetTransactionCreateInput {
  type: BudgetType;
  category: string;
  amount: Money;
  currency?: string;
  description?: string | null;
  occurred_on: string;
  paid_by?: string | null;
  splits?: BudgetSplitInput[] | null;
}

export type BudgetTransactionUpdateInput = Partial<BudgetTransactionCreateInput>;

export interface BudgetCategoryBreakdown {
  category: string;
  total: Money;
}

export interface BudgetSummary {
  year: number;
  month: number;
  total_income: Money;
  total_expense: Money;
  balance: Money;
  income_by_category: BudgetCategoryBreakdown[];
  expense_by_category: BudgetCategoryBreakdown[];
  transaction_count: number;
}

export interface BudgetCategories {
  income: string[];
  expense: string[];
}

export interface BudgetMemberBalance {
  user_id: string;
  display_name: string;
  balance: Money;
}

export interface ListTransactionsFilter {
  year?: number;
  month?: number;
  type?: BudgetType;
}

// ─── Напоминания (app/schemas/reminders.py) ─────────────────────────────────
export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

export interface Reminder {
  id: string;
  family_id: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string;
  notes: string | null;
  remind_at: string;
  is_personal: boolean;
  repeat_rule: RepeatRule;
  is_done: boolean;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderCreateInput {
  title: string;
  notes?: string | null;
  remind_at: string;
  is_personal?: boolean;
  repeat_rule?: RepeatRule;
}

export interface ReminderUpdateInput {
  title?: string;
  notes?: string | null;
  remind_at?: string;
  is_personal?: boolean;
  repeat_rule?: RepeatRule;
  is_done?: boolean;
}

export interface ReminderToggleDone {
  id: string;
  is_done: boolean;
  next_remind_at: string | null;
}
