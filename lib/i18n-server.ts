
import i18n from "i18next";
import enTranslation from "../locales/en/translation.json";
import idTranslation from "../locales/id/translation.json";


// Initialize i18next for server-side
i18n.init({
  resources: {
    en: { translation: enTranslation },
    id: { translation: idTranslation },
  },
  fallbackLng: "en",
  supportedLngs: ["en", "id"],
  interpolation: {
    escapeValue: false, // No need for escaping in server context
  },
});

export default i18n;
