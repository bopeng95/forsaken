// ---- Shared world geometry (yalms). North = up, compass angles in degrees
// clockwise from N. The whole fight plays out on one circular platform with
// Kefka's hitbox at the arena center = map (100,100): measured from FFLogs
// report mvDy6P2xHjCdZptq (P2) and confirmed for P4 in report XGYVrK3yABfdn6ha
// fight 8 (player coordinates in both phases stay within this circle, boss
// actors anchored on its center and rim).
export const R_ARENA = 20;
/** Kefka's outer hitbox / target ring — P2 clone baiters stand ON this. */
export const R_OUTER_RING = 6.0;
/** inner hitbox ring — P2 even-set cone soakers stand ON it (observed 4.9–5.0y) */
export const R_INNER_RING = 5.0;
/**
 * bots path around this radius so they don't clip through the boss (not lethal
 * to the player). Must stay below the closest strat spots (P2 stack helpers at
 * r≈3.86).
 */
export const R_DEADZONE = 3.4;
/** hitbox ring 6 + melee reach 3.5 — real max-melee stacks observed at 8.9–9.6y */
export const MAX_MELEE = 9.5;

// ---- Movement
export const MOVE_SPEED = 6.0;
/** bots "sprint" slightly so they always make position after big rotations */
export const BOT_SPEED = 6.6;
/** FFXIV Sprint is +30% movement speed */
export const SPRINT_SPEED = MOVE_SPEED * 1.3;
export const SPRINT_DURATION = 10;
/** recharge starts at the press, not when the buff ends */
export const SPRINT_COOLDOWN = 60;
/** Dash (key 1) modeled on Dancer's En Avant: a 10y burst with charges */
export const DASH_DIST = 10;
export const DASH_CHARGES = 3;
export const DASH_RECHARGE = 30;
/** rendered as a very fast slide, not a teleport */
export const DASH_DURATION = 0.25;
