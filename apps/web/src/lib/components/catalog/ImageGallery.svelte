<script lang="ts">
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { Plus, Star, Trash2 } from "lucide-svelte";

  type ManagedImage = {
    id: number;
    imageUrl: string;
    altText: string | null;
    isPrimary: boolean;
  };

  type ImageTarget =
    { kind: "property" } | { kind: "roomType"; roomTypeId: number };

  type Props = {
    images: ManagedImage[];
    target: ImageTarget;
    altDrafts: Record<number, string>;
    onUpload: () => void;
    onSave: (
      target: ImageTarget,
      image: ManagedImage,
      patch: { altText?: string; isPrimary?: boolean },
    ) => void | Promise<void>;
    onDelete: (
      target: ImageTarget,
      image: ManagedImage,
    ) => void | Promise<void>;
    onAltDraft: (imageId: number, value: string) => void;
  };

  let {
    images,
    target,
    altDrafts,
    onUpload,
    onSave,
    onDelete,
    onAltDraft,
  }: Props = $props();
</script>

<div class="mb-3 flex justify-end">
  <Button size="sm" variant="secondary" onclick={onUpload}>
    <Plus class="mr-1.5 size-4" />
    Upload image
  </Button>
</div>
{#if images.length === 0}
  <Empty
    title="No images"
    description="Upload an image to add it to this catalog."
  />
{:else}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each images as image (image.id)}
      <div class="overflow-hidden rounded-lg border border-line">
        <img
          src={`/api/v1${image.imageUrl}`}
          alt={image.altText ?? ""}
          class="h-40 w-full object-cover"
        />
        <div class="space-y-2 p-3">
          <div class="flex items-center justify-between gap-2">
            {#if image.isPrimary}
              <Badge tone="success">Primary</Badge>
            {:else}
              <Button
                size="sm"
                variant="ghost"
                onclick={() => onSave(target, image, { isPrimary: true })}
              >
                <Star class="mr-1 size-3.5" />
                Make primary
              </Button>
            {/if}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Delete image"
              onclick={() => onDelete(target, image)}
            >
              <Trash2 class="size-3.5 text-error" />
            </Button>
          </div>
          <div class="flex gap-2">
            <Input
              aria-label="Image alt text"
              value={altDrafts[image.id] ?? ""}
              oninput={(event) =>
                onAltDraft(image.id, event.currentTarget.value)}
              placeholder="Alt text"
            />
            <Button
              size="sm"
              variant="secondary"
              onclick={() =>
                onSave(target, image, {
                  altText: altDrafts[image.id] ?? "",
                })}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
