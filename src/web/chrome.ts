/**
 * The web design's density, as class constants.
 *
 * Deliberately not tokens shared with the phone build (spec W7). Once the two
 * shells are separate there is nothing to negotiate, and a token that can hold
 * either value invites a component to try to handle both -- which is the
 * compromise this whole split exists to remove.
 *
 * Colour is not here. Colour is always a role from styles/theme.css, in both
 * designs. Only size, spacing and radius differ.
 */

/** 32px. A mouse does not need 44, and 44 is what made the old build look like a phone. */
export const CONTROL = 'h-8'
export const CONTROL_SM = 'h-7'
/** 34px. Dense enough that a screenful of orders is a screenful. */
export const ROW = 'h-[2.125rem]'

/** 6px, not a pill. The pill is the phone design's, and it stays there. */
export const RADIUS = 'rounded-md'

export const TEXT_UI = 'text-[13px]'
export const TEXT_SM = 'text-[12px]'
export const TEXT_XS = 'text-[11px]'

/** Horizontal rhythm. One value, so the bar, the table and the pane line up. */
export const GUTTER = 'px-[18px]'
