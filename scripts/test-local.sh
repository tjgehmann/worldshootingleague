#!/usr/bin/env bash
# Applies every migration plus the seed to a throwaway Postgres cluster and runs
# the SQL tests against it. No Docker, no Supabase CLI — just postgresql-16.
#
#   ./scripts/test-local.sh
#
# The stub in supabase/tests/00_local_supabase_stub.sql stands in for the parts
# of a Supabase database the migrations touch (auth.users, auth.uid(), the
# storage schema, the anon/authenticated roles). pg_cron is not available
# locally, so the cron.schedule() call is stripped before applying.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER="${WSL_TEST_CLUSTER:-/tmp/wsl-pgtest}"
PORT="${WSL_TEST_PORT:-5433}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DB=wsl_test

export PATH="$PGBIN:$PATH"

cleanup() {
  pg_ctl -D "$CLUSTER/data" stop -m immediate >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> preparing cluster in $CLUSTER"
rm -rf "$CLUSTER"
mkdir -p "$CLUSTER/data" "$CLUSTER/run" "$CLUSTER/work"

# Postgres refuses to run as root; fall back to the postgres system user.
RUNAS=""
if [ "$(id -u)" -eq 0 ]; then
  RUNAS="postgres"
  chown -R postgres "$CLUSTER"
  chmod 700 "$CLUSTER/data"
fi

as() {
  if [ -n "$RUNAS" ]; then su "$RUNAS" -c "PATH=$PGBIN:\$PATH $*"; else bash -c "$*"; fi
}

as "initdb -D $CLUSTER/data -A trust -U postgres" >/dev/null
as "pg_ctl -D $CLUSTER/data -o \"-k $CLUSTER/run -p $PORT -c listen_addresses=''\" -l $CLUSTER/pg.log start" >/dev/null
sleep 1

PSQL="PGHOST=$CLUSTER/run PGPORT=$PORT PGUSER=postgres"

as "$PSQL psql -q -c 'create database $DB;'"

# pg_cron lives in the hosted project only.
sed -e 's/^create extension if not exists pg_cron;/-- pg_cron: hosted only/' \
    "$REPO/supabase/migrations"/*_scheduling.sql \
  | sed -e '/^select cron.schedule($/,$d' > "$CLUSTER/work/scheduling.sql"

cp "$REPO/supabase/tests/00_local_supabase_stub.sql" "$CLUSTER/work/stub.sql"
cp "$REPO/supabase/seed.sql" "$CLUSTER/work/seed.sql"
for f in "$REPO/supabase/migrations"/*.sql; do
  case "$f" in *_scheduling.sql) continue ;; esac
  cp "$f" "$CLUSTER/work/"
done
mkdir -p "$CLUSTER/work/tests"
cp "$REPO/supabase/tests"/[123]*.sql "$CLUSTER/work/tests/"
[ -n "$RUNAS" ] && chown -R postgres "$CLUSTER/work"

apply() {
  as "$PSQL PGDATABASE=$DB psql -v ON_ERROR_STOP=1 -q -f $1"
}

echo "==> applying stub + migrations + seed"
apply "$CLUSTER/work/stub.sql"
for f in "$CLUSTER/work"/2026*.sql; do apply "$f"; done
apply "$CLUSTER/work/scheduling.sql"
apply "$CLUSTER/work/seed.sql"

echo "==> running tests"
status=0
for t in "$CLUSTER/work/tests"/*.sql; do
  echo
  echo "---------- $(basename "$t") ----------"
  as "$PSQL PGDATABASE=$DB psql -q -f $t" 2>&1 || status=1
done

echo
echo "==> done (expected-failure cases print ERROR by design; check the assertions)"
exit $status
