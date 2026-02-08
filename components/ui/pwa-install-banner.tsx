"use client";

import { useTranslation } from "react-i18next";

interface PWAInstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export default function PWAInstallBanner({ onInstall, onDismiss }: PWAInstallBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-2 md:button-4 left-2 md:left-4 bg-[#1a0a2a] text-white border-2 border-[#00ffff] rounded-lg p-4 z-50 shadow-lg animate-fade-in-up sm:p-3 md:p-4 md:text-base">
      <p className="mb-2 text-sm font-semibold leading-tight">{t("pwa.installTitle")}</p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onInstall}
          className="px-3 py-1 sm:py-0.5 bg-[#00ffff] text-[#1a0a2a] rounded-md font-bold hover:bg-opacity-80 transition-colors text-xs"
        >
          {t("pwa.install")}
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 border border-[#00ffff] rounded-md hover:bg-white/10 transition-colors text-xs"
        >
          {t("pwa.later")}
        </button>
      </div>
    </div>
  );
}

