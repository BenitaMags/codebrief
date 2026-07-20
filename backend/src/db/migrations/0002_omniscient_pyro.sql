CREATE TABLE IF NOT EXISTS "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"overview" text NOT NULL,
	"architecture_summary" text NOT NULL,
	"entry_points" jsonb NOT NULL,
	"common_tasks_guidance" text NOT NULL,
	"quick_start" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guides" ADD CONSTRAINT "guides_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
