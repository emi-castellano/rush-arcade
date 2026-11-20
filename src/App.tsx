import { Suspense } from 'react';
import { findGame } from './games/registry';
import { navigate, useHashRoute } from './lib/useHashRoute';
import Home from './pages/Home';
import styles from './pages/Home.module.css';

export default function App() {
  const route = useHashRoute();
  const match = /^\/play\/([\w-]+)/.exec(route);
  const game = match ? findGame(match[1]) : undefined;

  if (game?.component) {
    const Game = game.component;
    return (
      <Suspense fallback={<div className={styles.loading}>Loading {game.title}…</div>}>
        <Game onExit={() => navigate('/')} />
      </Suspense>
    );
  }
  return <Home />;
}
