import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import rw from "./rw.json";
import en from "./en.json";

i18n.use(initReactI18next).init({
  resources: {
    rw: { translation: rw },
    en: { translation: en },
  },
  lng: "en", // CHANGED: Default language is now English
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, 
  },
});

export default i18n;
