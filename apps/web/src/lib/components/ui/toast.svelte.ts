// src/lib/components/ui/toast.svelte.ts
// The notices that appear in the corner. The state is a rune, so any
// component can raise one.
export type ToastTone = "success" | "error" | "warning" | "info";

export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

class ToastState {
  items = $state<Toast[]>([]);
  #next = 1;

  /** Raise a notice. It disappears on its own after a while. */
  show(tone: ToastTone, title: string, description?: string): number {
    const id = this.#next++;
    this.items = [...this.items, { id, tone, title, description }];
    // Errors stay until they are dismissed; the rest go away.
    if (tone !== "error") {
      setTimeout(() => this.dismiss(id), 4500);
    }
    return id;
  }

  success = (title: string, description?: string) =>
    this.show("success", title, description);
  error = (title: string, description?: string) =>
    this.show("error", title, description);
  warning = (title: string, description?: string) =>
    this.show("warning", title, description);
  info = (title: string, description?: string) =>
    this.show("info", title, description);

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toast = new ToastState();
