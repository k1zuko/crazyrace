"use client"
import { AnimatePresence, motion } from "framer-motion";

export default function LoadingRetro() {
  return (
    <>
      <AnimatePresence>
        <motion.div
          // initial={{ opacity: 0 }}
          // animate={{ opacity: 1 }}
          // exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a0a2a]/80 backdrop-blur-sm"
        >
          <div className="pixel-border-large p-8 text-center">
            <motion.p
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-2xl md:text-4xl text-[#00ffff] pixel-text glow-cyan"
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
      </AnimatePresence>

      <style jsx>{`.pixel-border-large {
          border: 4px solid #00ffff;
          background: linear-gradient(45deg, #1a0a2a, #2d1b69);
          box-shadow: 0 0 20px rgba(255, 107, 255, 0.3);
        }
        .pixel-border-large::before {
          content: '';
          position: absolute;
          top: -8px;
          left: -8px;
          right: -8px;
          bottom: -8px;
          border: 2px solid #ff6bff;
          z-index: -1;
        }`}</style>
    </>
  )
}