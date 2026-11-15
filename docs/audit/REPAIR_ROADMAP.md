# Repair Roadmap

Remediation status after the user's approval to fix the audit's security
findings. Changes are local and uncommitted; no production action was taken.

## Phase 0 — Contain security risks — COMPLETE LOCALLY

1. `loadtest:prepare` is restricted to `local`/`testing`; tokens are stored in
   a private temporary file and are not printed.
2. `symfony/mime` is updated to v8.1.10.
3. `composer audit` is clean. The queued email test (3 tests) and PDF test
   (4 tests) pass. Load-test command/harness tests pass.

**Exit criteria:** Met in the local working tree. Commit and deploy remain
outstanding; production configuration was not accessed or changed.

## Phase 1 — Restore release gates and verify core behavior

1. Triage the 49 Laravel CI failures. Start with `AuthTest`,
   `RegionDepoValidationTest`, `RegionDepotScopeTest`,
   `PermissionEnforcementTest`, and tests for depot-filtered reports/flows.
2. Resolve the 3 web theme-token test failures on legacy access/depo pages.
3. Format the four mobile Dart files and run the complete mobile analyzer and
   test suite once the sandbox permits access.
4. Re-run all affected tests, then the full web/PHP/mobile checks and build.

**Exit criteria:** CI passes; Region/Depo and tenant-scope regressions are
covered by green tests; no formatter or theme guard failures remain.

## Phase 2 — Correct Region login recovery

1. Align the login page's local Region indicator with the authoritative
   server session. Revalidate the saved Region before login or mark it stale
   when the backend reports missing session context.
2. Decide whether the Port field is supported. If not, remove it or make the
   UI clear that the API host comes from deployment configuration.
3. Add focused tests for missing/expired session, Region revalidation, and
   API destination behavior.

**Exit criteria:** Displayed Region state cannot imply server validation that
has expired; login recovery is actionable and tests cover both failure modes.

## Phase 3 — Complete untested operational verification

1. Run browser-based responsive checks at 320–375, 390–430, 768,
   1024–1366, 1440, and 1920+ widths for every page group.
2. Exercise login/logout, navigation, CRUD, imports/exports, reports, and
   cross-region/depot access against a non-production environment.
3. Inspect the database schema, indexes, query plans, N+1 behavior, integrity,
   and backup/recovery process without destructive operations.
4. Verify Hostinger branch/build, health checks, HTTPS, logs, monitoring, and
   rollback procedure without changing production configuration.
5. Complete mobile source/security review and test supported devices once
   sandbox access is restored.

**Exit criteria:** Every inventory surface has a recorded PASS, FAIL, BLOCKED,
or NOT TESTED result with evidence; unresolved blockers are explicitly
accepted by the owner.

## Dependencies and sequencing

- Phase 0 security containment should precede production use.
- Phase 1 CI restoration precedes claiming a release-ready build.
- Phase 2 should be tested alongside Phase 1 Region/auth tests.
- Phase 3 requires a staging environment and access to browser/mobile test
  tooling; production credentials are not required for the initial test plan.
