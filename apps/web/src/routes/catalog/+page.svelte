<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, ApiError } from "$lib/api/client";
  import { session } from "$lib/api/session.svelte";
  import { workspace } from "$lib/api/workspace.svelte";
  import PageHeader from "$lib/components/shell/PageHeader.svelte";
  import PropertyRequired from "$lib/components/shell/PropertyRequired.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Empty from "$lib/components/ui/Empty.svelte";
  import Field from "$lib/components/ui/Field.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import ImageGallery from "$lib/components/catalog/ImageGallery.svelte";
  import AmenityIcon from "$lib/components/catalog/AmenityIcon.svelte";
  import { toast } from "$lib/components/ui/toast.svelte";
  import {
    amenityIconNames,
    normalizeLucideIconName,
  } from "$lib/utils/lucide-icons";
  import {
    centsToShillings,
    formatMoney,
    shillingsToCents,
  } from "$lib/ui/status";
  import { Pencil, Plus, RotateCcw, Star, Trash2 } from "lucide-svelte";

  type Service = {
    id: number;
    name: string;
    description: string | null;
    priceCents: number;
    isActive: boolean;
  };

  type RoomType = {
    id: number;
    name: string;
    amenityIds: number[];
  };

  type Amenity = {
    id: number;
    name: string;
    icon: string | null;
  };

  type ManagedImage = {
    id: number;
    imageUrl: string;
    altText: string | null;
    isPrimary: boolean;
  };

  type ImageTarget =
    { kind: "property" } | { kind: "roomType"; roomTypeId: number };

  let services = $state<Service[]>([]);
  let roomTypes = $state<RoomType[]>([]);
  let amenities = $state<Amenity[]>([]);
  let selectedPropertyAmenities = $state<number[]>([]);
  let propertyImages = $state<ManagedImage[]>([]);
  let imagesByRoomType = $state<Record<number, ManagedImage[]>>({});
  let imageAltDrafts = $state<Record<number, string>>({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let activeTab = $state<"services" | "amenities" | "images">("services");
  let serviceModalOpen = $state(false);
  let editingServiceId = $state<number | null>(null);
  let serviceForm = $state({
    name: "",
    description: "",
    priceShillings: 0,
    isActive: true,
  });
  let amenityModalOpen = $state(false);
  let editingAmenityId = $state<number | null>(null);
  let amenityForm = $state({ name: "", icon: "" });
  let normalizedAmenityIcon = $derived(
    normalizeLucideIconName(amenityForm.icon),
  );
  let imageModalOpen = $state(false);
  let imageTarget = $state<ImageTarget | null>(null);
  let imageFile = $state<File | null>(null);
  let imageAltText = $state("");
  let imageIsPrimary = $state(false);

  const canManageProperty = $derived(
    session.isAdmin || workspace.current?.role === "owner",
  );

  async function load() {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    loading = true;
    error = "";
    try {
      const [serviceResult, typeResult, amenityResult, propertyImageResult] =
        await Promise.all([
          api.get<{ data: Service[] }>(`/properties/${propertyId}/services`),
          api.get<{ data: RoomType[] }>(`/properties/${propertyId}/room-types`),
          api.get<{
            data: { all: Amenity[]; selected: number[] };
          }>(`/properties/${propertyId}/amenities`),
          api.get<{ data: ManagedImage[] }>(`/properties/${propertyId}/images`),
        ]);
      services = serviceResult.data;
      roomTypes = typeResult.data;
      amenities = amenityResult.data.all;
      selectedPropertyAmenities = amenityResult.data.selected;
      propertyImages = propertyImageResult.data;

      const images = await Promise.all(
        roomTypes.map(async (type) => {
          const result = await api.get<{ data: ManagedImage[] }>(
            `/properties/${propertyId}/room-types/${type.id}/images`,
          );
          return [type.id, result.data] as const;
        }),
      );
      imagesByRoomType = Object.fromEntries(images);
      imageAltDrafts = Object.fromEntries(
        [...propertyImages, ...Object.values(imagesByRoomType).flat()].map(
          (image) => [image.id, image.altText ?? ""],
        ),
      );
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : "Catalog data could not be loaded.";
      toast.error("Could not load catalog", error);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    if (!session.loading && !session.isSignedIn) {
      await goto("/login", { replaceState: true });
      return;
    }
    await workspace.load();
  });

  $effect(() => {
    const propertyId = workspace.currentId;
    if (propertyId !== null && session.isSignedIn) void load();
  });

  function openService(service?: Service) {
    editingServiceId = service?.id ?? null;
    serviceForm = service
      ? {
          name: service.name,
          description: service.description ?? "",
          priceShillings: centsToShillings(service.priceCents),
          isActive: service.isActive,
        }
      : { name: "", description: "", priceShillings: 0, isActive: true };
    serviceModalOpen = true;
  }

  async function saveService() {
    const propertyId = workspace.currentId;
    const priceCents = shillingsToCents(serviceForm.priceShillings);
    if (
      propertyId === null ||
      !serviceForm.name.trim() ||
      !Number.isFinite(serviceForm.priceShillings) ||
      priceCents < 0 ||
      priceCents > 100_000_000
    ) {
      toast.error("Enter a service name and a valid price in shillings.");
      return;
    }
    saving = true;
    try {
      const payload = {
        name: serviceForm.name.trim(),
        description:
          serviceForm.description.trim() ||
          (editingServiceId !== null ? null : undefined),
        priceCents,
        isActive: serviceForm.isActive,
      };
      if (editingServiceId === null) {
        await api.post(`/properties/${propertyId}/services`, payload);
        toast.success("Service created");
      } else {
        await api.patch(
          `/properties/${propertyId}/services/${editingServiceId}`,
          payload,
        );
        toast.success("Service updated");
      }
      serviceModalOpen = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not save service",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      saving = false;
    }
  }

  async function archiveService(service: Service) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    try {
      if (service.isActive) {
        await api.delete(`/properties/${propertyId}/services/${service.id}`);
        toast.success("Service archived", service.name);
      } else {
        await api.patch(`/properties/${propertyId}/services/${service.id}`, {
          isActive: true,
        });
        toast.success("Service restored", service.name);
      }
      await load();
    } catch (err) {
      toast.error(
        "Could not update service",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function openAmenity(amenity?: Amenity) {
    editingAmenityId = amenity?.id ?? null;
    amenityForm = {
      name: amenity?.name ?? "",
      icon: amenity?.icon ?? "",
    };
    amenityModalOpen = true;
  }

  async function saveAmenity() {
    const name = amenityForm.name.trim();
    if (!name) {
      toast.error("Amenity name is required.");
      return;
    }
    const enteredIcon = amenityForm.icon.trim();
    const icon = enteredIcon ? normalizedAmenityIcon : null;
    if (enteredIcon && !icon) {
      toast.error("Enter a supported Lucide amenity icon name.");
      return;
    }
    saving = true;
    try {
      const payload = {
        name,
        icon: icon ?? (editingAmenityId !== null ? null : undefined),
      };
      const propertyId = workspace.currentId;
      if (propertyId === null) return;
      if (editingAmenityId === null) {
        await api.post(`/properties/${propertyId}/amenities`, payload);
        toast.success("Amenity created");
      } else {
        await api.patch(
          `/properties/${propertyId}/amenities/${editingAmenityId}`,
          payload,
        );
        toast.success("Amenity updated");
      }
      amenityModalOpen = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not save amenity",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      saving = false;
    }
  }

  async function deleteAmenity(amenity: Amenity) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    if (!window.confirm(`Delete amenity "${amenity.name}"?`)) return;
    try {
      await api.delete(`/properties/${propertyId}/amenities/${amenity.id}`);
      toast.success("Amenity deleted", amenity.name);
      await load();
    } catch (err) {
      toast.error(
        "Could not delete amenity",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  function toggleAmenity(list: number[], id: number, checked: boolean) {
    return checked
      ? [...new Set([...list, id])]
      : list.filter((item) => item !== id);
  }

  async function savePropertyAmenities() {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    saving = true;
    try {
      await api.put(`/properties/${propertyId}/amenities`, {
        amenityIds: selectedPropertyAmenities,
      });
      toast.success("Property amenities updated");
      await load();
    } catch (err) {
      toast.error(
        "Could not update property amenities",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      saving = false;
    }
  }

  async function saveRoomTypeAmenities(type: RoomType) {
    const propertyId = workspace.currentId;
    if (propertyId === null) return;
    saving = true;
    try {
      await api.put(
        `/properties/${propertyId}/room-types/${type.id}/amenities`,
        { amenityIds: type.amenityIds },
      );
      toast.success(`${type.name} amenities updated`);
      await load();
    } catch (err) {
      toast.error(
        "Could not update room type amenities",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    } finally {
      saving = false;
    }
  }

  function updateRoomTypeAmenities(
    typeId: number,
    amenityId: number,
    checked: boolean,
  ) {
    roomTypes = roomTypes.map((type) =>
      type.id === typeId
        ? {
            ...type,
            amenityIds: toggleAmenity(type.amenityIds, amenityId, checked),
          }
        : type,
    );
  }

  function openImageUpload(target: ImageTarget) {
    imageTarget = target;
    imageFile = null;
    imageAltText = "";
    imageIsPrimary = false;
    imageModalOpen = true;
  }

  function imageRecordPath(target: ImageTarget, imageId: number) {
    const propertyId = workspace.currentId;
    if (propertyId === null) throw new Error("Select a property first.");
    return target.kind === "property"
      ? `/properties/${propertyId}/images/${imageId}`
      : `/properties/${propertyId}/room-types/${target.roomTypeId}/images/${imageId}`;
  }

  async function saveImageMetadata(
    target: ImageTarget,
    image: ManagedImage,
    patch: { altText?: string; isPrimary?: boolean },
  ) {
    try {
      await api.patch(imageRecordPath(target, image.id), patch);
      toast.success(
        patch.isPrimary ? "Primary image updated" : "Image updated",
      );
      await load();
    } catch (err) {
      toast.error(
        "Could not update image",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function deleteImage(target: ImageTarget, image: ManagedImage) {
    if (!window.confirm("Delete this image?")) return;
    try {
      await api.delete(imageRecordPath(target, image.id));
      toast.success("Image deleted");
      await load();
    } catch (err) {
      toast.error(
        "Could not delete image",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  }

  async function uploadImage() {
    if (!imageFile || !imageTarget) {
      toast.error("Choose an image file to upload.");
      return;
    }
    const formData = new FormData();
    formData.append("file", imageFile);
    saving = true;
    let uploaded: { filename: string; url: string } | null = null;
    try {
      uploaded = await api.post<{ filename: string; url: string }>(
        "/uploads",
        formData,
      );
      try {
        const propertyId = workspace.currentId;
        if (propertyId === null) throw new Error("Select a property first.");
        const endpoint =
          imageTarget.kind === "property"
            ? `/properties/${propertyId}/images`
            : `/properties/${propertyId}/room-types/${imageTarget.roomTypeId}/images`;
        await api.post(endpoint, {
          imageUrl: uploaded.url,
          altText: imageAltText.trim() || undefined,
          isPrimary: imageIsPrimary,
        });
      } catch (associationError) {
        try {
          await api.delete(`/uploads/${encodeURIComponent(uploaded.filename)}`);
        } catch (cleanupError) {
          const associationMessage =
            associationError instanceof ApiError
              ? associationError.message
              : "The image could not be attached.";
          const cleanupMessage =
            cleanupError instanceof ApiError
              ? cleanupError.message
              : "The unused upload could not be removed.";
          throw new Error(`${associationMessage} ${cleanupMessage}`);
        }
        throw associationError;
      }
      toast.success("Image uploaded");
      imageModalOpen = false;
      await load();
    } catch (err) {
      toast.error(
        "Could not upload image",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      saving = false;
    }
  }
</script>

<PageHeader
  title="Catalog"
  description="Manage services, amenities, and property or room-type images."
/>

{#if !workspace.ready}
  <div class="panel p-6 text-center text-sm text-ink-muted">Loading…</div>
{:else if !workspace.currentId}
  <PropertyRequired />
{:else if loading && services.length === 0 && roomTypes.length === 0}
  <div class="panel p-6 text-center text-sm text-ink-muted">
    Loading catalog…
  </div>
{:else if error && services.length === 0 && roomTypes.length === 0}
  <div class="panel p-6 text-center text-sm text-error">{error}</div>
{:else}
  <div class="mb-5 flex flex-wrap gap-2 border-b border-line">
    {#each [{ key: "services", label: "Services" }, ...(canManageProperty ? [{ key: "amenities", label: "Amenities" }] : []), { key: "images", label: "Images" }] as tab (tab.key)}
      <button
        type="button"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors {activeTab ===
        tab.key
          ? 'border-ink-900 text-ink'
          : 'border-transparent text-ink-muted hover:text-ink'}"
        onclick={() => (activeTab = tab.key as typeof activeTab)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#if activeTab === "services"}
    <div class="mb-4 flex justify-end">
      <Button onclick={() => openService()}>
        <Plus class="mr-1.5 size-4" />
        Add service
      </Button>
    </div>
    {#if services.length === 0}
      <Card
        ><Empty
          title="No services"
          description="Add services guests can include in a booking."
        /></Card
      >
    {:else}
      <div class="grid gap-3 md:grid-cols-2">
        {#each services as service (service.id)}
          <Card>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="truncate font-medium text-ink">{service.name}</h2>
                  <Badge tone={service.isActive ? "success" : "neutral"}>
                    {service.isActive ? "Active" : "Archived"}
                  </Badge>
                </div>
                {#if service.description}
                  <p class="mt-1 text-sm text-ink-muted">
                    {service.description}
                  </p>
                {/if}
                <p class="mt-3 text-sm font-semibold text-ink">
                  {formatMoney(service.priceCents)}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${service.name}`}
                  onclick={() => openService(service)}
                >
                  <Pencil class="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${service.isActive ? "Archive" : "Restore"} ${service.name}`}
                  onclick={() => archiveService(service)}
                >
                  {#if service.isActive}<Trash2
                      class="size-3.5 text-error"
                    />{:else}<RotateCcw class="size-3.5" />{/if}
                </Button>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  {:else if activeTab === "amenities"}
    {#if canManageProperty}
      <div class="mb-5 flex justify-end">
        <Button onclick={() => openAmenity()}>
          <Plus class="mr-1.5 size-4" />
          Add amenity
        </Button>
      </div>
      <Card
        title="Property amenities"
        description="Choose the amenities available throughout this property."
      >
        {#if amenities.length === 0}
          <p class="text-sm text-ink-muted">
            Create amenities to configure this property.
          </p>
        {:else}
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each amenities as amenity (amenity.id)}
              <div
                class="flex items-center gap-2 rounded-md border border-line p-2 text-sm text-ink"
              >
                <label class="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedPropertyAmenities.includes(amenity.id)}
                    onchange={(event) => {
                      selectedPropertyAmenities = toggleAmenity(
                        selectedPropertyAmenities,
                        amenity.id,
                        event.currentTarget.checked,
                      );
                    }}
                  />
                  <AmenityIcon
                    name={amenity.icon}
                    class="size-4 shrink-0 text-ink-muted"
                  />
                  <span class="min-w-0 truncate">{amenity.name}</span>
                </label>
                <div class="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${amenity.name}`}
                    onclick={() => openAmenity(amenity)}
                    ><Pencil class="size-3" /></Button
                  >
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${amenity.name}`}
                    onclick={() => void deleteAmenity(amenity)}
                    ><Trash2 class="size-3 text-error" /></Button
                  >
                </div>
              </div>
            {/each}
          </div>
          <div class="mt-4 flex justify-end">
            <Button
              loading={saving}
              disabled={saving}
              onclick={savePropertyAmenities}>Save property amenities</Button
            >
          </div>
        {/if}
      </Card>

      <div class="mt-4 space-y-3">
        {#each roomTypes as type (type.id)}
          <Card title={`${type.name} amenities`}>
            {#if amenities.length === 0}
              <p class="text-sm text-ink-muted">Create amenities first.</p>
            {:else}
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {#each amenities as amenity (amenity.id)}
                  <label class="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={type.amenityIds.includes(amenity.id)}
                      onchange={(event) =>
                        updateRoomTypeAmenities(
                          type.id,
                          amenity.id,
                          event.currentTarget.checked,
                        )}
                    />
                    <AmenityIcon
                      name={amenity.icon}
                      class="size-4 shrink-0 text-ink-muted"
                    />
                    {amenity.name}
                  </label>
                {/each}
              </div>
              <div class="mt-4 flex justify-end">
                <Button
                  loading={saving}
                  disabled={saving}
                  onclick={() => saveRoomTypeAmenities(type)}
                  >Save amenities</Button
                >
              </div>
            {/if}
          </Card>
        {:else}
          <Card
            ><Empty
              title="No room types"
              description="Add room types from the Rooms page to configure their amenities."
            /></Card
          >
        {/each}
      </div>
    {/if}
  {:else}
    {#if canManageProperty}
      <Card
        title="Property images"
        description="These images represent the property in guest-facing views."
      >
        <ImageGallery
          images={propertyImages}
          target={{ kind: "property" }}
          altDrafts={imageAltDrafts}
          onUpload={() => openImageUpload({ kind: "property" })}
          onSave={saveImageMetadata}
          onDelete={deleteImage}
          onAltDraft={(id, value) => (imageAltDrafts[id] = value)}
        />
      </Card>
    {/if}
    <div class="mt-4 space-y-3">
      {#each roomTypes as type (type.id)}
        <Card title={`${type.name} images`}>
          <ImageGallery
            images={imagesByRoomType[type.id] ?? []}
            target={{ kind: "roomType", roomTypeId: type.id }}
            altDrafts={imageAltDrafts}
            onUpload={() =>
              openImageUpload({ kind: "roomType", roomTypeId: type.id })}
            onSave={saveImageMetadata}
            onDelete={deleteImage}
            onAltDraft={(id, value) => (imageAltDrafts[id] = value)}
          />
        </Card>
      {:else}
        <Card
          ><Empty
            title="No room types"
            description="Add room types from the Rooms page to manage their images."
          /></Card
        >
      {/each}
    </div>
  {/if}
{/if}

<Modal
  title={editingServiceId === null ? "Add service" : "Edit service"}
  open={serviceModalOpen}
  onclose={() => (serviceModalOpen = false)}
  width="max-w-md"
>
  <div class="space-y-3">
    <Field label="Name" required>
      {#snippet children({ id, describedBy })}
        <Input {id} {describedBy} bind:value={serviceForm.name} />
      {/snippet}
    </Field>
    <Field label="Description">
      {#snippet children({ id, describedBy })}
        <Input {id} {describedBy} bind:value={serviceForm.description} />
      {/snippet}
    </Field>
    <Field label="Price (KES)" required>
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          type="number"
          min="0"
          step="0.01"
          bind:value={serviceForm.priceShillings}
        />
      {/snippet}
    </Field>
    <label class="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" bind:checked={serviceForm.isActive} />
      Available for new bookings
    </label>
  </div>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (serviceModalOpen = false)}
        disabled={saving}>Cancel</Button
      >
      <Button onclick={saveService} loading={saving} disabled={saving}>
        {editingServiceId === null ? "Create service" : "Save changes"}
      </Button>
    </div>
  {/snippet}
</Modal>

<Modal
  title={editingAmenityId === null ? "Add amenity" : "Edit amenity"}
  open={amenityModalOpen}
  onclose={() => (amenityModalOpen = false)}
  width="max-w-md"
>
  <div class="space-y-3">
    <Field label="Name" required>
      {#snippet children({ id, describedBy })}
        <Input {id} {describedBy} bind:value={amenityForm.name} />
      {/snippet}
    </Field>
    <Field label="Icon name (optional)">
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={amenityForm.icon}
          placeholder="e.g. Wifi or wifi-off"
        />
      {/snippet}
    </Field>
    <p class="text-xs text-ink-muted">
      Available: {amenityIconNames.join(", ")}
    </p>
    <div class="flex min-h-9 items-center gap-2 text-sm">
      {#if normalizedAmenityIcon}
        <AmenityIcon
          name={normalizedAmenityIcon}
          class="size-4 text-ink-muted"
        />
        <span class="text-ink-muted">{normalizedAmenityIcon} preview</span>
      {:else if amenityForm.icon.trim()}
        <span class="text-error">
          This Lucide icon isn't supported for amenities.
        </span>
      {:else}
        <span class="text-ink-muted">Leave blank to use no icon.</span>
      {/if}
    </div>
  </div>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (amenityModalOpen = false)}
        disabled={saving}>Cancel</Button
      >
      <Button onclick={saveAmenity} loading={saving} disabled={saving}>
        {editingAmenityId === null ? "Create amenity" : "Save changes"}
      </Button>
    </div>
  {/snippet}
</Modal>

<Modal
  title="Upload image"
  open={imageModalOpen}
  onclose={() => (imageModalOpen = false)}
  width="max-w-md"
>
  <div class="space-y-3">
    <Field label="Image file" required>
      {#snippet children({ id, describedBy })}
        <input
          {id}
          aria-describedby={describedBy}
          class="input w-full"
          type="file"
          accept="image/*"
          required
          onchange={(event) =>
            (imageFile = event.currentTarget.files?.[0] ?? null)}
        />
      {/snippet}
    </Field>
    <Field label="Alt text">
      {#snippet children({ id, describedBy })}
        <Input
          {id}
          {describedBy}
          bind:value={imageAltText}
          placeholder="Describe the image for guests"
        />
      {/snippet}
    </Field>
    <label class="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" bind:checked={imageIsPrimary} />
      Set as primary image
    </label>
  </div>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button
        variant="secondary"
        onclick={() => (imageModalOpen = false)}
        disabled={saving}>Cancel</Button
      >
      <Button
        onclick={uploadImage}
        loading={saving}
        disabled={saving || !imageFile}>Upload</Button
      >
    </div>
  {/snippet}
</Modal>
