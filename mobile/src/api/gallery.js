import client from './client';

// GET /families/:familyId/gallery
export const listGallery = (familyId, limit = 50, offset = 0) =>
  client.get(`/families/${familyId}/gallery`, { params: { limit, offset } });

// POST /families/:familyId/gallery — загрузить фото/видео
export const uploadToGallery = (familyId, fileUri, fileName, mimeType, caption) => {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, name: fileName, type: mimeType });
  if (caption) formData.append('caption', caption);
  return client.post(`/families/${familyId}/gallery`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// DELETE /families/:familyId/gallery/:itemId
export const deleteGalleryItem = (familyId, itemId) =>
  client.delete(`/families/${familyId}/gallery/${itemId}`);
