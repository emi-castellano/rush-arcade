import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ANGRY_PENALTY, H, MAX_SKILLS, UPGRADES, W, type UpgradeId } from './config';
import { drawIcon } from './icons';
import { TimberEngine } from './engine';
import { Renderer } from './render';
import { sfx } from './audio';
import { music } from './music';
import styles from './TimberRush.module.css';

function PixelIcon({ id, className }: { id: UpgradeId; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawIcon(ref.current, id);
  }, [id]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

interface Props {
  onExit: () => void;
}

export default function TimberRush({ onExit }: Props) {
  const [engine] = useState(() => new TimberEngine());
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  if (import.meta.env.DEV) {
    const w = window as unknown as { __engine: TimberEngine; __music: typeof music };
    w.__engine = engine; // dev-only debug handles
    w.__music = music;
  }
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [muted, setMuted] = useState(sfx.muted);
  const [musicOn, setMusicOn] = useState(!music.muted);

  // render loop + sizing (waits for the pixel font so sprite text bakes correctly)
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    const boot = async () => {
      try {
        await document.fonts.load('8px "Press Start 2P"');
      } catch {
        /* fall back to monospace */
      }
      if (cancelled) return;
      const canvas = canvasRef.current!;
      const stage = stageRef.current!;
      const renderer = new Renderer(canvas, engine);

      const fit = () => {
        const r = stage.getBoundingClientRect();
        const w = Math.max(320, Math.min(r.width, (r.height * W) / H));
        renderer.resize(w, window.devicePixelRatio || 1);
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(stage);

      // fixed-timestep simulation: movement is identical on 60/120/144 Hz screens and frame hiccups don't jerk the camera
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
        if (engine.phase === 'playing') {
          // adrenaline: music speeds up during Rush Hour and when the clock is nearly out
          const danger = Math.max(0, Math.min(1, (14 - engine.time) / 14));
          const rush = engine.rushLeft > 0 ? 0.5 : 0;
          music.setIntensity(0.15 + Math.min(0.25, engine.elapsed / 400) + rush + danger * 0.6);
        }
        renderer.draw();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      const onVis = () => {
        if (document.hidden && engine.phase === 'playing') engine.togglePause();
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
    };
  }, [engine]);

  // music follows the game phase
  useEffect(() => {
    if (snap.phase === 'playing') music.play();
    else if (snap.phase === 'paused' || snap.phase === 'levelup') music.duck(true);
    else if (snap.phase === 'over') music.stop();
  }, [snap.phase]);
  useEffect(() => () => music.stop(), []);

  // keyboard
  useEffect(() => {
    const GAME_KEYS = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    const onDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
      if ((e.code === 'Enter' || e.code === 'Space') && (engine.phase === 'ready' || engine.phase === 'over')) {
        e.preventDefault();
        engine.start();
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
  }, [engine]);

  // drag anywhere on the canvas to move (touch / mouse floating joystick)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.x) / 50, dy = (e.clientY - d.y) / 50;
    const len = Math.hypot(dx, dy);
    const k = len > 1 ? 1 / len : 1;
    engine.stick.x = Math.abs(dx) < 0.15 ? 0 : dx * k;
    engine.stick.y = Math.abs(dy) < 0.15 ? 0 : dy * k;
  };
  const onPointerUp = () => {
    drag.current = null;
    engine.stick.x = engine.stick.y = 0;
  };

  const toggleMusic = () => {
    sfx.init();
    music.setMuted(!musicOn);
    setMusicOn(!musicOn);
    if (musicOn === false && snap.phase === 'playing') music.play();
  };

  const toggleMute = () => {
    sfx.init();
    sfx.setMuted(!muted);
    setMuted(!muted);
  };

  const playing = snap.phase === 'playing';

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <button className={styles.pill} onClick={onExit}>◂ ARCADE</button>
        <span className={styles.title}>TIMBER RUSH</span>
        <div className={styles.topRight}>
          <button className={styles.pill} onClick={toggleMusic} aria-label="Toggle music">{musicOn ? 'MUSIC: ON' : 'MUSIC: OFF'}</button>
          <button className={styles.pill} onClick={toggleMute} aria-label="Toggle sound">{muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
          <button className={styles.pill} onClick={() => engine.togglePause()} disabled={!playing && snap.phase !== 'paused'}>
            {snap.phase === 'paused' ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
      </div>

      <div className={styles.body}>
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.frame}>
          <canvas ref={canvasRef} className={styles.canvas} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />

          {snap.phase === 'ready' && (
            <div className={styles.overlay}>
              <div className={styles.card}>
                <h1>Timber Rush</h1>
                <p className={styles.lead}>The clock never stops. Chop fast, sell faster.</p>
                <ul className={styles.rules}>
                  <li><b>WASD / arrows</b> to run around the map (or drag on touch). Stand near a tree and you <b>chop automatically</b>. Trees grow back!</li>
                  <li>Your <b>backpack</b> fills up. Run home and stand in the glowing <b>DEPOT</b> to unload.</li>
                  <li>Customers at the counter are served from the depot. Each sale <b>adds time</b> and gives <b>XP</b>.</li>
                  <li>Angry customers <b>cost {ANGRY_PENALTY} seconds</b>. Every <b>level up</b> lets you pick a <b>skill</b> (time stops while you choose).</li>
                  <li>Watch out for <b>RUSH HOUR</b>, <b>bees</b> and the <b>thief</b>. Hunt <b>golden</b> and <b>bomb</b> trees!</li>
                </ul>
                <button className={styles.cta} onClick={() => engine.start()} autoFocus>
                  Start chopping <kbd>Enter</kbd>
                </button>
                {snap.best > 0 && <p className={styles.best}>Best: ${snap.best.toLocaleString()}</p>}
              </div>
            </div>
          )}

          {snap.phase === 'paused' && (
            <div className={styles.overlay}>
              <div className={styles.card}>
                <h1>Paused</h1>
                <button className={styles.cta} onClick={() => engine.togglePause()}>Resume</button>
              </div>
            </div>
          )}

          {snap.phase === 'levelup' && (
            <div className={styles.overlay}>
              <div className={styles.levelCard}>
                <h2 className={styles.levelTitle}>LEVEL UP! <span>LV {snap.level}</span></h2>
                <p className={styles.levelLead}>
                  Pick a skill · press <b>1</b> <b>2</b> <b>3</b> · time is stopped
                </p>
                <div className={styles.choices}>
                  {snap.choices.map((id, i) => {
                    const u = UPGRADES.find((x) => x.id === id)!;
                    const lvl = snap.levels[id];
                    return (
                      <button key={id} className={styles.choice} onClick={() => engine.pick(id)}>
                        <span className={styles.choiceKey}>{i + 1}</span>
                        <span className={lvl === 0 ? styles.tagNew : styles.tagUp}>
                          {lvl === 0 ? 'NEW SKILL' : `LV ${lvl} → ${lvl + 1}`}
                        </span>
                        <PixelIcon id={id} className={styles.choiceIcon} />
                        <span className={styles.choiceName}>{u.name}</span>
                        <span className={styles.choiceStat}>{u.stat(lvl)} <b>→</b> {u.stat(lvl + 1)}</span>
                        <span className={styles.choiceBlurb}>{u.blurb}</span>
                      </button>
                    );
                  })}
                </div>
                <p className={styles.slotInfo}>
                  Skills {snap.owned.length}/{MAX_SKILLS}
                  {snap.owned.length >= MAX_SKILLS ? ' · slots full, upgrade what you have' : ''}
                </p>
              </div>
            </div>
          )}

          {snap.phase === 'over' && (
            <div className={styles.overlay}>
              <div className={styles.card}>
                <h2 className={styles.over}>Time's up!</h2>
                <div className={styles.score}>${snap.score.toLocaleString()}</div>
                {snap.newBest ? <p className={styles.newBest}>🏆 New best!</p> : <p className={styles.best}>Best: ${snap.best.toLocaleString()}</p>}
                <div className={styles.statsGrid}>
                  <div><b>{snap.stats.survived}s</b><span>survived</span></div>
                  <div><b>{snap.stats.logs}</b><span>logs chopped</span></div>
                  <div><b>{snap.stats.sold}</b><span>logs sold</span></div>
                  <div><b>x{snap.stats.maxCombo}</b><span>best combo</span></div>
                </div>
                <button className={styles.cta} onClick={() => engine.start()} autoFocus>
                  One more run <kbd>Enter</kbd>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className={styles.shop} aria-label="Skills">
        <h2 className={styles.shopTitle}>
          SKILLS
          <span className={styles.wallet}>{snap.owned.length}/{MAX_SKILLS}</span>
        </h2>
        <div className={styles.xpBox}>
          <span className={styles.xpLv}>LV {snap.level}</span>
          <div className={styles.xpBar}>
            <i style={{ width: `${Math.min(100, (snap.xp / snap.xpNeed) * 100)}%` }} />
          </div>
          <span className={styles.xpNum}>{snap.xp}/{snap.xpNeed} XP</span>
        </div>
        <div className={styles.shopList}>
          {Array.from({ length: MAX_SKILLS }, (_, i) => {
            const id = snap.owned[i];
            if (!id) return <div key={i} className={styles.empty}>EMPTY SLOT</div>;
            const u = UPGRADES.find((x) => x.id === id)!;
            const lvl = snap.levels[id];
            return (
              <div key={id} className={`${styles.upgrade} ${lvl >= u.max ? styles.maxed : ''}`} title={u.blurb}>
                <PixelIcon id={id} className={styles.icon} />
                <span className={styles.info}>
                  <span className={styles.uname}>{u.name}</span>
                  <span className={styles.ustat}>{u.stat(lvl)}</span>
                  <span className={styles.pips}>
                    {Array.from({ length: Math.min(u.max, 14) }, (_, k) => (
                      <i key={k} className={k < lvl ? styles.pipOn : ''} />
                    ))}
                  </span>
                </span>
                <span className={styles.cost}>{lvl >= u.max ? 'MAX' : `LV ${lvl}`}</span>
              </div>
            );
          })}
        </div>
        <p className={styles.panelHint}>Sell logs to earn XP. Every level up: learn or upgrade a skill.</p>
      </aside>
      </div>
    </div>
  );
}
