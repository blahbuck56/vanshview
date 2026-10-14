#!/usr/bin/env bash
# Rebuild a scratch database from migrations + seed and run the pgTAP suite against plain
# Postgres (no Docker needed). Requires: postgres 15+, pgtap extension, pg_prove.
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres pnpm db:test:local
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-localhost}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
DB="${DB:-vanshview_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

dropdb --if-exists --force "$DB"
createdb "$DB"
psql -X -q -d "$DB" -c "alter database \"$DB\" set search_path = \"\$user\", public, extensions" >/dev/null
psql -X -q -d "$DB" -c "alter database \"$DB\" set timezone = 'UTC'" >/dev/null

"${PSQL[@]}" -f scripts/local-db/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "seed     supabase/seed.sql"
"${PSQL[@]}" -f supabase/seed.sql >/dev/null
"${PSQL[@]}" -c "create extension if not exists pgtap with schema extensions"

if [ "${1:-}" != "--no-tests" ]; then
  pg_prove -d "$DB" --ext .sql -r supabase/tests
fi
