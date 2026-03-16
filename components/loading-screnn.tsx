"use client"
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function LoadingRetroScreen({ progress = 0 }: { progress?: number }) {
  const { t } = useTranslation();

  const backgroundGifs = [
    "/assets/background/host/10.webp",
  ];

  const tips = t("loading.tips", { returnObjects: true }) as string[];

  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    const bgInterval = setInterval(() => {
      setCurrentBgIndex((prev) => (prev + 1) % backgroundGifs.length);
    }, 5000);

    const tipInterval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % tips.length);
    }, 3000);

    return () => {
      clearInterval(bgInterval);
      clearInterval(tipInterval);
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        html {
          overflow: hidden !important;
        }
      `}</style>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center h-screen w-screen relative overflow-hidden bg-[#0a0a0a]"
        >
          {/* Background */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentBgIndex}
              className="absolute inset-0 w-full h-full bg-cover bg-center opacity-30"
              style={{ backgroundImage: `url(${backgroundGifs[currentBgIndex]})` }}

            />
          </AnimatePresence>

          {/* CRT and Noise Effects */}
          <div className="crt-effect absolute inset-0 z-10"></div>
          <div className="noise-effect absolute inset-0 z-20"></div>

          {/* Main Loading Container */}
          <div className="pixel-border-large p-6 text-center relative z-30 w-full max-w-sm mx-auto">
            {/* Title */}
            <motion.p
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-3xl text-[#00ffff] pixel-text glow-cyan mb-4 uppercase tracking-wider"
            >
              {t("loading.title")}
            </motion.p>

            {/* Progress Percentage */}
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-4"
            >
              <p className="text-xl text-[#ff6b ff] pixel-text glow-pink">
                {Math.round(progress)}%
              </p>
            </motion.div>

            {/* Progress Bar */}
            {/* <div className="relative mb-6">
              <div className="w-full h-3 bg-[#1a1a1a] border-2 border-[#00ffff]/30 rounded-sm pixel-border-small"></div>
              <motion.div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00ffff] via-[#00ffff]/80 to-[#ff6bff] rounded-sm glow-cyan-subtle"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div> */}

            {/* Simplified Animated Pixel Bars */}
            <div className="flex gap-0.5 justify-center mb-6">
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    scaleY: [1, 1.2, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.6,
                    delay: i * 0.08,
                  }}
                  className="w-1 h-4 bg-[#00ffff]/70 rounded"
                />
              ))}
            </div>

            {/* Rotating Tip */}
            <AnimatePresence mode="wait">
              <motion.p
                key={currentTipIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="text-xs text-[#ff6bff]/90 pixel-text glow-pink-subtle leading-relaxed max-w-[200px] mx-auto"
              >
                {tips[currentTipIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      <style jsx>{`
        .pixel-border-large {
          border: 3px solid #00ffff;
          background: rgba(10, 10, 10, 0.9);
          box-shadow: 
            0 0 0 1px rgba(255, 107, 255, 0.2),
            inset 0 0 0 1px rgba(0, 255, 255, 0.1),
            0 0 20px rgba(0, 255, 255, 0.2);
          border-radius: 4px;
          backdrop-filter: blur(2px);
        }
        .pixel-border-large::before {
          content: '';
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border: 1px solid #ff6bff;
          z-index: -1;
          border-radius: 4px;
        }
        .pixel-border-small {
          border-radius: 2px;
          image-rendering: pixelated;
        }
        .crt-effect {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: 
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.03) 2px,
              rgba(0, 0, 0, 0.03) 4px
            );
          pointer-events: none;
          animation: scanline 6s linear infinite;
        }
        .noise-effect {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.05;
          background-image: 
            radial-gradient(2px 2px at 20px 30px, #000, transparent),
            radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.1), transparent),
            radial-gradient(1px 1px at 90px 40px, #000, transparent),
            radial-gradient(1px 1px at 130px 80px, rgba(255,255,255,0.1), transparent);
          background-size: 200px 100px;
          pointer-events: none;
          animation: noise 0.2s infinite linear alternate;
        }
        .glow-cyan {
          text-shadow: 
            0 0 4px #00ffff,
            2px 2px 0 #000,
            -2px -2px 0 #000;
        }
        .glow-cyan-subtle {
          box-shadow: 0 0 6px rgba(0, 255, 255, 0.4);
        }
        .glow-pink {
          text-shadow: 
            0 0 4px #ff6bff,
            2px 2px 0 #000,
            -2px -2px 0 #000;
        }
        .glow-pink-subtle {
          text-shadow: 0 0 2px rgba(255, 107, 255, 0.3);
        }
        .pixel-text {
          image-rendering: pixelated;
          text-shadow: 2px 2px 0px #000;
          letter-spacing: 1px;
        }
        @keyframes scanline {
          0% { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }
        @keyframes noise {
          0% { transform: translate(0, 0); }
          100% { transform: translate(1px, 1px); }
        }
        @keyframes glow-cyan {
          0%, 100% { text-shadow: 0 0 4px #00ffff, 2px 2px 0 #000; }
          50% { text-shadow: 0 0 8px #00ffff, 2px 2px 0 #000; }
        }
        @keyframes glow-pink {
          0%, 100% { text-shadow: 0 0 4px #ff6bff, 2px 2px 0 #000; }
          50% { text-shadow: 0 0 8px #ff6bff, 2px 2px 0 #000; }
        }
      `}</style>

    </>
  )
}