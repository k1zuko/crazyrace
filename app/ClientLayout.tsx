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

  // ✅ FIX: Pisahkan effect untuk initial setup (run once)
  useEffect(() => {
    setIsClient(true);
    const savedLang = localStorage.getItem("language");
    if (savedLang && i18n.language !== savedLang && typeof i18n.changeLanguage === "function") {
      i18n.changeLanguage(savedLang);
    }
  }, []); // Run only once on mount

  // ✅ FIX: Separate effect untuk update document lang attribute
  useEffect(() => {
    if (isClient && i18n.language) {
      document.documentElement.lang = i18n.language;

      // Set direction and body class for Arabic
      if (i18n.language === 'ar') {
        document.documentElement.dir = 'rtl';
        document.body.classList.add('lang-ar');
      } else {
        document.documentElement.dir = 'ltr';
        document.body.classList.remove('lang-ar');
      }
    }
  }, [i18n.language, isClient]);

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
