-- --------------------------------------------------------------------------
-- V69 — the free allowance outlives the account
-- --------------------------------------------------------------------------
--
-- Reverie's free tier is 100 transcribed minutes and 3 imports "for the life of
-- the account". It was enforced by `usage_limits`, one row per user, and that
-- row is declared `user_id ... REFERENCES users(id) ON DELETE CASCADE`.
--
-- So the allowance was for the life of a *row*, not of a person:
--
--     sign up as a@example.com   -> 100 minutes, 3 imports
--     spend 40 minutes           -> 60 left
--     close the account          -> users row deleted
--                                -> usage_limits row cascades away
--     sign up again, same email  -> new clerk_user_id, new users row,
--                                   UsageLimitService.forUser creates a fresh
--                                   counter at zero -> 100 minutes, 3 imports
--
-- Anybody who noticed could reset the free tier indefinitely, which makes the
-- number a formality. Closing an account is also the one operation the product
-- most wants people to feel safe using, so making it *cost* something is not an
-- option either.
--
-- <h2>What this splits apart</h2>
--
-- Two facts were living in one row and only one of them should be deletable:
--
--   * how much of somebody's own content exists, and what it is  (deletable)
--   * whether this human has already had their free allowance    (durable)
--
-- After this migration the second lives in `free_tier_entitlements`, which no
-- user row owns and no cascade can reach. `usage_limits` stays exactly as it is
-- and keeps doing the one thing on it that really is per-account: counting the
-- meetings this account has, which a new account genuinely has none of.
--
-- <h2>Why two tables and not one</h2>
--
-- Because one identity is not one address. A verified primary email can change
-- at the provider, and when it does the person is the same person and the
-- allowance must not restart. `free_tier_identities` is therefore many-to-one:
-- every address that has ever been the verified identity of an account points
-- at the same entitlement, and a second address minting a second entitlement is
-- prevented by the mapping rather than by remembering to check.
--
-- <h2>What is stored about the person: nothing readable</h2>
--
-- `identity_hash` is `HMAC-SHA-256(lower(trim(verified primary email)), secret)`
-- computed in the application — see `FreeTierIdentityHasher`. Not the address,
-- and not a plain SHA-256 of it either: the set of real email addresses is
-- small and guessable enough that an unkeyed digest of one is reversible with a
-- word list. The key stays in the application's configuration, so this table on
-- its own does not identify anybody, and the migration cannot compute a hash —
-- which is why the backfill is in the application and not in this file. See
-- `FreeTierService`.
--
-- <h2>Minutes, not seconds</h2>
--
-- `recording_minutes_used` matches what the pipeline actually charges:
-- `UsageLimitService.chargeAiMinutesOnce` is handed whole minutes, rounded up
-- per meeting, and `MINUTES_ALLOWANCE` is 100 of them. Storing seconds here
-- would be a truer unit and a silent change to the rounding, which is the one
-- thing a quota migration must not do.

-- --------------------------------------------------------------------------
-- The entitlement: one free allowance, one row, for ever
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS free_tier_entitlements (
    id                     TEXT PRIMARY KEY,
    -- Whole minutes of transcription charged against the free allowance. Not
    -- clamped to the allowance: a meeting that overruns what was left is still
    -- kept and still charged, and the account is simply past its allowance
    -- afterwards. Same rule the per-account counter had.
    recording_minutes_used INTEGER     NOT NULL DEFAULT 0,
    imports_used           INTEGER     NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Both counters only ever go up, by an amount the application computes. A
    -- negative value could only come from a bug, and a bug that hands somebody
    -- back their allowance is the bug this whole migration exists to close.
    CONSTRAINT free_tier_minutes_non_negative CHECK (recording_minutes_used >= 0),
    CONSTRAINT free_tier_imports_non_negative CHECK (imports_used >= 0)
);

COMMENT ON TABLE free_tier_entitlements IS
    'One lifetime free allowance. Survives account deletion by design: see V69. '
    'Holds no content, no profile and nothing that identifies a person.';

