CREATE TABLE "website_documents" (
	"id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
