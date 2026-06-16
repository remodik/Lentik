import client from "./client";
import type { GalleryItem } from "./types";

// GET /families/:familyId/gallery
export const listGallery = (familyId: string, limit = 50, offset = 0) =>
  client.get<GalleryItem[]>(`/families/${familyId}/gallery`, {
    params: { limit, offset },
  });

// POST /families/:familyId/gallery — загрузить фото/видео
export const uploadToGallery = (
  familyId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  caption?: string,
) => {
  const formData = new FormData();
  // RN FormData принимает { uri, name, type } для файла.
  formData.append("file", {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
  if (caption) formData.append("caption", caption);
  return client.post<GalleryItem>(`/families/${familyId}/gallery`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// DELETE /families/:familyId/gallery/:itemId
export const deleteGalleryItem = (familyId: string, itemId: string) =>
  client.delete(`/families/${familyId}/gallery/${itemId}`);
