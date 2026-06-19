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

  useEffect(() => {
    setIsClient(true);
    const cookies = document.cookie.split(';');
    const i18nextCookie = cookies.find(c => c.trim().startsWith('i18next='));
    const savedLang = i18nextCookie?.split('=')[1]?.trim();
    if (savedLang && i18n.language !== savedLang && typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(savedLang);
    }
  }, []);

  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      setCurrentLang(lng);
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  useEffect(() => {
    if (isClient && currentLang) {
      document.documentElement.lang = currentLang;

      // Atur arah teks berdasarkan bahasa, rtl untuk bahasa Arab, dan ltr untuk bahasa lainnya
      if (currentLang === 'ar') {
        document.documentElement.dir = 'rtl';
        document.body.classList.add('lang-ar');
      } else {
        document.documentElement.dir = 'ltr';
        document.body.classList.remove('lang-ar');
      }
    }
  }, [currentLang, isClient]);

  // Tampilkan layar kosong saat rendering di server
  if (!isClient) {
    return <div className="bg-black min-h-screen" />;
  }

  return (
    <ClientProviders>
      <AuthProvider>

          {children}

      </AuthProvider>
    </ClientProviders>
  );
}

