import client from "./client";
import type { Me, MyFamily, UpdateProfileInput } from "./types";

// GET /me — текущий пользователь
export const getMe = () => client.get<Me>("/me");

// GET /me/families — список семей пользователя
export const getMyFamilies = () => client.get<MyFamily[]>("/me/families");

// PATCH /me — обновить профиль
export const updateProfile = (data: UpdateProfileInput) =>
  client.patch<Me>("/me", data);
