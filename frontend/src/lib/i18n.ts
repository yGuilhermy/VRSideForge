import { useStore } from '@/store/useStore';
import pt from '@/locales/pt.json';
import en from '@/locales/en.json';

const translations = {
  pt,
  en,
};

export function useTranslation() {
  const { interfaceLanguage } = useStore();
  
  const t = (key: string, params?: Record<string, any>) => {
    const keys = key.split('.');
    let result: any = translations[interfaceLanguage];
    
    const resolve = (obj: any, path: string[]) => {
      let current = obj;
      for (const k of path) {
        if (current && current[k]) {
          current = current[k];
        } else {
          return null;
        }
      }
      return current;
    };

    let text = resolve(result, keys);
    if (!text) {
      text = resolve(translations['en'], keys);
    }

    if (!text) return key;
    if (typeof text !== 'string') return text;

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    
    return text;
  };

  return { t, lang: interfaceLanguage };
}
