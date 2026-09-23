// SPDX-License-Identifier: GPL-3.0-or-later
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const smooth = (x) => { const s = clamp(x, 0, 1); return s * s * (3 - 2 * s); };
export const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
