CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `additional_guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`booking_id` integer NOT NULL,
	`guest_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_additional_guests_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_additional_guests_guest_id_guests_id_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `amenities` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`icon` text
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`old_values` text,
	`new_values` text,
	`ip_address` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_audit_logs_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`guest_id` integer NOT NULL,
	`room_id` integer NOT NULL,
	`booking_reference_code` text NOT NULL UNIQUE,
	`status` text DEFAULT 'pending' NOT NULL,
	`adults` integer DEFAULT 1 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`total_cost_cents` integer NOT NULL,
	`deposit_required_cents` integer DEFAULT 0 NOT NULL,
	`special_requests` text,
	`check_in_date` integer NOT NULL,
	`check_out_date` integer NOT NULL,
	`rate_type` text DEFAULT 'nightly' NOT NULL,
	`hold_expires_at` integer,
	`source` text DEFAULT 'walk_in' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_bookings_guest_id_guests_id_fk` FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_bookings_room_id_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_bookings_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "bookings_dates_chk" CHECK("check_out_date" > "check_in_date"),
	CONSTRAINT "bookings_people_chk" CHECK("adults" >= 1 AND "children" >= 0),
	CONSTRAINT "bookings_money_chk" CHECK("total_cost_cents" >= 0 AND "deposit_required_cents" >= 0 AND "deposit_required_cents" <= "total_cost_cents")
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment_method` text,
	`reference` text,
	`expense_date` text NOT NULL,
	`notes` text,
	`recorded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_expenses_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_expenses_category_id_expense_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_expenses_recorded_by_user_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "expenses_amount_chk" CHECK("amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` text,
	`first_name` text NOT NULL,
	`middle_name` text,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text NOT NULL,
	`country` text,
	`nationality` text,
	`id_type` text,
	`id_number` text,
	`date_of_birth` text,
	`gender` text,
	`address` text,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_guests_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "guests_id_pair_chk" CHECK(("id_type" IS NULL) = ("id_number" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `payment_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`account_number` text,
	`account_name` text,
	`instructions` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_payment_options_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`booking_id` integer NOT NULL,
	`type` text DEFAULT 'payment' NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`transaction_reference_code` text,
	`proof_message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`refund_of_payment_id` integer,
	`reason` text,
	`payment_date` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`recorded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_payments_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_payments_refund_of_payment_id_payments_id_fk` FOREIGN KEY (`refund_of_payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_payments_recorded_by_user_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "payments_amount_chk" CHECK("amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`description` text,
	`country` text DEFAULT 'kenya' NOT NULL,
	`county` text NOT NULL,
	`town` text NOT NULL,
	`address` text,
	`phone` text,
	`email` text,
	`latitude` real,
	`longitude` real,
	`is_active` integer DEFAULT true NOT NULL,
	`check_in_time` text NOT NULL,
	`check_out_time` text NOT NULL,
	`deposit_percent` integer DEFAULT 30 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "properties_deposit_chk" CHECK("deposit_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE `property_amenities` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`amenity_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_property_amenities_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_property_amenities_amenity_id_amenities_id_fk` FOREIGN KEY (`amenity_id`) REFERENCES `amenities`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `property_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`image_url` text NOT NULL,
	`alt_text` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_property_images_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `property_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_property_staff_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_property_staff_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`booking_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`host_response` text,
	`is_published` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_reviews_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE,
	CONSTRAINT "reviews_rating_chk" CHECK("rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `room_type_amenities` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`room_type_id` integer NOT NULL,
	`amenity_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_room_type_amenities_room_type_id_room_types_id_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_room_type_amenities_amenity_id_amenities_id_fk` FOREIGN KEY (`amenity_id`) REFERENCES `amenities`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `room_type_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`room_type_id` integer NOT NULL,
	`image_url` text NOT NULL,
	`alt_text` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_room_type_images_room_type_id_room_types_id_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`price_per_night_cents` integer NOT NULL,
	`price_per_hour_cents` integer,
	`max_occupancy` integer DEFAULT 2 NOT NULL,
	`bed_configuration` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_room_types_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
	CONSTRAINT "room_types_night_price_chk" CHECK("price_per_night_cents" >= 0),
	CONSTRAINT "room_types_hour_price_chk" CHECK("price_per_hour_cents" IS NULL OR "price_per_hour_cents" >= 0),
	CONSTRAINT "room_types_occupancy_chk" CHECK("max_occupancy" >= 1)
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`room_type_id` integer NOT NULL,
	`room_number` text NOT NULL,
	`floor` text,
	`description` text,
	`status` text DEFAULT 'available' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_rooms_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_rooms_room_type_id_room_types_id_fk` FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `service_bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`booking_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_service_bookings_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_service_bookings_service_id_services_id_fk` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "service_bookings_qty_chk" CHECK("quantity" > 0),
	CONSTRAINT "service_bookings_subtotal_chk" CHECK("subtotal_cents" = "quantity" * "unit_price_cents")
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`property_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`price_cents` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_services_property_id_properties_id_fk` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
	CONSTRAINT "services_price_chk" CHECK("price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `additional_guests_booking_guest_uq` ON `additional_guests` (`booking_id`,`guest_id`);--> statement-breakpoint
CREATE INDEX `additional_guests_guest_idx` ON `additional_guests` (`guest_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `bookings_guest_idx` ON `bookings` (`guest_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_dates_idx` ON `bookings` (`room_id`,`check_in_date`,`check_out_date`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE INDEX `bookings_created_by_idx` ON `bookings` (`created_by`);--> statement-breakpoint
CREATE INDEX `expenses_property_date_idx` ON `expenses` (`property_id`,`expense_date`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guests_user_uq` ON `guests` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `guests_id_uq` ON `guests` (`id_type`,`id_number`);--> statement-breakpoint
CREATE INDEX `guests_phone_idx` ON `guests` (`phone`);--> statement-breakpoint
CREATE INDEX `guests_email_idx` ON `guests` (`email`);--> statement-breakpoint
CREATE INDEX `payment_options_property_idx` ON `payment_options` (`property_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `payments_booking_idx` ON `payments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `payments_recorded_by_idx` ON `payments` (`recorded_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_txn_ref_uq` ON `payments` (`transaction_reference_code`) WHERE "payments"."status" <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX `property_amenities_property_amenity_uq` ON `property_amenities` (`property_id`,`amenity_id`);--> statement-breakpoint
CREATE INDEX `property_amenities_amenity_idx` ON `property_amenities` (`amenity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `property_images_property_url_uq` ON `property_images` (`property_id`,`image_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `property_images_primary_uq` ON `property_images` (`property_id`) WHERE "property_images"."is_primary" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `property_staff_property_user_uq` ON `property_staff` (`property_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `property_staff_user_idx` ON `property_staff` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_booking_uq` ON `reviews` (`booking_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_type_amenities_type_amenity_uq` ON `room_type_amenities` (`room_type_id`,`amenity_id`);--> statement-breakpoint
CREATE INDEX `room_type_amenities_amenity_idx` ON `room_type_amenities` (`amenity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_type_images_type_url_uq` ON `room_type_images` (`room_type_id`,`image_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_type_images_primary_uq` ON `room_type_images` (`room_type_id`) WHERE "room_type_images"."is_primary" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `room_types_property_slug_uq` ON `room_types` (`property_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_property_number_uq` ON `rooms` (`property_id`,`room_number`);--> statement-breakpoint
CREATE INDEX `rooms_property_status_idx` ON `rooms` (`property_id`,`status`);--> statement-breakpoint
CREATE INDEX `rooms_type_idx` ON `rooms` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `service_bookings_booking_idx` ON `service_bookings` (`booking_id`);--> statement-breakpoint
CREATE INDEX `service_bookings_service_idx` ON `service_bookings` (`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `services_property_slug_uq` ON `services` (`property_id`,`slug`);--> statement-breakpoint
CREATE INDEX `services_active_idx` ON `services` (`is_active`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);