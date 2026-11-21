// src/services/catalog.ts
// Inventory: room types, rooms, amenities and bookable services.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../core/errors";
import type { Db } from "../db";
import {
  amenities,
  bookings,
  propertyAmenities,
  propertyImages,
  roomTypeAmenities,
  roomTypeImages,
  roomTypes,
  rooms,
  services,
} from "../db/schema";
import type { RoomStatus } from "@neoams/shared";

export const createCatalogService = ({ db }: { db: Db }) => {
  const slugify = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);

  const uniqueSlug = (
    propertyId: number,
    base: string,
    taken: (slug: string) => boolean,
  ) => {
    let candidate = base;
    let n = 1;
    while (taken(candidate)) {
      candidate = `${base}-${n++}`;
    }
    return candidate;
  };

  /* ----------------------------------------------------------- room types */

  const listRoomTypes = (propertyId: number) =>
    db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.propertyId, propertyId))
      .orderBy(roomTypes.name)
      .all();

  const getRoomType = (propertyId: number, id: number) => {
    const row = db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.id, id), eq(roomTypes.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Room type");
    return row;
  };

  const createRoomType = (
    propertyId: number,
    input: {
      name: string;
      slug?: string;
      description?: string;
      pricePerNightCents: number;
      pricePerHourCents?: number;
      maxOccupancy?: number;
      bedConfiguration?: string;
      isActive?: boolean;
    },
  ) =>
    db
      .insert(roomTypes)
      .values({
        propertyId,
        name: input.name,
        slug: uniqueSlug(
          propertyId,
          input.slug ?? slugify(input.name),
          (slug) =>
            db
              .select()
              .from(roomTypes)
              .where(
                and(
                  eq(roomTypes.propertyId, propertyId),
                  eq(roomTypes.slug, slug),
                ),
              )
              .get() !== undefined,
        ),
        description: input.description ?? null,
        pricePerNightCents: input.pricePerNightCents,
        pricePerHourCents: input.pricePerHourCents ?? null,
        maxOccupancy: input.maxOccupancy ?? 2,
        bedConfiguration: input.bedConfiguration ?? null,
        isActive: input.isActive ?? true,
      })
      .returning()
      .get();

  const updateRoomType = (
    propertyId: number,
    id: number,
    patch: Partial<Record<string, unknown>>,
  ) => {
    getRoomType(propertyId, id);
    db.update(roomTypes).set(patch).where(eq(roomTypes.id, id)).run();
    return getRoomType(propertyId, id);
  };

  const deleteRoomType = (propertyId: number, id: number) => {
    const roomType = getRoomType(propertyId, id);
    const roomCount = db
      .select({ count: sql<number>`count(*)` })
      .from(rooms)
      .where(eq(rooms.roomTypeId, id))
      .get()!.count;
    if (roomCount > 0) {
      throw new ConflictError(
        "ROOM_TYPE_IN_USE",
        "Move or remove this room type's rooms before deleting it",
      );
    }
    const imageUrls = db
      .select({ imageUrl: roomTypeImages.imageUrl })
      .from(roomTypeImages)
      .where(eq(roomTypeImages.roomTypeId, id))
      .all()
      .map((image) => image.imageUrl);
    db.delete(roomTypes).where(eq(roomTypes.id, id)).run();
    return { deleted: true, roomType, imageUrls };
  };

  /** Replace the amenity set of a room type with exactly the ids given. */
  const setRoomTypeAmenities = (
    propertyId: number,
    id: number,
    amenityIds: number[],
  ) => {
    getRoomType(propertyId, id);
    return db.transaction((tx) => {
      tx.delete(roomTypeAmenities)
        .where(eq(roomTypeAmenities.roomTypeId, id))
        .run();
      if (amenityIds.length) {
        tx.insert(roomTypeAmenities)
          .values(
            amenityIds.map((amenityId) => ({ roomTypeId: id, amenityId })),
          )
          .run();
      }
      return tx
        .select()
        .from(roomTypeAmenities)
        .where(eq(roomTypeAmenities.roomTypeId, id))
        .all();
    });
  };

  const roomTypeAmenityIds = (roomTypeId: number) =>
    db
      .select({ amenityId: roomTypeAmenities.amenityId })
      .from(roomTypeAmenities)
      .where(eq(roomTypeAmenities.roomTypeId, roomTypeId))
      .all()
      .map((r) => r.amenityId);

  /* ---------------------------------------------------------------- rooms */

  const listRooms = (
    propertyId: number,
    filter: { floor?: string; status?: RoomStatus; roomTypeId?: number },
  ) => {
    const filters = [eq(rooms.propertyId, propertyId)];
    if (filter.floor) filters.push(eq(rooms.floor, filter.floor));
    if (filter.status) filters.push(eq(rooms.status, filter.status));
    if (filter.roomTypeId)
      filters.push(eq(rooms.roomTypeId, filter.roomTypeId));
    return db
      .select()
      .from(rooms)
      .where(and(...filters))
      .orderBy(rooms.roomNumber)
      .all();
  };

  const getRoom = (propertyId: number, id: number) => {
    const row = db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Room");
    return row;
  };

  const createRoom = (
    propertyId: number,
    input: {
      roomTypeId: number;
      roomNumber: string;
      floor?: string;
      description?: string;
      status?: RoomStatus;
      isActive?: boolean;
    },
  ) => {
    // The room type must belong to this property.
    getRoomType(propertyId, input.roomTypeId);
    const clash = db
      .select()
      .from(rooms)
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          eq(rooms.roomNumber, input.roomNumber),
        ),
      )
      .get();
    if (clash) {
      throw new ConflictError(
        "ROOM_NUMBER_IN_USE",
        "That room number already exists at this property",
      );
    }
    return db
      .insert(rooms)
      .values({
        propertyId,
        roomTypeId: input.roomTypeId,
        roomNumber: input.roomNumber,
        floor: input.floor ?? null,
        description: input.description ?? null,
        status: input.status ?? "available",
        isActive: input.isActive ?? true,
      })
      .returning()
      .get();
  };

  const updateRoom = (
    propertyId: number,
    id: number,
    patch: Partial<Record<string, unknown>>,
  ) => {
    getRoom(propertyId, id);
    if (patch.roomTypeId !== undefined) {
      getRoomType(propertyId, patch.roomTypeId as number);
    }
    db.update(rooms).set(patch).where(eq(rooms.id, id)).run();
    return getRoom(propertyId, id);
  };

  const deleteRoom = (propertyId: number, id: number) => {
    const room = getRoom(propertyId, id);
    const bookingCount = db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(eq(bookings.roomId, id))
      .get()!.count;
    if (bookingCount > 0) {
      throw new ConflictError(
        "ROOM_HAS_BOOKINGS",
        "This room has booking history and cannot be deleted",
      );
    }
    db.delete(rooms).where(eq(rooms.id, id)).run();
    return { deleted: true, room };
  };

  const setRoomStatus = (
    propertyId: number,
    id: number,
    status: RoomStatus,
  ) => {
    getRoom(propertyId, id);
    db.update(rooms)
      .set({ status, updatedAt: new Date() })
      .where(eq(rooms.id, id))
      .run();
    return getRoom(propertyId, id);
  };

  /* ------------------------------------------------------------ amenities */

  const listAmenities = () =>
    db.select().from(amenities).orderBy(amenities.name).all();

  const createAmenity = (input: { name: string; icon?: string }) => {
    const existing = db
      .select()
      .from(amenities)
      .where(eq(amenities.name, input.name))
      .get();
    if (existing) {
      throw new ConflictError("AMENITY_EXISTS", "That amenity already exists");
    }
    return db.insert(amenities).values(input).returning().get();
  };

  const getAmenity = (id: number) => {
    const row = db.select().from(amenities).where(eq(amenities.id, id)).get();
    if (!row) throw new NotFoundError("Amenity");
    return row;
  };

  const updateAmenity = (
    id: number,
    patch: { name?: string; icon?: string | null },
  ) => {
    if (Object.keys(patch).length === 0)
      throw new ConflictError("EMPTY_UPDATE", "Nothing to update");
    getAmenity(id);
    if (patch.name) {
      const duplicate = db
        .select({ id: amenities.id })
        .from(amenities)
        .where(
          and(eq(amenities.name, patch.name), sql`${amenities.id} <> ${id}`),
        )
        .get();
      if (duplicate) {
        throw new ConflictError(
          "AMENITY_EXISTS",
          "That amenity already exists",
        );
      }
    }
    db.update(amenities).set(patch).where(eq(amenities.id, id)).run();
    return getAmenity(id);
  };

  const deleteAmenity = (id: number) => {
    const amenity = getAmenity(id);
    const propertyUseCount = db
      .select({ count: sql<number>`count(*)` })
      .from(propertyAmenities)
      .where(eq(propertyAmenities.amenityId, id))
      .get()!.count;
    const roomTypeUseCount = db
      .select({ count: sql<number>`count(*)` })
      .from(roomTypeAmenities)
      .where(eq(roomTypeAmenities.amenityId, id))
      .get()!.count;
    if (propertyUseCount + roomTypeUseCount > 0) {
      throw new ConflictError(
        "AMENITY_IN_USE",
        "Remove this amenity from properties and room types before deleting it",
      );
    }
    db.delete(amenities).where(eq(amenities.id, id)).run();
    return { deleted: true, amenity };
  };

  const propertyAmenityIds = (propertyId: number) =>
    db
      .select({ amenityId: propertyAmenities.amenityId })
      .from(propertyAmenities)
      .where(eq(propertyAmenities.propertyId, propertyId))
      .all()
      .map((r) => r.amenityId);

  const setPropertyAmenities = (propertyId: number, amenityIds: number[]) =>
    db.transaction((tx) => {
      tx.delete(propertyAmenities)
        .where(eq(propertyAmenities.propertyId, propertyId))
        .run();
      if (amenityIds.length) {
        tx.insert(propertyAmenities)
          .values(amenityIds.map((amenityId) => ({ propertyId, amenityId })))
          .run();
      }
      return amenityIds;
    });

  /* -------------------------------------------------------------- services */

  const listServices = (propertyId: number) =>
    db
      .select()
      .from(services)
      .where(eq(services.propertyId, propertyId))
      .orderBy(services.name)
      .all();

  const getService = (propertyId: number, id: number) => {
    const row = db
      .select()
      .from(services)
      .where(and(eq(services.id, id), eq(services.propertyId, propertyId)))
      .get();
    if (!row) throw new NotFoundError("Service");
    return row;
  };

  const createService = (
    propertyId: number,
    input: {
      name: string;
      slug?: string;
      description?: string;
      priceCents: number;
      isActive?: boolean;
    },
  ) =>
    db
      .insert(services)
      .values({
        propertyId,
        name: input.name,
        slug: uniqueSlug(
          propertyId,
          input.slug ?? slugify(input.name),
          (slug) =>
            db
              .select()
              .from(services)
              .where(
                and(
                  eq(services.propertyId, propertyId),
                  eq(services.slug, slug),
                ),
              )
              .get() !== undefined,
        ),
        description: input.description ?? null,
        priceCents: input.priceCents,
        isActive: input.isActive ?? true,
      })
      .returning()
      .get();

  /** Services are retired, never deleted: past bills must survive. */
  const updateService = (
    propertyId: number,
    id: number,
    patch: Partial<Record<string, unknown>>,
  ) => {
    getService(propertyId, id);
    db.update(services).set(patch).where(eq(services.id, id)).run();
    return getService(propertyId, id);
  };

  const archiveService = (propertyId: number, id: number) =>
    updateService(propertyId, id, { isActive: false });

  /* --------------------------------------------------------------- images */

  const listPropertyImages = (propertyId: number) =>
    db
      .select()
      .from(propertyImages)
      .where(eq(propertyImages.propertyId, propertyId))
      .orderBy(desc(propertyImages.isPrimary), propertyImages.id)
      .all();

  /** Only one image may be primary, so setting a new one clears the old. */
  const addPropertyImage = (
    propertyId: number,
    input: { imageUrl: string; altText?: string; isPrimary?: boolean },
  ) =>
    db.transaction((tx) => {
      if (input.isPrimary) {
        tx.update(propertyImages)
          .set({ isPrimary: false })
          .where(eq(propertyImages.propertyId, propertyId))
          .run();
      }
      return tx
        .insert(propertyImages)
        .values({
          propertyId,
          imageUrl: input.imageUrl,
          altText: input.altText ?? null,
          isPrimary: input.isPrimary ?? false,
        })
        .returning()
        .get();
    });

  const updatePropertyImage = (
    propertyId: number,
    id: number,
    patch: { altText?: string | null; isPrimary?: boolean },
  ) => {
    const row = db
      .select()
      .from(propertyImages)
      .where(
        and(
          eq(propertyImages.id, id),
          eq(propertyImages.propertyId, propertyId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Image");
    return db.transaction((tx) => {
      if (patch.isPrimary) {
        tx.update(propertyImages)
          .set({ isPrimary: false })
          .where(eq(propertyImages.propertyId, propertyId))
          .run();
      }
      tx.update(propertyImages)
        .set(patch)
        .where(eq(propertyImages.id, id))
        .run();
      return tx
        .select()
        .from(propertyImages)
        .where(eq(propertyImages.id, id))
        .get()!;
    });
  };

  const deletePropertyImage = (propertyId: number, id: number) => {
    const row = db
      .select()
      .from(propertyImages)
      .where(
        and(
          eq(propertyImages.id, id),
          eq(propertyImages.propertyId, propertyId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Image");
    db.delete(propertyImages).where(eq(propertyImages.id, id)).run();
    return { deleted: true, imageUrl: row.imageUrl };
  };

  const listRoomTypeImages = (roomTypeId: number) =>
    db
      .select()
      .from(roomTypeImages)
      .where(eq(roomTypeImages.roomTypeId, roomTypeId))
      .orderBy(desc(roomTypeImages.isPrimary), roomTypeImages.id)
      .all();

  const addRoomTypeImage = (
    roomTypeId: number,
    input: { imageUrl: string; altText?: string; isPrimary?: boolean },
  ) =>
    db.transaction((tx) => {
      if (input.isPrimary) {
        tx.update(roomTypeImages)
          .set({ isPrimary: false })
          .where(eq(roomTypeImages.roomTypeId, roomTypeId))
          .run();
      }
      return tx
        .insert(roomTypeImages)
        .values({
          roomTypeId,
          imageUrl: input.imageUrl,
          altText: input.altText ?? null,
          isPrimary: input.isPrimary ?? false,
        })
        .returning()
        .get();
    });

  const updateRoomTypeImage = (
    roomTypeId: number,
    id: number,
    patch: { altText?: string | null; isPrimary?: boolean },
  ) => {
    const row = db
      .select()
      .from(roomTypeImages)
      .where(
        and(
          eq(roomTypeImages.id, id),
          eq(roomTypeImages.roomTypeId, roomTypeId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Image");
    return db.transaction((tx) => {
      if (patch.isPrimary) {
        tx.update(roomTypeImages)
          .set({ isPrimary: false })
          .where(eq(roomTypeImages.roomTypeId, roomTypeId))
          .run();
      }
      tx.update(roomTypeImages)
        .set(patch)
        .where(eq(roomTypeImages.id, id))
        .run();
      return tx
        .select()
        .from(roomTypeImages)
        .where(eq(roomTypeImages.id, id))
        .get()!;
    });
  };

  const deleteRoomTypeImage = (roomTypeId: number, id: number) => {
    const row = db
      .select()
      .from(roomTypeImages)
      .where(
        and(
          eq(roomTypeImages.id, id),
          eq(roomTypeImages.roomTypeId, roomTypeId),
        ),
      )
      .get();
    if (!row) throw new NotFoundError("Image");
    db.delete(roomTypeImages).where(eq(roomTypeImages.id, id)).run();
    return { deleted: true, imageUrl: row.imageUrl };
  };

  const isImageReferenced = (imageUrl: string) =>
    Boolean(
      db
        .select({ id: propertyImages.id })
        .from(propertyImages)
        .where(eq(propertyImages.imageUrl, imageUrl))
        .get() ??
      db
        .select({ id: roomTypeImages.id })
        .from(roomTypeImages)
        .where(eq(roomTypeImages.imageUrl, imageUrl))
        .get(),
    );

  return {
    listRoomTypes,
    getRoomType,
    createRoomType,
    updateRoomType,
    deleteRoomType,
    setRoomTypeAmenities,
    roomTypeAmenityIds,
    listRooms,
    getRoom,
    createRoom,
    updateRoom,
    deleteRoom,
    setRoomStatus,
    listAmenities,
    createAmenity,
    getAmenity,
    updateAmenity,
    deleteAmenity,
    propertyAmenityIds,
    setPropertyAmenities,
    listServices,
    getService,
    createService,
    updateService,
    archiveService,
    listPropertyImages,
    addPropertyImage,
    updatePropertyImage,
    deletePropertyImage,
    listRoomTypeImages,
    addRoomTypeImage,
    updateRoomTypeImage,
    deleteRoomTypeImage,
    isImageReferenced,
  };
};

export type CatalogService = ReturnType<typeof createCatalogService>;
