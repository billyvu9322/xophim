CREATE TABLE "watch_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"movie_slug" text NOT NULL,
	"episode_slug" text NOT NULL,
	"server_name" text DEFAULT '' NOT NULL,
	"position_sec" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"movie_snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_movie_ep_key" UNIQUE("user_id","movie_slug","episode_slug")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"movie_slug" text NOT NULL,
	"movie_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_id_movie_slug_key" UNIQUE("user_id","movie_slug")
);
--> statement-breakpoint
CREATE INDEX "watch_progress_user_updated_idx" ON "watch_progress" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "watchlist_user_id_idx" ON "watchlist" USING btree ("user_id");