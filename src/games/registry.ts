import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface GameEntry {
  id: string;
  title: string;
  tagline: string;
  tags: string[];
  status: 'live' | 'soon';
  accent: [string, string];
  art: 'timber' | 'mystery';
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
    component: lazy(() => import('./timber-rush/TimberRush')),
  },
  {
    id: 'coming-1',
    title: 'Next game',
    tagline: 'Something addictive is cooking…',
    tags: ['Soon'],
    status: 'soon',
    accent: ['#7c5cff', '#ff5ca8'],
    art: 'mystery',
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
