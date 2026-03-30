import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  offlineMode: boolean;
  downloadPath: string;
  interfaceLanguage: 'pt' | 'en';
  translationLanguage: string;
  setOfflineMode: (offline: boolean) => void;
  setDownloadPath: (path: string) => void;
  setInterfaceLanguage: (lang: 'pt' | 'en') => void;
  setTranslationLanguage: (lang: string) => void;
}

export const useStore = create<SettingsState>()(
  persist(
    (set) => ({
      offlineMode: false,
      downloadPath: 'E:\\VRGames',
      interfaceLanguage: 'en',
      translationLanguage: 'en',
      setOfflineMode: (offlineMode) => set({ offlineMode }),
      setDownloadPath: (downloadPath) => set({ downloadPath }),
      setInterfaceLanguage: (interfaceLanguage) => set({ interfaceLanguage }),
      setTranslationLanguage: (translationLanguage) => set({ translationLanguage }),
    }),
    {
      name: 'vr-settings',
    }
  )
);
