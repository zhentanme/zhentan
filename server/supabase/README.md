# Database migrations (Supabase CLI)

Schema changes are managed with the [Supabase CLI](https://supabase.com/docs/guides/cli),
which is installed as a **dev dependency** of this package — no global install needed.
Run it via the `db:*` package scripts (or `pnpm exec supabase …`) from the `server/` directory.

Migrations live in [`migrations/`](./migrations) and apply in filename order.
There is no longer a hand-applied `schema.sql` — the migration history **is** the schema.

## One-time setup

```bash
cd server
pnpm install                                   # installs the supabase CLI dev dependency
pnpm db:link --project-ref <your-project-ref>  # ref is in the dashboard URL / Settings → General
```

## Onboarding the EXISTING database (important — do this once)

The production database already has every table from `20260325000000_init.sql`.
Mark that baseline as already applied so `db push` doesn't try to recreate it,
then push the remaining (real) migrations:

```bash
pnpm exec supabase migration repair --status applied 20260325000000
pnpm db:push     # applies 20260605120000_invoices_safe_address.sql (adds invoices.safe_address)
```

A brand-new database instead just runs everything:

```bash
pnpm db:push     # applies the full history from scratch
```

## Day-to-day

```bash
# Create a new migration
pnpm db:new <short_name>     # creates migrations/<timestamp>_<short_name>.sql
# ... edit the generated .sql (use IF [NOT] EXISTS so it's safe to re-run) ...
pnpm db:push                 # apply to the linked remote

pnpm db:list                 # see local vs remote applied state
pnpm db:push --dry-run       # preview what would run without applying
```

After changing the schema, keep the snake_case row types in
[`../src/lib/supabase/types.ts`](../src/lib/supabase/types.ts) in sync.
(Eliminating that manual sync is the motivation for the Drizzle ORM evaluation —
see the tracking issue.)
