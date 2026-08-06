CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"host_user_id" uuid NOT NULL,
	"movie_slug" text NOT NULL,
	"episode_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
