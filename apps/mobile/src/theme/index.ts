import { TextStyle } from 'react-native';

/**
 * Design tokens — a calm, professional editorial palette. Base is pure
 * white + soft grey + near-black ink; the single rose-red `#EA0F55` is
 * used sparingly — buttons, active icons, links, and a few deliberate
 * accents only. Pills, chips, cards and fills stay monochrome so the UI
 * reads light, simple and precise — no loud red, no decorative colour.
 */
export const colors = {
  /** Primary accent — muted smoke grey. Buttons and active icons only. */
  primary: '#8E8E93',
  /** Light neutral fill for chips/pills/badges (deliberately NOT red). */
  primaryLight: '#F4F4F6',
  /** Secondary — muted neutral grey for subtle accents. */
  secondary: '#8E8E93',
  /** App background — pure white. */
  background: '#FFFFFF',
  /** Card / surface background — pure white. */
  surface: '#FFFFFF',
  /** Primary text — near-black ink instead of harsh black. */
  text: '#17171A',
  /** Semantic alias for primary text on light surfaces. */
  textPrimary: '#17171A',
  /** Secondary / muted text — light neutral grey. */
  textSecondary: '#8A8A8E',
  /** Editorial accent — alias of the rose for secondary actions. */
  accent: '#EA0F55',
  /** Soft neutral tint (monochrome) behind content groups. */
  accentSoft: '#F4F4F6',
  /** Borders and dividers — light neutral grey (decorative separators). */
  border: '#E6E6E9',
  /** Stronger border for interactive bounds and focus rings. */
  borderStrong: '#B9B9C0',
  /** Error — deep rose for destructive / error states (elegant, not harsh). */
  error: '#B4103F',
  /** Soft error tint — surface behind error banners. */
  errorSoft: '#FBE9EF',
  /** Warning — muted honey-amber for caution states. */
  warning: '#A97B2E',
  /** Success — muted sage green, positive feedback only. */
  success: '#5C7A4B',
  /** Soft success tint — surface behind positive confirmation. */
  successSoft: '#E9EFE2',
  /**
   * Single universal accent for icons. Elegant charcoal-black — replaces the old
   * rose-red in ~100 spots: tab tints, chevrons, camera, people, book
   * icons. Keeping the key name means every call site re-tints with zero
   * churn.
   */
  softAlert: '#161616',
  /** Soft rose — subtle zone accent for Common Table / people. */
  softRose: '#CF8497',
  /** Honey amber — subtle zone accent for Meal Plan / plans. */
  softWarm: '#B08A3D',
  /** Muted caution — sparing warning symbol. */
  softCaution: '#A97B2E',
  /** Sage green — subtle zone accent for Kitchen / fresh. */
  softFresh: '#6B7F5C',
  /** Cool stone — muted reserved tone (secondary data). */
  softCool: '#7C8A92',
  /** Warm taupe — subtle zone accent for Profile. */
  softAccent: '#8C8578',
  /** Lighter warm stone — tertiary icon tone. */
  softCreative: '#9C9388',
  /** Soft red — signal color for urgent/expiring items. */
  softRed: '#D94F4F',
  /** Soft green — signal color for fresh/ready items. */
  softGreen: '#5C9A6B',
  /** Soft cyan — signal color for expiring soon. */
  softCyan: '#5BA3B5',
  /** Soft yellow — signal color for low stock. */
  softYellow: '#C4982A',
  /** Soft purple — signal color for unused items. */
  softPurple: '#8B6DAF',
  /** Soft peach — warm accent for kitchen actions. */
  softPeach: '#D4956A',
  /** Soft violet — fallback signal color. */
  softViolet: '#7E6AAF',
  /**
   * Home / Rescue tab — premium editorial palette.
   * Warm white foundation, restrained blush/sage/peach tints, charcoal ink.
   * The cat is no longer the hero; the rescue action is.
   */
  /** Page background — warm white, never clinical white. */
  homeBackground: '#F8F8F0',
  /** Soft warm parchment — main "What's on your plate?" hero. Same warm-paper family as the background, no pink. */
  homeCardBlush: '#F1EDDF',
  /** Soft warm sand — Scan leftovers quick rescue card. Warm-neutral, no green. */
  homeCardSage: '#F4F1E7',
  /** Soft desaturated cream — Use pantry quick rescue card. */
  homeCardPeach: '#F9ECE7',
  /** White surface — image cards, small controls, needs-rescuing cards. */
  homeSurface: '#FFFFFF',
  /** Charcoal ink — primary text, reinforces the quiet editorial look. */
  homeInk: '#161616',
  /** Blue-charcoal primary button fill. */
  homeButton: '#182028',
  /** Deep press state for the primary button. */
  homeButtonPressed: '#111820',
  /** Secondary text — description copy, captions. */
  homeTextSecondary: '#6F6F6B',
  /** Tertiary text — faint labels. */
  homeTextTertiary: '#989894',
  /** Quiet text — add-manually link, chevrons. */
  homeTextQuiet: '#555550',
  /** Faint text — quick rescue card descriptions. */
  homeTextFaint: '#777772',
  /** Subtle separator — rgba(22,22,22,0.08). */
  homeDivider: 'rgba(22, 22, 22, 0.08)',
  /** Restrained alert red — tiny unread dot only. */
  homeAlert: '#D95C54',
  /** Unselected bottom-navigation icon/label tone. */
  homeNavInactive: '#8C8C87',
  /** Warm neutral fill for chips/selected pills in the rescue flow. */
  homeTintNeutral: '#F1EFE6',
  /** Charcoal accent for the deeper rescue-flow screens (buttons, links, icons). */
  rescueAccent: '#182028',

  // ─────────────────────────────────────────────────────
  // Kitchen tab — inherits Home palette, no new dominant color.
  // ─────────────────────────────────────────────────────
  /** Kitchen page background — warm white (#F8F8F0), same as Home. */
  kitchenBackground: '#F8F8F0',
  /** Kitchen surface — ingredient cards, search bar. */
  kitchenSurface: '#FFFFFF',
  /** Kitchen charcoal ink — primary text, same as Home. */
  kitchenInk: '#161616',
  /** Kitchen secondary text — captions, quantities. */
  kitchenSecondary: '#6F6F6B',
  /** Kitchen tertiary text — faint labels, placeholder. */
  kitchenTertiary: '#989894',
  /** Kitchen quiet text — chevrons, utility links. */
  kitchenQuiet: '#555550',
  /** Kitchen faint text — section hints. */
  kitchenFaint: '#777772',
  /** Kitchen divider — rgba(22,22,22,0.07). */
  kitchenDivider: 'rgba(22, 22, 22, 0.07)',
  /** Kitchen pill selected — dark charcoal. */
  kitchenPillActive: '#182028',
  /** Kitchen pill unselected background. */
  kitchenPillBg: 'rgba(255,255,255,0.70)',
  /** Kitchen attention card background — soft blush. */
  kitchenAttention: '#F8F0F0',
  /** Kitchen attention text — expiry alert. */
  kitchenAlert: '#D95C54',
  /** Kitchen sage tint — fresh items. */
  kitchenSage: '#EEF4EC',
  /** Kitchen success — fresh state. */
  kitchenFresh: '#5C7A4B',

  // ─────────────────────────────────────────────────────
  // Meal Plan tab — editorial palette per design spec.
  // ─────────────────────────────────────────────────────
  /** Meal Plan page background — warm white (#F8F8F0). */
  mealPlanBackground: '#F8F8F0',
  /** Meal Plan surface — cards, white areas. */
  mealPlanSurface: '#FFFFFF',
  /** Meal Plan primary ink — charcoal (#161616). */
  mealPlanInk: '#161616',
  /** Meal Plan secondary text — muted (#6F6F6F). */
  mealPlanSecondary: '#6F6F6F',
  /** Meal Plan charcoal — buttons, active elements (#182028). */
  mealPlanCharcoal: '#182028',
  /** Meal Plan soft sage — planned meals pill bg (#EEF4EC). */
  mealPlanSage: '#EEF4EC',
  /** Meal Plan sage text — planned pill text (#36523A). */
  mealPlanSageText: '#36523A',
  /** Meal Plan soft blush — suggested meals pill bg (#F8F0F0). */
  mealPlanBlush: '#F8F0F0',
  /** Meal Plan blush text — suggested pill text (#6A4B4B). */
  mealPlanBlushText: '#6A4B4B',
  /** Meal Plan alert — expiry, attention (#D95C54). */
  mealPlanAlert: '#D95C54',
  /** Meal Plan divider — subtle separator. */
  mealPlanDivider: 'rgba(22, 22, 22, 0.08)',
  /** Meal Plan inactive nav — bottom bar unselected (#8C8C87). */
  mealPlanNavInactive: '#8C8C87',
  /** Match % high — strong match green. */
  mealPlanMatchHigh: '#36523A',
  /** Match % medium — warm amber. */
  mealPlanMatchMedium: '#B08A3D',
  /** Match % low — muted grey. */
  mealPlanMatchLow: '#8C8C87',
} as const;

