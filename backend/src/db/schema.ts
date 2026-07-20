import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  integer,
  jsonb,
  vector,
  index,
} from "drizzle-orm/pg-core";

// --- users: minimal, no auth yet (v1 is IP-rate-limited, no login) ---
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: varchar("github_id", { length: 64 }), // nullable until GitHub OAuth is added later
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- repos: one row per analyzed GitHub repo ---
export const repos = pgTable("repos", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubUrl: text("github_url").notNull(),
  owner: varchar("owner", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  defaultBranch: varchar("default_branch", { length: 100 }).default("main"),
  status: varchar("status", { length: 32 }).default("pending"), // pending | analyzing | ready | failed
  fileCount: integer("file_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- files: one row per file in an analyzed repo ---
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .references(() => repos.id, { onDelete: "cascade" })
      .notNull(),
    path: text("path").notNull(), // e.g. "src/core/graph.ts"
    language: varchar("language", { length: 32 }),
    lineCount: integer("line_count"),
    readingOrder: integer("reading_order"), // set by Prioritizer Agent
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    repoIdIdx: index("files_repo_id_idx").on(table.repoId),
  })
);

// --- summaries: Summarizer Agent output + pgvector embedding ---
export const summaries = pgTable(
  "summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .references(() => files.id, { onDelete: "cascade" })
      .notNull(),
    overview: text("overview").notNull(), // one-paragraph summary
    keyPoints: jsonb("key_points").notNull(), // array of 3 bullet strings
    embedding: vector("embedding", { dimensions: 768 }), // nomic-embed-text (local, Ollama) — was 1536 for OpenAI text-embedding-3-small
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    fileIdIdx: index("summaries_file_id_idx").on(table.fileId),
  })
);
