ALTER TABLE "turned_away" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "turned_away" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "turned_away" ADD CONSTRAINT "turned_away_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turned_away" ADD CONSTRAINT "turned_away_idempotency_key_unique" UNIQUE("idempotency_key");