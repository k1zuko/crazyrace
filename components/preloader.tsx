"use client"

import { useEffect, useState } from "react"

export function usePreloader() {
    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        const globalAssets = [
            "/assets/car/car1_v2.webp",
            "/assets/car/car2_v2.webp",
            "/assets/car/car3_v2.webp",
            "/assets/car/car4_v2.webp",
            "/assets/car/car5_v2.webp",
        ]
        const assetsImages = [
            "/assets/background/2_v2.webp",
            "/assets/background/4_v2.webp",
            "/assets/background/host/1.webp",
            "/assets/background/host/3.webp",
            "/assets/background/host/4.webp",
            "/assets/background/host/7.webp",
        ]

        const allImages = [
            ...globalAssets,
            ...assetsImages,
            // ...racingImages
        ]

        // const audios = [
        //   "/assets/music/resonance.mp3",
        //   "/assets/music/robbers.mp3",
        //   "/racing-game/music/racer.mp3",
        //   "/racing-game/music/racer.ogg",
        // ]

        let loadedCount = 0
        const total = allImages
            .length
            // + audios.length

        const checkDone = () => {
            loadedCount++
            if (loadedCount >= total) setIsLoaded(true)
        }

        allImages.forEach((src) => {
            const img = new Image()
            img.src = src
            img.onload = checkDone
            img.onerror = checkDone
        })

        // audios.forEach((src) => {
        //   const audio = new Audio()
        //   audio.src = src
        //   audio.preload = "auto"
        //   audio.oncanplaythrough = checkDone
        //   audio.onerror = checkDone
        // })
    }, [])

    return isLoaded
}
