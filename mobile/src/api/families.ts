import client from "./client";
import type { Family, FamilyDetail } from "./types";

// GET /families/:id — детали семьи с участниками
export const getFamily = (familyId: string) =>
  client.get<FamilyDetail>(`/families/${familyId}`);

// POST /families — создать семью
export const createFamily = (name: string) =>
  client.post<Family>("/families", { name });
