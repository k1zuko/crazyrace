"use client";

import { ReactNode, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { getI18nInstance } from "@/lib/i18n";
import { motion } from "framer-motion";
import { PWAInstallProvider } from "@/contexts/pwaContext";
import { GlobalLoadingProvider } from "@/contexts/globalLoadingContext";

export default function ClientProviders({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [i18nInstance] = useState(() => getI18nInstance());

  useEffect(() => {
    if (i18nInstance.isInitialized) setIsReady(true);
    else i18nInstance.on("initialized", () => setIsReady(true));
  }, [i18nInstance]);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <GlobalLoadingProvider>
      <PWAInstallProvider>
        <I18nextProvider key={i18nInstance.language} i18n={i18nInstance}>
          {children}
        </I18nextProvider>
      </PWAInstallProvider>
    </GlobalLoadingProvider>
  );
}
