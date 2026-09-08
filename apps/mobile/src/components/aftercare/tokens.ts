/**
 * Aftercare slice color tokens.
 *
 * The shared theme (forbidden surface) does not expose a warm accent on this
 * branch, so the aftercare + living-plate slices carry their own accent pair.
 * Values match the coordinator's design intent (warm editorial accent). At
 * merge these may be swapped for the theme's accent tokens if they land.
 */
export const aftercareColors = {
  accent: '#C64B16',
  accentSoft: '#FBEDE4',
} as const;
