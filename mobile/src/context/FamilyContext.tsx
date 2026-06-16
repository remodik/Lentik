import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import type { MyFamily } from "../api/types";

const FAMILY_KEY = "lentik_current_family";

interface FamilyContextValue {
  currentFamily: MyFamily | null;
  selectFamily: (family: MyFamily) => Promise<void>;
  clearFamily: () => Promise<void>;
  familyLoaded: boolean;
}

const FamilyContext = createContext<FamilyContextValue | null>(null);

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [currentFamily, setCurrentFamily] = useState<MyFamily | null>(null);
  const [familyLoaded, setFamilyLoaded] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(FAMILY_KEY)
      .then((stored) => {
        if (stored) setCurrentFamily(JSON.parse(stored) as MyFamily);
      })
      .finally(() => setFamilyLoaded(true));
  }, []);

  const selectFamily = async (family: MyFamily) => {
    setCurrentFamily(family);
    await SecureStore.setItemAsync(FAMILY_KEY, JSON.stringify(family));
  };

  const clearFamily = async () => {
    setCurrentFamily(null);
    await SecureStore.deleteItemAsync(FAMILY_KEY);
  };

  return (
    <FamilyContext.Provider
      value={{ currentFamily, selectFamily, clearFamily, familyLoaded }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export const useFamily = (): FamilyContextValue => {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily must be used within FamilyProvider");
  return ctx;
};
