import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const FAMILY_KEY = 'lentik_current_family';
const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const [currentFamily, setCurrentFamily] = useState(null);
  const [familyLoaded, setFamilyLoaded] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(FAMILY_KEY)
      .then((stored) => {
        if (stored) setCurrentFamily(JSON.parse(stored));
      })
      .finally(() => setFamilyLoaded(true));
  }, []);

  const selectFamily = async (family) => {
    setCurrentFamily(family);
    await SecureStore.setItemAsync(FAMILY_KEY, JSON.stringify(family));
  };

  const clearFamily = async () => {
    setCurrentFamily(null);
    await SecureStore.deleteItemAsync(FAMILY_KEY);
  };

  return (
    <FamilyContext.Provider value={{ currentFamily, selectFamily, clearFamily, familyLoaded }}>
      {children}
    </FamilyContext.Provider>
  );
}

export const useFamily = () => useContext(FamilyContext);
