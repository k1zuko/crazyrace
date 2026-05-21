"use client"

import { useEffect, useState } from "react"

export function usePreloaderScreen() {
  const [progress, setProgress] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const essentialAssets = [
      "/racing-game/images/sprites.png",
    ]

    // car & console image → load setelah UI tampil (lazy)
    const secondaryAssets = [
      "/assets/car/car1_v2.webp",
      "/assets/car/car2_v2.webp",
      "/assets/car/car3_v2.webp",
      "/assets/car/car4_v2.webp",
      "/assets/car/car5_v2.webp",
      "/racing-game/images/up.webp",
      "/racing-game/images/down.webp",
      "/racing-game/images/left.webp",
      "/racing-game/images/right.webp"
    ]

    let loaded = 0
    const total = essentialAssets.length

    const loadImage = async (src: string) => {
      const res = await fetch(src)
      const blob = await res.blob()
      await createImageBitmap(blob)
      loaded++
      setProgress(Math.round((loaded / total) * 100))
    }

    async function startPreload() {
      await Promise.all(essentialAssets.map(loadImage))
      setIsLoaded(true)

      // load sisa asset di background tanpa mempengaruhi performance
      setTimeout(() => {
        secondaryAssets.forEach((src) => {
          const img = new Image()
          img.src = src
        })
      }, 0)
    }

    startPreload()
  }, [])

  return { progress, isLoaded }
}
