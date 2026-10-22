import { createContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ArtworkTheme } from '@/utils/artworkTheme';
import type { ArtworkColorCache } from '@/utils/artworkColorCache';

export const ArtworkColorCacheContext = createContext<ArtworkColorCache | null>(null);
export const PageArtworkThemeContext = createContext<Dispatch<SetStateAction<ArtworkTheme | null>> | null>(null);
