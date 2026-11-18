// src/core/actor.ts
export type Actor = { userId: string | null; ip?: string }; // null = anonymous guest or system job
export const SYSTEM: Actor = { userId: null };
