import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { useFamily } from '../context/FamilyContext';
import { colors, fontSize, buttonH } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import FamilySelectScreen from '../screens/FamilySelectScreen';
import ChatsListScreen from '../screens/ChatsListScreen';
import ChatScreen from '../screens/ChatScreen';
import GalleryScreen from '../screens/GalleryScreen';
import BudgetScreen from '../screens/BudgetScreen';
import RemindersScreen from '../screens/RemindersScreen';
import ProfileScreen from '../screens/ProfileScreen';

const RootStack = createNativeStackNavigator();
const ChatStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ChatsStack() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="ChatsList" component={ChatsListScreen} />
      <ChatStack.Screen name="Chat" component={ChatScreen} />
    </ChatStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          height: 70,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.sm,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            Chats: focused ? 'chatbubbles' : 'chatbubbles-outline',
            Gallery: focused ? 'images' : 'images-outline',
            Reminders: focused ? 'alarm' : 'alarm-outline',
            Budget: focused ? 'wallet' : 'wallet-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={28} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Chats" component={ChatsStack} options={{ title: 'Чаты' }} />
      <Tab.Screen name="Gallery" component={GalleryScreen} options={{ title: 'Галерея' }} />
      <Tab.Screen name="Reminders" component={RemindersScreen} options={{ title: 'Напоминания' }} />
      <Tab.Screen name="Budget" component={BudgetScreen} options={{ title: 'Бюджет' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профиль' }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { currentFamily, familyLoaded, clearFamily } = useFamily();

  // Очищаем семью при выходе
  useEffect(() => {
    if (!user) clearFamily();
  }, [user]);

  if (loading || !familyLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {!user ? (
        <>
          <RootStack.Screen name="Login" component={LoginScreen} />
          <RootStack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : !currentFamily ? (
        <RootStack.Screen name="FamilySelect" component={FamilySelectScreen} />
      ) : (
        <RootStack.Screen name="Main" component={MainTabs} />
      )}
    </RootStack.Navigator>
  );
}
