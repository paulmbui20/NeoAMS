// src/lib/utils/draft.ts
// Lightweight form draft persistence.
// Saves intermediate form state to localStorage so progress survives
// an unexpected browser close or lost internet connection.

export function createDraft<T extends object>(key: string) {
  const storageKey = `neoams-draft-${key}`;

  function save(data: T): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Silently fail — storage quota exceeded or private mode.
    }
  }

  function load(): T | null {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  function clear(): void {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }

  function hasDraft(): boolean {
    try {
      return localStorage.getItem(storageKey) !== null;
    } catch {
      return false;
    }
  }

  return { save, load, clear, hasDraft };
}
