// src/core/clock.ts
export type Clock = { now(): Date };
export const systemClock: Clock = { now: () => new Date() };