/**
 * Font families — Raleway for body/nav/UI, DM Serif Display for headlines.
 * Loaded once at app start (see App.tsx).
 */
export const fonts = {
  thin: 'Raleway_400Regular',
  extraLight: 'Raleway_400Regular',
  light: 'Raleway_400Regular',
  regular: 'Raleway_400Regular',
  medium: 'Raleway_500Medium',
  semiBold: 'Raleway_600SemiBold',
  bold: 'Raleway_700Bold',
  extraBold: 'Raleway_800ExtraBold',
  black: 'Raleway_800ExtraBold',
  /** Headlines only — Raleway thin (weight 400). */
  serif: 'Raleway_400Regular',
  /** Display headings on the Home tab — Bricolage Grotesque bold. */
  display: 'BricolageGrotesque_700Bold',
} as const;

/** 4/8/12/16/24/32 rhythm. Existing keys (xs/sm/md/lg/xl) are unchanged. */
export const spacing = {
  xs: 4,
  sm: 8,
  smd: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Corner radii — cards 12–18, pills and chips fully round. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
  pill: 999,
} as const;

/** Icon size convention — 18/22/28. */
export const iconSizes = {
  sm: 18,
  md: 22,
  lg: 28,
} as const;

/** Minimum interactive target, per Apple HIG / Material 48dp expectations. */
export const touch = {
  min: 44,
} as const;

