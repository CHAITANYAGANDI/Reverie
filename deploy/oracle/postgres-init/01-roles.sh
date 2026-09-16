#!/bin/sh
#
# The two runtime roles, created on first boot of an empty postgres_data volume.
#
# Separate from infra/postgres-init/01-app-role.sql, which is the development
# copy and carries development passwords in the file. Those passwords are
# published in this repository, which is exactly why that file is not mounted
# here: it would create production roles whose credentials anybody can read.
# This script contains no password at all. It reads them from the environment,
# and the environment reads them from .env, which is gitignored and never
# leaves the host.
#
# WHY THREE IDENTITIES, AND WHY THE DISTINCTION IS THE SECURITY MODEL
#
#   reverie      owns the schema and runs Flyway, nothing else. Superuser,
#                because V2 issues CREATE EXTENSION vector. Never serves a
#                request, so no request can ever arrive on a connection that
#                ignores row-level security.
#
#   reverie_app  every user request, from Spring and from the worker.
#                NOSUPERUSER and NOBYPASSRLS, so the V9 policies actually bind.
#
#   reverie_sys  the handful of paths with no user behind them: worker
#                callbacks, the outbox relay, provisioning. BYPASSRLS, so its
#                exemption is a property of the connection rather than a
#                session setting any statement could switch on.
#
# That last distinction is the whole design. An earlier version expressed the
# system exemption as a setting the policies consulted, which meant anything
# able to run arbitrary SQL could simply turn it on and read every tenant. A
# privilege carried by the connection cannot be granted by a statement, so SQL
# injection into an app-role connection stays inside one tenant.
#
# Runs once. `docker-entrypoint-initdb.d` is executed only when the data
# directory is empty, so a restart, an upgrade or a redeploy does not re-run
# it. Changing a role password later is an ALTER ROLE by hand, not an edit
# here -- see README "Rotating a database password".

set -eu

# Fail here rather than four steps later with a role that has no password and
# an application that cannot log in. `:?` prints the name and stops the script,
# and because this runs inside initdb the container exits non-zero and the
# half-built volume is obvious rather than silently broken.
: "${POSTGRES_USER:?the postgres image should have set this}"
: "${POSTGRES_DB:?the postgres image should have set this}"
: "${SPRING_DATASOURCE_PASSWORD:?set SPRING_DATASOURCE_PASSWORD in .env -- it is reverie_app's password}"
: "${REVERIE_DATASOURCE_SYSTEM_PASSWORD:?set REVERIE_DATASOURCE_SYSTEM_PASSWORD in .env -- it is reverie_sys's password}"

# The passwords are passed as psql variables and never interpolated by the
# shell into SQL text. `:'name'` makes psql emit a correctly quoted string
# literal, so a password containing a quote, a backslash or a dollar sign is
# handled by psql's own quoting rather than by hand.
#
# The heredoc is quoted (<<'SQL'), so the shell expands nothing inside it. Every
# substitution below is psql's.
psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v app_password="$SPRING_DATASOURCE_PASSWORD" \
     -v sys_password="$REVERIE_DATASOURCE_SYSTEM_PASSWORD" <<'SQL'

-- Created without a password, then given one by the ALTER below. Deliberately
-- not a DO block: psql does not interpolate its variables inside a
-- dollar-quoted body, so a password set in there would be the literal text
-- :'app_password'. `\gexec` runs the generated statement instead, and only
-- when the role is absent, which keeps this safe to re-run by hand.
SELECT 'CREATE ROLE reverie_app LOGIN NOSUPERUSER NOBYPASSRLS '
       'NOCREATEDB NOCREATEROLE NOINHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reverie_app')
\gexec

SELECT 'CREATE ROLE reverie_sys LOGIN NOSUPERUSER BYPASSRLS '
       'NOCREATEDB NOCREATEROLE NOINHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reverie_sys')
\gexec

-- Stated again rather than trusted to the CREATE above, so that a role which
-- predates this script, or was made by hand, ends up with the same attributes.
-- The two that matter are on the same line as their role: reverie_app must not
-- bypass row-level security, and reverie_sys must.
ALTER ROLE reverie_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER ROLE reverie_sys NOSUPERUSER BYPASSRLS   NOCREATEDB NOCREATEROLE NOINHERIT;

ALTER ROLE reverie_app PASSWORD :'app_password';
ALTER ROLE reverie_sys PASSWORD :'sys_password';

GRANT USAGE ON SCHEMA public TO reverie_app, reverie_sys;

-- DML only, for both. Schema changes belong to Flyway running as the owner, so
-- neither runtime role can drop a policy to escape its tenant -- and
-- reverie_sys, despite bypassing RLS, still cannot alter the schema.
--
-- These two grants cover tables that exist *now*, which on a first boot is
-- none: Flyway has not run yet. They are here for the case where this script
-- is replayed by hand against a populated database.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO reverie_app, reverie_sys;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
    TO reverie_app, reverie_sys;

-- And this is the pair that actually matters on a first boot.
--
-- Default privileges are recorded per granting role, and apply to objects that
-- role creates afterwards. This session is the schema owner, which is also who
-- Flyway connects as -- so every table and sequence the 69 migrations create,
-- minutes from now, is readable and writable by both runtime roles the moment
-- it exists. Without this the migrations would succeed and the application
-- would start and then fail every query with "permission denied for table".
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO reverie_app, reverie_sys;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO reverie_app, reverie_sys;

SQL

# Says which roles exist and how they are set, and no password. Useful on a
# first boot, where the alternative is guessing whether initdb got this far.
echo "reverie-postgres: created reverie_app (NOBYPASSRLS) and reverie_sys (BYPASSRLS)"
