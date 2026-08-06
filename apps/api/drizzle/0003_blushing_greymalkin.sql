CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"movie_slug" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"movie_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "collection_items_unique" UNIQUE("collection_id","movie_slug")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cover_url" text DEFAULT '' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;