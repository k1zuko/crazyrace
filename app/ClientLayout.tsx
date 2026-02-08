"use client";

import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/authContext';
import { useEffect, useState } from "react";
import AuthGate from '@/components/authGate';
import ClientProviders from './ClientProvider';
import { getI18nInstance } from "@/lib/i18n";

interface ClientLayoutProps {
  children: ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const i18n = getI18nInstance();
  const [isClient, setIsClient] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18n.language);

  // ✅ FIX: Pisahkan effect untuk initial setup (run once)
  useEffect(() => {
    setIsClient(true);
    const savedLang = localStorage.getItem("language");
    if (savedLang && i18n.language !== savedLang && typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(savedLang);
    }
  }, []); // Run only once on mount

  // ✅ FIX: Listen for language changes to trigger re-render
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      setCurrentLang(lng);
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  // ✅ FIX: Update document direction when language changes
  useEffect(() => {
    if (isClient && currentLang) {
      document.documentElement.lang = currentLang;

      // Set direction and body class for Arabic
      if (currentLang === 'ar') {
        document.documentElement.dir = 'rtl';
        document.body.classList.add('lang-ar');
      } else {
        document.documentElement.dir = 'ltr';
        document.body.classList.remove('lang-ar');
      }
    }
  }, [currentLang, isClient]);

  if (!isClient) {
    return <div className="bg-black min-h-screen" />;
  }

  return (
    <ClientProviders>
      <AuthProvider>
        <AuthGate>
          {children}
        </AuthGate>
      </AuthProvider>
    </ClientProviders>
  );
}

