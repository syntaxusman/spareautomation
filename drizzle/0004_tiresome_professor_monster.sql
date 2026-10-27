CREATE TABLE "shopify_webhook_deliveries" (
	"id" varchar(160) PRIMARY KEY NOT NULL,
	"topic" varchar(120) NOT NULL,
	"shop_domain" varchar(255) NOT NULL,
	"resource_id" varchar(160),
	"status" varchar(24) DEFAULT 'processing' NOT NULL,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shopify_webhook_resource_idx" ON "shopify_webhook_deliveries" USING btree ("resource_id");