export const typography = {
  largeTitle: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 33,
  } as TextStyle,
  title: {
    fontSize: 32,
    fontWeight: '800',
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 44,
  } as TextStyle,
  heading: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    lineHeight: 28,
  } as TextStyle,
  subhead: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
    lineHeight: 22,
  } as TextStyle,
  body: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
    lineHeight: 23,
  } as TextStyle,
  bodySmall: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.textPrimary,
    lineHeight: 19,
  } as TextStyle,
  callout: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    lineHeight: 21,
  } as TextStyle,
  caption: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 18,
  } as TextStyle,
  caption2: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 17,
  } as TextStyle,
  /** Meal Plan — editorial serif title (DM Serif Display). */
  mealPlanTitle: {
    fontSize: 24,
    fontWeight: '400',
    fontFamily: fonts.serif,
    color: colors.mealPlanInk,
    letterSpacing: -0.3,
    lineHeight: 32,
  } as TextStyle,
  /** Meal Plan — section heading. */
  mealPlanSection: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.mealPlanInk,
    lineHeight: 23,
  } as TextStyle,
  /** Meal Plan — card body text. */
  mealPlanBody: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.mealPlanInk,
    lineHeight: 21,
  } as TextStyle,
  /** Meal Plan — small caption, match %, times. */
  mealPlanCaption: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.mealPlanSecondary,
    lineHeight: 18,
  } as TextStyle,
  /** Meal Plan — meal name in card. */
  mealPlanMealName: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: fonts.medium,
    color: colors.mealPlanInk,
    lineHeight: 22,
  } as TextStyle,
  /** Meal Plan — date cell day number. */
  mealPlanDayNum: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.mealPlanInk,
    lineHeight: 22,
  } as TextStyle,
  /** Meal Plan — date cell day name. */
  mealPlanDayName: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.medium,
    color: colors.mealPlanSecondary,
    lineHeight: 16,
    textTransform: 'uppercase',
  } as TextStyle,
};