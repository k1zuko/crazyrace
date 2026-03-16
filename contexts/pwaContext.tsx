"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

// Define the interface for the BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallContextType {
  installPrompt: BeforeInstallPromptEvent | null;
  handleInstall: () => void;
}

const PWAInstallContext = createContext<PWAInstallContextType | undefined>(
  undefined
);

export function PWAInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();

    // const { outcome } = await installPrompt.userChoice;

    // if (outcome === "accepted") {
    //   console.log("User accepted the PWA installation");
    // } else {
    //   console.log("User dismissed the PWA installation");
    // }
    // // The prompt can only be used once, so clear it.
    setInstallPrompt(null);
  };

  return (
    <PWAInstallContext.Provider value={{ installPrompt, handleInstall }}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstall() {
  const context = useContext(PWAInstallContext);
  if (context === undefined) {
    throw new Error("usePWAInstall must be used within a PWAInstallProvider");
  }
  return context;
}
