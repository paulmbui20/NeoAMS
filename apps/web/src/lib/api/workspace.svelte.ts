// src/lib/api/workspace.svelte.ts
// Which property the person is working in.
//
// A staff member belongs to one or more properties; a global administrator
// belongs to none but may work in any of them. The choice is remembered
// between visits, because the desk uses one property all day.

import { api, ApiError } from "./client";
import { session } from "./session.svelte";

export type WorkspaceProperty = {
  id: number;
  name: string;
  slug: string;
  town?: string | null;
  county?: string | null;
  /** The person's role at this property. Null for a global administrator. */
  role?: string | null;
};

const STORAGE_KEY = "neoams.property";

class WorkspaceState {
  /** Every property the person may work in. */
  properties = $state<WorkspaceProperty[]>([]);
  /** The one being worked in, or null when none has been chosen. */
  currentId = $state<number | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  /** True once the list has been read, whatever it turned out to be. */
  ready = $state(false);
  /** The read that is in flight, so nobody asks for it twice. */
  #pending: Promise<void> | null = null;

  /** The chosen property, or null. */
  get current(): WorkspaceProperty | null {
    return this.properties.find((p) => p.id === this.currentId) ?? null;
  }

  /** Is a property needed to show anything? */
  get hasProperty(): boolean {
    return this.currentId !== null;
  }

  /**
   * Read the list of properties and restore the last choice.
   *
   * The list depends on who is signed in, so the session is waited for
   * first: a page that is opened while the session is still being read
   * must not conclude that there are no properties.
   */
  async load(): Promise<void> {
    if (this.#pending) return this.#pending;
    this.#pending = this.#load();
    try {
      await this.#pending;
    } finally {
      this.#pending = null;
    }
  }

  async #load(): Promise<void> {
    if (session.loading) await session.ready();
    if (!session.isSignedIn) {
      this.properties = [];
      this.currentId = null;
      this.ready = true;
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      if (session.isAdmin) {
        // The administrator may work in every property.
        const result = await api.get<{ data: WorkspaceProperty[] }>(
          "/admin/properties",
          { query: { limit: 100, offset: 0 } },
        );
        this.properties = result.data.map((p) => ({ ...p, role: null }));
      } else {
        this.properties = session.properties.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          role: p.role,
        }));
      }
      this.restore();
    } catch (err) {
      this.error =
        err instanceof ApiError
          ? err.message
          : "The properties could not be loaded.";
      this.properties = [];
      this.currentId = null;
    } finally {
      this.loading = false;
      this.ready = true;
    }
  }

  /** Choose a property. The choice is remembered. */
  select(propertyId: number | null): void {
    this.currentId = propertyId;
    if (typeof localStorage === "undefined") return;
    try {
      if (propertyId === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(propertyId));
    } catch {
      /* a private browser may refuse; the choice still works for this visit */
    }
  }

  /** Restore the last choice, if it is still one the person may use. */
  private restore(): void {
    let remembered: number | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) remembered = Number(stored);
    } catch {
      /* ignore */
    }
    if (
      remembered !== null &&
      this.properties.some((p) => p.id === remembered)
    ) {
      this.currentId = remembered;
      return;
    }
    // With a single property there is nothing to choose.
    this.currentId =
      this.properties.length === 1 ? this.properties[0]!.id : null;
  }
}

export const workspace = new WorkspaceState();
