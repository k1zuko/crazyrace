"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface GlobalLoadingContextType {
    isLoading: boolean;
    showLoading: () => void;
    hideLoading: () => void;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextType | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
    const [isLoading, setIsLoading] = useState(false);

    const showLoading = () => setIsLoading(true);
    const hideLoading = () => setIsLoading(false);

    return (
        <GlobalLoadingContext.Provider value={{ isLoading, showLoading, hideLoading }}>
            {children}

            {/* Global Loading Overlay - persists across page navigation */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#1a0a2a] backdrop-blur-sm"
                    >
                        <div className="p-8 text-center" style={{
                            border: '4px solid #00ffff',
                            background: 'linear-gradient(45deg, #1a0a2a, #2d1b69)',
                            boxShadow: '0 0 20px rgba(255, 107, 255, 0.3)'
                        }}>
                            <motion.p
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ repeat: Infinity, duration: 0.8 }}
                                className="text-2xl md:text-4xl text-[#00ffff]"
                                style={{ textShadow: '2px 2px 0px #000', filter: 'drop-shadow(0 0 10px #00ffff)' }}
                            >
                                LOADING...
                            </motion.p>
                            {/* Pixelated Loading Bar */}
                            <div className="mt-6 flex gap-1 justify-center">
                                {[...Array(8)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        animate={{
                                            scaleY: [1, 1.5, 1],
                                            backgroundColor: ["#00ffff", "#ff6bff", "#00ffff"],
                                        }}
                                        transition={{
                                            repeat: Infinity,
                                            duration: 0.5,
                                            delay: i * 0.1,
                                        }}
                                        className="w-4 h-8 bg-[#00ffff]"
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </GlobalLoadingContext.Provider>
    );
}

export function useGlobalLoading() {
    const context = useContext(GlobalLoadingContext);
    if (!context) {
        throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
    }
    return context;
}
