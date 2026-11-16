// src/db/seed.ts
import { eq } from "drizzle-orm";
import { createAuth } from "../auth";
import { createDb } from "./index";
import { env } from "../env";
import {
  properties,
  propertyStaff,
  roomTypes,
  rooms,
  paymentOptions,
} from "./schema";
import { user, account } from "./schema/auth";

export async function seed(db = createDb(env.DB_FILE_NAME)) {
  const auth = createAuth(db, env);
  const authCtx = await auth.$context;

  // 1. Admin user & Manager/Staff user
  const adminEmail = "admin@neoams.com";
  let admin = db.select().from(user).where(eq(user.email, adminEmail)).get();

  if (!admin) {
    const adminId = "admin_seed_01";
    const hashedPassword = await authCtx.password.hash("Admin1234#");

    db.insert(user)
      .values({
        id: adminId,
        name: "NeoAMS Admin",
        email: adminEmail,
        emailVerified: true,
        role: "admin",
      })
      .run();

    db.insert(account)
      .values({
        id: "acc_admin_seed_01",
        accountId: adminEmail,
        providerId: "credential",
        userId: adminId,
        password: hashedPassword,
      })
      .run();

    admin = db.select().from(user).where(eq(user.email, adminEmail)).get()!;
  }

  const managerEmail = "manager@safarihaven.co.ke";
  let manager = db
    .select()
    .from(user)
    .where(eq(user.email, managerEmail))
    .get();

  if (!manager) {
    const managerId = "mgr_seed_01";
    const hashedPassword = await authCtx.password.hash("Manager1234#");

    db.insert(user)
      .values({
        id: managerId,
        name: "Jane Mwangi",
        email: managerEmail,
        emailVerified: true,
        role: "user",
      })
      .run();

    db.insert(account)
      .values({
        id: "acc_mgr_seed_01",
        accountId: managerEmail,
        providerId: "credential",
        userId: managerId,
        password: hashedPassword,
      })
      .run();

    manager = db.select().from(user).where(eq(user.email, managerEmail)).get()!;
  }

  // 2. Property
  const propertySlug = "safari-haven-residence";
  let property = db
    .select()
    .from(properties)
    .where(eq(properties.slug, propertySlug))
    .get();

  if (!property) {
    property = db
      .insert(properties)
      .values({
        name: "Safari Haven Residence",
        slug: propertySlug,
        description:
          "Serene bed & breakfast nestled in leafy Karen, offering tranquil garden views and curated hospitality.",
        country: "kenya",
        county: "Nairobi",
        town: "Karen",
        address: "123 Dagoretti Road, Karen",
        phone: "+254712345678",
        email: "reservations@safarihaven.co.ke",
        latitude: -1.3194,
        longitude: 36.7065,
        isActive: true,
        checkInTime: "14:00",
        checkOutTime: "10:00",
        depositPercent: 30,
      })
      .returning()
      .get();
  }

  // 3. Property Staff assignments
  const existingAdminStaff = db
    .select()
    .from(propertyStaff)
    .where(eq(propertyStaff.userId, admin.id))
    .get();
  if (!existingAdminStaff) {
    db.insert(propertyStaff)
      .values({
        propertyId: property.id,
        userId: admin.id,
        role: "owner",
      })
      .run();
  }

  const existingManagerStaff = db
    .select()
    .from(propertyStaff)
    .where(eq(propertyStaff.userId, manager.id))
    .get();
  if (!existingManagerStaff) {
    db.insert(propertyStaff)
      .values({
        propertyId: property.id,
        userId: manager.id,
        role: "manager",
      })
      .run();
  }

  // 4. Room Types
  const deluxeSlug = "deluxe-king-suite";
  let deluxeType = db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.slug, deluxeSlug))
    .get();

  if (!deluxeType) {
    deluxeType = db
      .insert(roomTypes)
      .values({
        propertyId: property.id,
        name: "Deluxe King Suite",
        slug: deluxeSlug,
        description:
          "Spacious master suite featuring a plush king-size bed and garden patio.",
        pricePerNightCents: 850000, // 8,500 KES
        pricePerHourCents: 150000, // 1,500 KES
        maxOccupancy: 2,
        bedConfiguration: "1 King Bed",
        isActive: true,
      })
      .returning()
      .get();
  }

  const standardSlug = "standard-queen-room";
  let standardType = db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.slug, standardSlug))
    .get();

  if (!standardType) {
    standardType = db
      .insert(roomTypes)
      .values({
        propertyId: property.id,
        name: "Standard Queen Room",
        slug: standardSlug,
        description:
          "Cozy queen room with dedicated workspace and en-suite rainfall shower.",
        pricePerNightCents: 550000, // 5,500 KES
        pricePerHourCents: 100000, // 1,000 KES
        maxOccupancy: 2,
        bedConfiguration: "1 Queen Bed",
        isActive: true,
      })
      .returning()
      .get();
  }

  // 5. Rooms
  const seedRooms = [
    {
      roomNumber: "101",
      floor: "Ground Floor",
      roomTypeId: deluxeType.id,
      description: "Corner deluxe suite with private terrace",
    },
    {
      roomNumber: "102",
      floor: "Ground Floor",
      roomTypeId: deluxeType.id,
      description: "Deluxe suite facing central fountain",
    },
    {
      roomNumber: "201",
      floor: "First Floor",
      roomTypeId: standardType.id,
      description: "Standard queen room with balcony",
    },
    {
      roomNumber: "202",
      floor: "First Floor",
      roomTypeId: standardType.id,
      description: "Standard queen room with garden view",
    },
  ];

  for (const r of seedRooms) {
    const exists = db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.roomNumber, r.roomNumber))
      .get();
    if (!exists) {
      db.insert(rooms)
        .values({
          propertyId: property.id,
          roomTypeId: r.roomTypeId,
          roomNumber: r.roomNumber,
          floor: r.floor,
          description: r.description,
          status: "available",
          isActive: true,
        })
        .run();
    }
  }

  // 6. Payment Options
  const existingPaymentOption = db
    .select({ id: paymentOptions.id })
    .from(paymentOptions)
    .where(eq(paymentOptions.propertyId, property.id))
    .get();

  if (!existingPaymentOption) {
    db.insert(paymentOptions)
      .values({
        propertyId: property.id,
        kind: "mpesa_till",
        label: "Safari Haven Buy Goods Till",
        accountNumber: "5428901",
        accountName: "Safari Haven Residence",
        instructions:
          "Go to M-PESA > Lipa na M-PESA > Buy Goods and Services. Enter Till Number 5428901 and use your booking reference code.",
        sortOrder: 1,
        isActive: true,
      })
      .run();

    db.insert(paymentOptions)
      .values({
        propertyId: property.id,
        kind: "mpesa_paybill",
        label: "Safari Haven Paybill",
        accountNumber: "247247",
        accountName: "Safari Haven Acc",
        instructions:
          "Go to M-PESA > Lipa na M-PESA > Paybill 247247. Enter Account number matching your booking reference code.",
        sortOrder: 2,
        isActive: true,
      })
      .run();
  }

  return {
    admin,
    manager,
    property,
    roomTypes: [deluxeType, standardType],
  };
}

// Execute if run directly from CLI: `bun src/db/seed.ts`
if (import.meta.main) {
  console.log("Seeding NeoAMS database...");
  await seed();
  console.log("Seeding complete!");
}
