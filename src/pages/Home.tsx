import { useEffect, useRef, useSyncExternalStore } from 'react';
import { GAMES, type GameEntry } from '../games/registry';
import { getBest } from '../lib/storage';
import styles from './Home.module.css';

const subscribe = (fn: () => void) => {
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
};

/** Card art is a crop of the real game world, drawn with the game's own pixel sprites. */
function TimberArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        await document.fonts.load('8px "Press Start 2P"');
      } catch {
        /* ignore */
      }
      const [{ Art }, { BASE, COUNTER, SLOT_Y }] = await Promise.all([
        import('../games/timber-rush/sprites'),
        import('../games/timber-rush/config'),
      ]);
      if (dead || !ref.current) return;
      const art = new Art();
      const c = ref.current;
      c.width = 160;
      c.height = 90;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      const ox = Math.round(BASE.x / 4) - 80, oy = Math.round(BASE.y / 4) - 106;
      g.drawImage(art.world, ox, oy, 160, 90, 0, 0, 160, 90);
      const at = (s: { c: HTMLCanvasElement; ax: number; ay: number }, x: number, y: number) =>
        g.drawImage(s.c, Math.round(x) - s.ax, Math.round(y) - s.ay);
      at(art.trees[0][0].s, 12, 56);
      at(art.trees[1][1].s, 143, 44);
      at(art.trees[2][1].s, 150, 88);
      at(art.stall, 80, Math.round((COUNTER.y + COUNTER.h / 2) / 4) - oy);
      const cy = Math.round(SLOT_Y / 4) - oy;
      at(art.customer(5, 1, 0), 52, cy);
      at(art.customer(23, 0, 0), 80, cy + 1);
      at(art.customer(41, 0, 0), 108, cy);
      at(art.player(0, 3, '#ffd54a'), 30, cy + 2);
    })();
    return () => {
      dead = true;
    };
  }, []);
  return <canvas ref={ref} className={styles.art} aria-hidden />;
}

function WormArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    void (async () => {
      const { drawCardArt } = await import('../games/worm-brawl/render');
      if (!dead && ref.current) drawCardArt(ref.current);
    })();
    return () => {
      dead = true;
    };
  }, []);
  return <canvas ref={ref} className={styles.art} aria-hidden />;
}

function Card({ game }: { game: GameEntry }) {
  const best = useSyncExternalStore(subscribe, () => (game.status === 'live' ? getBest(game.id) : 0));
  const live = game.status === 'live';
  const style = { '--a': game.accent[0], '--b': game.accent[1] } as React.CSSProperties;
  const body = (
    <>
      <div className={styles.cardArt}>
        {game.art === 'timber' ? <TimberArt /> : game.art === 'worms' ? <WormArt /> : <div className={styles.mystery}>?</div>}
        {!live && <span className={styles.badge}>SOON</span>}
        {live && best > 0 && <span className={styles.badge}>{game.bestLabel ? game.bestLabel(best) : `BEST ${best}`}</span>}
      </div>
      <div className={styles.cardBody}>
        <h3>{game.title}</h3>
        <p>{game.tagline}</p>
        <div className={styles.tags}>
          {game.tags.map((t) => <span key={t}>{t}</span>)}
        </div>
        {live && <span className={styles.play}>PLAY</span>}
      </div>
    </>
  );
  return live ? (
    <a className={styles.card} style={style} href={`#/play/${game.id}`}>{body}</a>
  ) : (
    <div className={`${styles.card} ${styles.locked}`} style={style}>{body}</div>
  );
}

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.stars} aria-hidden>
        <i /><i /><i /><i /><i /><i />
      </div>
      <header className={styles.header}>
        <span className={styles.logo}>RUSH<span>ARCADE</span></span>
      </header>
      <main className={styles.main}>
        <section className={styles.hero}>
          <h1>TINY GAMES.<br /><em>ONE MORE RUN.</em></h1>
          <p>Fast, loud, impossible-to-put-down mini-games that live right in your browser. No installs, no sign-ups.</p>
        </section>
        <section className={styles.grid} aria-label="Games">
          {GAMES.map((g) => <Card key={g.id} game={g} />)}
        </section>
      </main>
      <footer className={styles.footer}>New games drop regularly · Best scores are saved on this device</footer>
    </div>
  );
}
