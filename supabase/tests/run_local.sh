#!/usr/bin/env bash
# Runs the schema, seed and RLS tests against a throwaway local PostgreSQL DB.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${DB:-nt_test}
PSQL=${PSQL:-"su postgres -c"}
$PSQL "dropdb --if-exists $DB; createdb $DB"
for f in supabase/tests/local_supabase_shim.sql supabase/migrations/0001_schema.sql supabase/migrations/0001_schema.sql supabase/migrations/0002_alerts_water.sql supabase/migrations/0002_alerts_water.sql supabase/seed.sql supabase/seed.sql supabase/tests/rls_test.sql supabase/tests/rls_water_test.sql; do
  $PSQL "psql -q -v ON_ERROR_STOP=1 -d $DB -f $PWD/$f" 2>&1 | grep -E "PASS|FAIL|ERROR|ALL RLS" || true
done
