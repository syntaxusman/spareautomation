ALTER TABLE "submissions" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "submissions" SET "type" = 'credit_account' WHERE "type" = 'trade_account';--> statement-breakpoint
DROP TYPE "public"."submission_type";--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('part_inquiry', 'credit_account', 'return_request', 'support_tracking', 'support_resources', 'support_question', 'unsubscribe');--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "type" SET DATA TYPE "public"."submission_type" USING "type"::"public"."submission_type";