-- --------------------------------------------------------------------------
-- The identity mapping: which verified addresses have already had one
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS free_tier_identities (
    -- The primary key IS the uniqueness rule. Two concurrent first sign-ins of
    -- the same brand-new identity both try to insert; one wins, the other reads
    -- the winner's row and links to the same entitlement. Enforcing this in
    -- Java would make the guarantee depend on which thread ran first.
    identity_hash  TEXT        PRIMARY KEY,
    -- Which secret and algorithm produced the hash above. Nothing rotates the
    -- key today; this exists so that rotating it later is a second version
    -- alongside the first rather than an archive of hashes nobody can match.
    hash_version   SMALLINT    NOT NULL DEFAULT 1,
    entitlement_id TEXT        NOT NULL REFERENCES free_tier_entitlements(id) ON DELETE RESTRICT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many addresses, one allowance: read this way round to answer "does this
-- entitlement already have an alias for that address".
CREATE INDEX IF NOT EXISTS idx_free_tier_identities_entitlement
    ON free_tier_identities(entitlement_id);

COMMENT ON TABLE free_tier_identities IS
    'HMAC of a verified primary email -> the lifetime allowance it has already '
    'been granted. Many rows may point at one entitlement, which is what makes '
    'changing a verified email not mint a second free tier.';

-- --------------------------------------------------------------------------
-- The account's link to its allowance
-- --------------------------------------------------------------------------
--
-- Held on `users` so the quota path is a join and not an HMAC: charging minutes
-- happens on a worker callback that has a user id and no email, and re-deriving
-- the identity there would mean carrying the address into places that have no
-- business holding it.
--
-- Note the direction of the foreign key. It points *from* the account *to* the
-- entitlement, so deleting the account removes the referencing row and leaves
-- the entitlement standing. `ON DELETE RESTRICT` covers the other direction:
-- nothing may delete an entitlement out from under a live account.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS free_tier_entitlement_id TEXT
        REFERENCES free_tier_entitlements(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_users_free_tier_entitlement
    ON users(free_tier_entitlement_id);

COMMENT ON COLUMN users.free_tier_entitlement_id IS
    'The lifetime free allowance this account spends against. Filled at '
    'provisioning; the entitlement outlives the account.';

-- --------------------------------------------------------------------------
-- Row-level security
-- --------------------------------------------------------------------------
--
-- Every table here is behind RLS with FORCE, the owner included -- see V9. A
-- new table with no policy is a new table that returns nothing, so this section
-- is not optional.
--
-- THE EXEMPTION IS THE CONNECTION'S ROLE, NOT A FUNCTION CALL.
--
-- V9 had `app_is_system()`, which read a session setting that any statement
-- could turn on. V11 replaced it with a role attribute and dropped the function
-- outright -- "so nothing can reintroduce a dependency on it later", in its own
-- words. Writing `app_is_system() OR ...` here therefore does not fail review,
-- it fails startup:
--
--     SQL State : 42883
--     ERROR: function app_is_system() does not exist
--
-- System work connects as the BYPASSRLS role instead. Policies are never
-- consulted for it, so there is nothing to spell out below for it.
--
-- The two tables are deliberately different:
--
--   * An entitlement is readable and writable by the account currently linked
--     to it: that account's own Usage panel is a read of it, and confirming an
--     import is an UPDATE of it. Ownership is expressed through `users`, the
--     way the meeting-children policies express theirs through `meetings`.
--
--   * An identity mapping gets no policy at all, which under FORCE means no
--     tenant connection can read or write one -- its own included. It is the
--     anti-abuse ledger: the addresses that have already been given the free
--     tier. Reading a row tells a tenant nothing it does not already know, but
--     `FOR ALL` would also carry DELETE, and deleting your own mapping before
--     deleting your account is exactly the reset this migration exists to stop.
--     So the ledger is system-only, and both paths that touch it run there:
--     provisioning, which runs before the tenant is known, and the alias
--     written immediately before deletion -- which is why
--     `FreeTierService.bindCurrentIdentityBeforeDeletion` is REQUIRES_NEW
--     called inside `TenantContext.runAsSystem`. A new transaction is a new
--     connection checkout, and checkout is where the role gets chosen.
ALTER TABLE free_tier_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_tier_entitlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON free_tier_entitlements;
CREATE POLICY tenant_isolation ON free_tier_entitlements
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM users u
        WHERE u.free_tier_entitlement_id = free_tier_entitlements.id
          AND u.id = app_current_user()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM users u
        WHERE u.free_tier_entitlement_id = free_tier_entitlements.id
          AND u.id = app_current_user()
    ));

ALTER TABLE free_tier_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_tier_identities FORCE ROW LEVEL SECURITY;
-- Deliberately no policy: see above. The DROP is here so a re-run after an
-- earlier attempt leaves nothing permissive behind.
DROP POLICY IF EXISTS tenant_isolation ON free_tier_identities;

-- --------------------------------------------------------------------------
-- Existing accounts
-- --------------------------------------------------------------------------
--
-- Nothing is seeded here, and that is the point rather than an omission.
--
-- Every existing account's consumed usage is in `usage_limits` and must be
-- carried over — initialising everybody at zero would hand the whole estate a
-- fresh 100 minutes, which is the bug wearing a migration number. But the
-- identity hash cannot be computed in SQL: the HMAC key lives in the
-- application's configuration and putting it in a migration would commit it to
-- git for ever.
--
-- So the backfill is in the application, at the one moment it has both halves —
-- the verified identity from the token and the existing counter from this
-- table. `FreeTierService.linkOnProvision` creates the entitlement the first
-- time an existing account signs in after this deploy and seeds it from
-- `usage_limits`. It is idempotent, it happens before any request that could
-- spend or delete anything, and it needs no separate job.
--
-- `usage_limits.ai_minutes_used` and `.imports_used` are therefore left in
-- place: they are that backfill's only source. Nothing writes them after this
-- release, and they are dropped once every account in the estate is linked —
-- deliberately a later migration, because doing it now would delete the numbers
-- the backfill reads.
