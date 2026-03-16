// utils/game.ts
export const calculateRemainingTime = (startTime: string | null, totalDuration: number = 300): number => {
  if (!startTime) return totalDuration;
  
  try {
    const start = new Date(startTime).getTime();
    const now = new Date().getTime();
    const elapsed = Math.floor((now - start) / 1000);
    const remaining = Math.max(0, totalDuration - elapsed);
    
    return remaining;
  } catch (error) {
    console.error('Error calculating remaining time:', error);
    return totalDuration;
  }
};

export const sortPlayersByProgress = (players: any[]): any[] => {
  return players
    .map(player => {
      const result = player.result?.[0] || {};
      return {
        ...player,
        _progress: result.current_question || 0,
        _correct: result.correct || 0,
        _duration: result.duration || 0,
      };
    })
    .sort((a, b) => {
      if (b._progress !== a._progress) return b._progress - a._progress;
      if (b._correct !== a._correct) return b._correct - a._correct;
      return a._duration - b._duration;
    });
};


export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function breakOnCaps(text: string) {
  return text.replace(/([a-z])([A-Z])/g, '$1\u200B$2');
}

export function formatUrlBreakable(url: string): string {
  // Tambahkan zero-width space (\u200B) setelah karakter tertentu
  return url.replace(/([./?&=_-])/g, '$1\u200B');
}
