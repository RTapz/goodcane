CREATE TYPE "public"."consent_action" AS ENUM('opt_in', 'opt_out');--> statement-breakpoint
CREATE TYPE "public"."drop_status" AS ENUM('open', 'closed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."forecast_method" AS ENUM('baseline', 'pace');--> statement-breakpoint
CREATE TYPE "public"."fulfilment" AS ENUM('pickup', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."item_size" AS ENUM('330ml', '500ml', '2l', '4l');--> statement-breakpoint
CREATE TYPE "public"."order_actor" AS ENUM('customer', 'owner', 'system');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('requested', 'paid_confirmed', 'fulfilled', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_outcome" AS ENUM('success', 'failed', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('whatsapp', 'sms', 'none');--> statement-breakpoint
CREATE TYPE "public"."reminder_frequency" AS ENUM('every_drop', 'every_second_drop', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('queued', 'sent');--> statement-breakpoint
CREATE TYPE "public"."taste_group" AS ENUM('sweet', 'spicy', 'sour');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('link', 'session', 'reminder');--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"drop_id" uuid,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"action" "consent_action" NOT NULL,
	"channel" "reminder_channel",
	"frequency" "reminder_frequency",
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text,
	"phone" text,
	"reminder_channel" "reminder_channel",
	"reminder_frequency" "reminder_frequency",
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_at" timestamp with time zone NOT NULL,
	"cut_off_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"status" "drop_status" DEFAULT 'open' NOT NULL,
	"units_made" integer,
	"unplanned_sold" integer,
	"units_wasted" integer,
	"closed_at" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "drops_drop_at_unique" UNIQUE("drop_at"),
	CONSTRAINT "drops_capacity_non_negative" CHECK ("drops"."capacity" >= 0),
	CONSTRAINT "drops_cut_off_before_drop" CHECK ("drops"."cut_off_at" <= "drops"."drop_at")
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"checkpoint_at" timestamp with time zone NOT NULL,
	"method" "forecast_method" NOT NULL,
	"projected_units" integer NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "forecast_snapshots_drop_method_unique" UNIQUE("drop_id","method")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"taste_group" "taste_group" NOT NULL,
	"size" "item_size" NOT NULL,
	"price_pesewas" integer NOT NULL,
	"capacity_weight" integer NOT NULL,
	"is_special" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "menu_items_price_non_negative" CHECK ("menu_items"."price_pesewas" >= 0),
	CONSTRAINT "menu_items_weight_positive" CHECK ("menu_items"."capacity_weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" "order_actor" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_pesewas" integer NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "order_items_order_id_menu_item_id_pk" PRIMARY KEY("order_id","menu_item_id"),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_non_negative" CHECK ("order_items"."unit_price_pesewas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"drop_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'requested' NOT NULL,
	"fulfilment" "fulfilment" NOT NULL,
	"address" text,
	"area" text,
	"fee_pesewas" integer DEFAULT 0 NOT NULL,
	"total_pesewas" integer NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refund_due" boolean DEFAULT false NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "orders_fee_non_negative" CHECK ("orders"."fee_pesewas" >= 0),
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total_pesewas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"outcome" "payment_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"drop_id" uuid NOT NULL,
	"channel" "reminder_channel" NOT NULL,
	"status" "reminder_status" DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "reminders_customer_drop_unique" UNIQUE("customer_id","drop_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turned_away" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"units" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "turned_away_units_positive" CHECK ("turned_away"."units" > 0)
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turned_away" ADD CONSTRAINT "turned_away_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_tokens_customer_idx" ON "access_tokens" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "consent_events_customer_idx" ON "consent_events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "order_history_order_idx" ON "order_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_drop_status_idx" ON "orders" USING btree ("drop_id","status");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");