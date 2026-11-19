// src/lib/api/session.svelte.ts
// Who is signed in, and which properties they may work in.
//
// The state lives in a rune, so every component that reads it re-renders
// when it changes.
import type { UserRole } from "@neoams/shared";
import { api, ApiError } from "./client";

/** A property the person may work in, as the API describes it. */
export type PropertyAccess = {
  id: number;
  name: string;
  slug: string;
  role: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  banned?: boolean;
};

export type Session = {
  user: SessionUser;
  properties: PropertyAccess[];
  guest: { id: number; firstName: string; lastName: string } | null;
};

export type SetupStatus = {
  needsSetup: boolean;
  setupTokenRequired: boolean;
};

class SessionState {
  /** The current session, or null when nobody is signed in. */
  current = $state<Session | null>(null);
  /** True while the session is being fetched. */
  loading = $state(true);
  /** The last error, if any. */
  error = $state<string | null>(null);
  /** The read that is in flight, so nobody asks for it twice. */
  #pending: Promise<Session | null> | null = null;

  /** The signed-in person, or null. */
  get user(): SessionUser | null {
    return this.current?.user ?? null;
  }

  /** Is somebody signed in? */
  get isSignedIn(): boolean {
    return this.current !== null;
  }

  /** Does the signed-in person have to change their password first? */
  get mustChangePassword(): boolean {
    return this.current?.user.mustChangePassword ?? false;
  }

  /** Is the signed-in person a global administrator? */
  get isAdmin(): boolean {
    return this.current?.user.role === "admin";
  }

  /** The properties the signed-in person may work in. */
  get properties(): PropertyAccess[] {
    return this.current?.properties ?? [];
  }

  /**
   * Read the session from the server.
   *
   * Several parts of the interface ask for it at once when a page is
   * opened, so the read that is already in flight is shared rather than
   * repeated.
   */
  async load(): Promise<Session | null> {
    if (this.#pending) return this.#pending;
    this.loading = true;
    this.error = null;
    this.#pending = this.#read();
    try {
      return await this.#pending;
    } finally {
      this.#pending = null;
    }
  }

  /** Wait for the read that is in flight to finish. */
  async ready(): Promise<void> {
    while (this.#pending) await this.#pending;
  }

  async #read(): Promise<Session | null> {
    try {
      const me = await api.get<Session>("/me");
      this.current = me;
      return me;
    } catch (err) {
      // A signed-out person is not an error, it is the normal state.
      if (err instanceof ApiError && err.status === 401) {
        this.current = null;
        return null;
      }
      this.error =
        err instanceof Error ? err.message : "The session could not be read";
      this.current = null;
      return null;
    } finally {
      this.loading = false;
    }
  }

  /** Forget the session, without calling the server. */
  clear(): void {
    this.current = null;
    this.error = null;
  }
}

export const session = new SessionState();

/* -------------------------------------------------------------- the setup */

/** Is the system waiting for its first administrator? */
export async function setupStatus(): Promise<SetupStatus> {
  return api.get<SetupStatus>("/setup/status");
}
