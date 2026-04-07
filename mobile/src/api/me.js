import client from './client';

// GET /me — текущий пользователь
export const getMe = () => client.get('/me');

// GET /me/families — список семей пользователя
export const getMyFamilies = () => client.get('/me/families');

// PATCH /me — обновить профиль
export const updateProfile = (data) => client.patch('/me', data);
