CREATE TABLE "shopify_app_installations" (
	"shop_domain" varchar(255) PRIMARY KEY NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
