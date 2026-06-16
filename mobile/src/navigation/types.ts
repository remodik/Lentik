// Param-списки навигации (React Navigation). Держим маршруты типизированными.

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  FamilySelect: undefined;
  Main: undefined;
};

export type ChatStackParamList = {
  ChatsList: undefined;
  Chat: { chatId: string; chatName: string; familyId: string };
};

export type MainTabParamList = {
  Chats: undefined;
  Gallery: undefined;
  Reminders: undefined;
  Budget: undefined;
  Profile: undefined;
};
