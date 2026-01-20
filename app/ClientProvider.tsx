"use client";

import { ReactNode, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { getI18nInstance } from "@/lib/i18n";
import { PWAInstallProvider } from "@/contexts/pwaContext";
import { GlobalLoadingProvider } from "@/contexts/globalLoadingContext";

export default function ClientProviders({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [i18nInstance] = useState(() => getI18nInstance());

  useEffect(() => {
    if (i18nInstance.isInitialized) setIsReady(true);
    else i18nInstance.on("initialized", () => setIsReady(true));
  }, [i18nInstance]);

  // Simple loading state - can't use useGlobalLoading here because we're outside the provider
  if (!isReady) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1a0a2a]">
        <div className="p-8 text-center" style={{
          border: '4px solid #00ffff',
          background: 'linear-gradient(45deg, #1a0a2a, #2d1b69)',
          boxShadow: '0 0 20px rgba(255, 107, 255, 0.3)'
        }}>
          <p className="text-2xl md:text-4xl text-[#00ffff] animate-pulse"
            style={{ textShadow: '2px 2px 0px #000', filter: 'drop-shadow(0 0 10px #00ffff)' }}>
            LOADING...
          </p>
        </div>
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
