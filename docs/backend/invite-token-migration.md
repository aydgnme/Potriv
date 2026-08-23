# Deploying V7: invitations become per-recipient and hash-only

V7 is destructive by design and cannot be undone by rolling the application
back. This note says what that means operationally, and what to do instead.

## What V7 does

- Adds `token_hash`, `invited_email`, `consumed_at`, `revoked_at` and the
  delivery columns to `invite_tokens`.
- **Revokes every pre-existing invitation** rather than migrating it, and drops
  the plaintext `token` column.

The revocation is not caution, it is the point. Before this change an invitation
was a plaintext column with no expiry and no owner, returned in an API response
and shown in the product with a copy button. Every such value has been readable
in the database, in registration responses, and in any URL log that recorded
one. They are treated as disclosed, because they are.

**After deploying, organization admins re-invite each outstanding person by
address.** There is no way to carry an old link across; the whole change is that
a link cannot be recovered from storage.

## Rolling back

**An application-only rollback does not work.** The previous release reads
`invite_tokens.token`, which V7 has dropped, so it fails at the first query
touching invitations — and Hibernate `ddl-auto: validate` refuses to start at
all once the entity and the schema disagree.

A rollback therefore has to be coordinated:

1. Stop the application.
2. Restore the database to a backup taken **before** V7 ran.
3. Deploy the previous application image.

Steps 2 and 3 must both happen. Doing either alone leaves a running application
against a schema it cannot use.

Restoring a pre-V7 backup brings the old plaintext tokens back with it. Treat
that as a credential exposure: after any such restore, the invitations in it are
live again and should be revoked before the system is reachable.

### Forward-fix is usually the better option

Most reasons to roll back — a broken screen, a wrong message, a bad default —
are cheaper to fix forward, because none of them require the old schema. Reserve
the coordinated rollback for a defect in the migration itself.

## Re-migrating a restored backup

Applying the migrations again to a restored backup is safe: V7's revocation is
unconditional, so every invitation the backup contained comes back disabled,
with `revoked_at` set and a `token_hash` of `retired-<id>` — a value no token
can hash to, because it is not the shape a SHA-256 base64url digest has.

`RestoredBackupMigrationTest` proves this against real PostgreSQL: it migrates
to V6, writes the kind of rows a pre-V7 backup contains (including one with no
expiry, which the old schema allowed), migrates the rest of the way, and asserts
that nothing is usable afterwards.

## Azure

There is no deployment automation in this repository — no workflow performs an
Azure deploy or an image push, and the repository has no recorded deployments.
Whoever runs the first deployment should:

1. Take a database backup immediately before applying V7, and note its
   timestamp; it is the only rollback target.
2. Deploy application and migration together. Flyway runs at startup, so a
   partially rolled-out deployment means some instances are on the old code
   against the new schema — run it as a stop-then-start, not a rolling update.
3. After the deployment, confirm `select count(*) from invite_tokens where
   active` is zero, and tell organization admins to re-invite.

## Verification already in the suite

- `ProductionSchemaMigrationIntegrationTest` — Flyway builds the schema on real
  PostgreSQL under the `prod` profile and Hibernate `validate` accepts it.
- `RestoredBackupMigrationTest` — a restored pre-V7 backup migrates to something
  with no usable invitations.
- `InviteTokenSecrecyIntegrationTest` — no column of any table holds a raw
  token afterwards.
