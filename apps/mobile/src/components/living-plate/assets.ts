import type { RescueCandidate } from '@meal-rescue/shared-types';

/**
 * Living Plate asset contract.
 *
 * All Living Plate visuals are inline react-native-svg vector art so they
 * work with zero runtime downloads. If art files are ever added (e.g. a
 * dedicated mascot/pattern PNG for the plate background) they must be listed
 * in ASSET_SLOTS below and required statically, never fetched at runtime.
 */
export const ASSET_SLOTS = [
  {
    name: 'living-plate/gem',
    dimensions: '24x24 @2x (48px)',
    format: 'SVG path (inlined) or PNG',
    usage: 'Addition badge shown on the plate when the user taps an addition.',
  },
  {
    name: 'living-plate/base-wallpaper',
    dimensions: '320x320 @2x',
    format: 'PNG (grayscale)',
    usage: 'Optional decorative plate background. Currently a vector fill.',
  },
] as const;

export interface PlateGeometry {
  plateRadius: number;
  bowlRadius: number;
  moundRadiusX: number;
  moundRadiusY: number;
}

/** Top-view plate geometry, centered in a 200x200 viewBox. */
export const PLATE_GEOMETRY: PlateGeometry = {
  plateRadius: 92,
  bowlRadius: 68,
  moundRadiusX: 52,
  moundRadiusY: 34,
};

/** Base-meal mound (before state). A soft, slightly-lopsided bean shape. */
export const BASE_BLOB_PATH =
  'M 100 140 C 62 140 44 118 46 102 C 48 82 68 74 84 84 C 78 66 92 48 112 54 C 132 48 152 62 156 86 C 160 110 138 140 100 140 Z';

/**
 * Resolves a short glyph for an addition. Kitchen-friendly emoji are used for
 * common ingredients; anything unknown falls back to the ingredient's initial
 * so the plate never shows a blank badge.
 */
const ADDITION_EMOJI: Record<string, string> = {
  egg: '🥚',
  spinach: '🥬',
  cheese: '🧀',
  avocado: '🥑',
  tomato: '🍅',
  chicken: '🍗',
  garlic: '🧄',
  onion: '🧅',
  mushroom: '🍄',
  lemon: '🍋',
  chili: '🌶️',
  sesame: '🫘',
  nuts: '🥜',
  yogurt: '🥛',
  olive: '🫒',
  bread: '🍞',
  rice: '🍚',
  noodles: '🍜',
  beans: '🫘',
  corn: '🌽',
  peas: '🫛',
  'green onion': '🧅',
  scallion: '🧅',
};

/** Single-name glyph resolver (additions and substitution replacements). */
export function glyphForName(name: string): string {
  const lowered = name.toLowerCase().trim();
  const emoji = ADDITION_EMOJI[lowered];
  if (emoji) return emoji;
  const first = name.trim().charAt(0);
  if (name && first.toLowerCase() !== first.toUpperCase()) return first.toUpperCase();
  return '＋';
}

export function additionGlyph(additions: RescueCandidate['additions'], index: number): string {
  return glyphForName(additions[index]?.name ?? '');
}
