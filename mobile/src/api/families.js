import client from './client';

// GET /families/:id — детали семьи с участниками
export const getFamily = (familyId) => client.get(`/families/${familyId}`);

// POST /families — создать семью
export const createFamily = (name) => client.post('/families', { name });
