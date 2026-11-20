const key = (id: string) => `rush-arcade.${id}.best`;

export function getBest(gameId: string): number {
  try {
    return Number(localStorage.getItem(key(gameId))) || 0;
  } catch {
    return 0;
  }
}

export function setBest(gameId: string, score: number): void {
  try {
    localStorage.setItem(key(gameId), String(Math.floor(score)));
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

export function getMuted(): boolean {
  try {
    return localStorage.getItem('rush-arcade.muted') === '1';
  } catch {
    return false;
  }
}

export function setMuted(m: boolean): void {
  try {
    localStorage.setItem('rush-arcade.muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getMusicMuted(): boolean {
  try {
    return localStorage.getItem('rush-arcade.music.muted') === '1';
  } catch {
    return false;
  }
}

export function setMusicMuted(m: boolean): void {
  try {
    localStorage.setItem('rush-arcade.music.muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}
