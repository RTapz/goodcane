CREATE TYPE "public"."payment_result" AS ENUM('confirmed', 'not_confirmed', 'hold_kept');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "result" "payment_result";--> statement-breakpoint
UPDATE "payments" SET "result" = CASE WHEN "outcome" = 'success' THEN 'confirmed'::"payment_result" ELSE 'hold_kept'::"payment_result" END;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "result" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_due" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "turned_away" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "turned_away" ADD CONSTRAINT "turned_away_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turned_away" ADD CONSTRAINT "turned_away_order_id_unique" UNIQUE("order_id");