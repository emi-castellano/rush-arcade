import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface GameEntry {
  id: string;
  title: string;
  tagline: string;
  tags: string[];
  status: 'live' | 'soon';
  accent: [string, string];
  art: 'timber' | 'worms' | 'mystery';
  /** Formats the saved best value for the card badge (default: BEST n). */
  bestLabel?: (n: number) => string;
  component?: LazyExoticComponent<ComponentType<{ onExit: () => void }>>;
}

/** Add new games here — the hub page and router pick them up automatically. */
export const GAMES: GameEntry[] = [
  {
    id: 'timber-rush',
    title: 'Timber Rush',
    tagline: 'Chop. Sell. Level up. Beat the clock.',
    tags: ['Arcade', 'Idle-ish', 'Fast'],
    status: 'live',
    accent: ['#3ddc84', '#ffb020'],
    art: 'timber',
    bestLabel: (n) => `BEST $${n.toLocaleString()}`,
    component: lazy(() => import('./timber-rush/TimberRush')),
  },
  {
    id: 'worm-brawl',
    title: 'Worm Brawl',
    tagline: 'Turn-based worm warfare. Blast the map. Beat the AI.',
    tags: ['Strategy', 'Turn-based', 'vs AI'],
    status: 'live',
    accent: ['#ff8a5c', '#7c5cff'],
    art: 'worms',
    bestLabel: (n) => `WINS ${n}`,
    component: lazy(() => import('./worm-brawl/WormBrawl')),
  },
  {
    id: 'coming-2',
    title: 'Another one',
    tagline: 'One more run is never enough.',
    tags: ['Soon'],
    status: 'soon',
    accent: ['#22d3ee', '#3b82f6'],
    art: 'mystery',
  },
];

export const findGame = (id: string) => GAMES.find((g) => g.id === id && g.status === 'live');
