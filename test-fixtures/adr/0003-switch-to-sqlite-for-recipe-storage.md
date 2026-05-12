---
title: "Switch to SQLite for recipe storage"
status: accepted
date: 2025-06-20
deciders: ["Alex", "Jordan", "Sam"]
supersedes: [0002]
tags: ["storage"]
confidence: high
---

# Switch to SQLite for Recipe Storage

## Context

In the ever-evolving landscape of modern recipe management platforms, the question of how best to persist user-generated culinary data is one that has occupied the minds of countless engineering teams across the industry. After careful consideration, extensive deliberation, and a great deal of thoughtful analysis, we have arrived at a juncture where the storage layer of our application warrants a fundamental reevaluation in light of the operational realities we have come to face.

SQLite is a widely-used, embedded, serverless SQL database engine originally developed by D. Richard Hipp in the year 2000. It is written in C and is one of the most deployed pieces of software in the world, shipping in every Android device, every iPhone, every major web browser, and in countless other contexts. Unlike traditional client-server database systems such as PostgreSQL or MySQL, SQLite operates as a library that is linked directly into the host application, reading and writing directly to ordinary disk files. A complete SQL database — including tables, indices, triggers, and views — is stored in a single cross-platform file. The SQL it implements is mostly compliant with the SQL-92 standard, with a few well-documented omissions.

The single JSON file approach we adopted in ADR-0002 caused frequent merge conflicts and slow saves once we had approximately 500 recipes in the system.

The JSON file approach, originally chosen for its simplicity, has proven inadequate at the scale we now operate. With around 500 recipes, save operations have become noticeably slow, and concurrent edits routinely produce merge conflicts that require manual resolution. This redundancy of pain across the team is no longer sustainable.

## Decision

Use SQLite as a local, file-based database. One table for recipes, one for tags.

The schema will be created using the following SQL on first run:

```sql
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER REFERENCES recipes(id),
  name TEXT NOT NULL
);
CREATE INDEX idx_tags_recipe ON tags(recipe_id);
```

Migrations will be tracked in a `schema_migrations` table with columns `version INTEGER PRIMARY KEY` and `applied_at DATETIME`. The migration runner will look for files in `db/migrations/NNNN_name.sql` and apply them in lexical order at application startup, wrapping each in a transaction. On a developer machine, the database file will live at `~/.recipes/recipes.db` (overridable via the `RECIPES_DB_PATH` environment variable) and the WAL journal mode will be enabled via `PRAGMA journal_mode=WAL;` to allow concurrent reads during writes.

## Alternatives Considered

- **PostgreSQL**: Full-featured relational database. Excellent for production workloads. Requires running a server, managing users, and handling backups, which is overkill for a local-first app.
- **MySQL**: Similar to PostgreSQL. Also requires a server. Less feature-rich on the JSON side. Same overkill problem.
- **MariaDB**: A community fork of MySQL. Essentially the same tradeoffs.
- **DuckDB**: Embedded analytical database. Great for analytical queries but tuned for OLAP, not OLTP. Wrong fit for our row-by-row recipe edits.
- **LevelDB**: Embedded key-value store from Google. Fast, but we want SQL, not a KV interface.
- **RocksDB**: Facebook's fork of LevelDB. Same KV interface problem.
- **LMDB**: Memory-mapped key-value store. Extremely fast reads, but again, no SQL.
- **BerkeleyDB**: Old embedded database from Oracle. Licensing concerns and a KV interface.
- **Firebird Embedded**: Niche embedded SQL database. Small community, would be hard to hire for.
- **H2 Database**: A Java embedded database. We're not a Java shop, so JNI bridges are unappealing.
- **Microsoft Access (JET) via ODBC**: Mentioned only for completeness. Not seriously considered.
- **A plain CSV file per recipe**: Tried briefly in a prototype. No querying, no joins, regressed on the JSON approach.

## Consequences

- This will improve maintainability.
- This reduces complexity.
- Real queries, no more in-memory filtering.
- Schema migrations now needed.
- Still a single file on disk — easy backup, no server to run.
- The system will be more scalable going forward.
