import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DIFFICULTY, TEAM_NAMES, VH, VW, WEAPONS, INF, type Difficulty, type WeaponId } from './config';
import { WormEngine } from './engine';
import { Renderer } from './render';
import { drawWeaponIcon } from './icons';
import { wsfx } from './audio';
import styles from './WormBrawl.module.css';

interface Props {
  onExit: () => void;
}

function WeaponIcon({ id }: { id: WeaponId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawWeaponIcon(ref.current, id);
  }, [id]);
  return <canvas ref={ref} className={styles.icon} aria-hidden />;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '', ''];

export default function WormBrawl({ onExit }: Props) {
  const [engine] = useState(() => new WormEngine());
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  if (import.meta.env.DEV) (window as unknown as { __worm: WormEngine }).__worm = engine; // dev-only debug handle
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [muted, setMuted] = useState(wsfx.muted);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [perTeam, setPerTeam] = useState(3);

  // render loop (fixed-step simulation, integer-scaled pixel canvas)
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    const boot = async () => {
      try {
        await document.fonts.load('8px "Press Start 2P"');
      } catch {
        /* fall back */
      }
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const stage = stageRef.current!;
      const renderer = new Renderer(canvas, engine);
      const fit = () => {
        const r = stage.getBoundingClientRect();
        const w = Math.max(320, Math.min(r.width, (r.height * VW) / VH));
        renderer.resize(w, window.devicePixelRatio || 1);
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(stage);

      const STEP = 1 / 120;
      let raf = 0;
      let last = performance.now();
      let acc = 0;
      const frame = (now: number) => {
        acc += Math.min(0.1, (now - last) / 1000);
        last = now;
        let n = 0;
        while (acc >= STEP && n < 12) {
          engine.update(STEP);
          acc -= STEP;
          n++;
        }
        if (n === 12) acc = 0;
        renderer.draw();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      const onVis = () => {
        if (document.hidden && (engine.phase === 'turn' || engine.phase === 'resolve') && !engine.paused) engine.togglePause();
        last = performance.now();
      };
      document.addEventListener('visibilitychange', onVis);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      };
    };
    void boot();
    return () => {
      cancelled = true;
      cleanup();
      wsfx.stopLoops();
    };
  }, [engine]);

  // keyboard
  useEffect(() => {
    const GAME_KEYS = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Tab'];
    const onDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
      if (e.code === 'Enter' && (engine.phase === 'ready' || engine.phase === 'over')) {
        e.preventDefault();
        engine.start({ difficulty, perTeam });
        return;
      }
      if (e.repeat) return;
      engine.keyDown(e.code);
    };
    const onUp = (e: KeyboardEvent) => engine.keyUp(e.code);
    const onBlur = () => engine.clearKeys();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [engine, difficulty, perTeam]);

  const toArt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toArt(e);
    engine.setMouse(p.x, p.y);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toArt(e);
    engine.setMouse(p.x, p.y);
    engine.click(p.x, p.y);
  };

  const toggleMute = () => {
    wsfx.init();
    wsfx.setMuted(!muted);
    setMuted(!muted);
  };

  const start = () => engine.start({ difficulty, perTeam });
  const youWon = snap.winner === 0;

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <button className={styles.pill} onClick={onExit}>◂ ARCADE</button>
        <span className={styles.title}>WORM BRAWL</span>
        <div className={styles.topRight}>
          <button className={styles.pill} onClick={toggleMute}>{muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
          <button
            className={styles.pill}
            onClick={() => engine.togglePause()}
            disabled={snap.phase === 'ready' || snap.phase === 'over'}
          >
            {snap.paused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.stage} ref={stageRef}>
          <div className={styles.frame}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
            />

            {snap.phase === 'ready' && (
              <div className={styles.overlay}>
                <div className={styles.card}>
                  <h1>Worm Brawl</h1>
                  <p className={styles.lead}>Blast the landscape. Outsmart the AI. Last worm standing wins.</p>
                  <ul className={styles.rules}>
                    <li><b>A / D</b> move · <b>W / S</b> aim · <b>SPACE</b> fire (hold to charge) · <b>ENTER</b> jump · <b>BACKSPACE</b> backflip</li>
                    <li>Pick tools with <b>1–0</b>, <b>Q / E</b> or the panel. <b>Ninja rope</b>, <b>jet pack</b>, <b>drill</b> and <b>teleport</b> help you get around.</li>
                    <li>You get <b>30 seconds</b> a turn. Wind pushes rockets. <b>Water is deadly.</b></li>
                  </ul>
                  <div className={styles.opts}>
                    <div>
                      <span>AI SKILL</span>
                      {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                        <button key={d} className={`${styles.opt} ${difficulty === d ? styles.optOn : ''}`} onClick={() => setDifficulty(d)}>
                          {d.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div>
                      <span>WORMS PER TEAM</span>
                      {[2, 3, 4].map((n) => (
                        <button key={n} className={`${styles.opt} ${perTeam === n ? styles.optOn : ''}`} onClick={() => setPerTeam(n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className={styles.cta} onClick={start} autoFocus>
                    Start match <kbd>Enter</kbd>
                  </button>
                  {snap.wins > 0 && <p className={styles.best}>Wins: {snap.wins}</p>}
                </div>
              </div>
            )}

            {snap.paused && (
              <div className={styles.overlay}>
                <div className={styles.card}>
                  <h1>Paused</h1>
                  <button className={styles.cta} onClick={() => engine.togglePause()}>Resume</button>
                </div>
              </div>
            )}

            {snap.phase === 'over' && (
              <div className={styles.overlay}>
                <div className={styles.card}>
                  <h2 className={youWon ? styles.win : styles.lose}>
                    {snap.winner === 2 ? 'DRAW!' : youWon ? 'VICTORY!' : `${TEAM_NAMES[1]} WINS`}
                  </h2>
                  <p className={styles.lead}>{snap.winner === 2 ? 'Everybody went boom.' : youWon ? 'Your worms are the champions.' : 'The AI outplayed you this time.'}</p>
                  <p className={styles.best}>Total wins: {snap.wins}</p>
                  <button className={styles.cta} onClick={start} autoFocus>
                    Rematch <kbd>Enter</kbd>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className={styles.panel} aria-label="Weapons">
          <h2 className={styles.panelTitle}>ARSENAL</h2>
          <div className={styles.list}>
            {WEAPONS.map((w, i) => {
              const ammo = snap.ammo[w.id];
              const usable = snap.humanTurn && ammo > 0 && !(snap.fired && w.attack);
              return (
                <button
                  key={w.id}
                  className={`${styles.weapon} ${snap.weapon === w.id ? styles.sel : ''}`}
                  disabled={!usable}
                  onClick={() => engine.selectWeapon(w.id)}
                  title={w.blurb}
                >
                  {KEYS[i] && <span className={styles.key}>{KEYS[i]}</span>}
                  <WeaponIcon id={w.id} />
                  <span className={styles.wname}>{w.name}</span>
                  <span className={styles.ammo}>{ammo >= INF ? '∞' : ammo}</span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
