# Audit Issues

Priorities describe audit risk, not proof that every failing test corresponds
to a production defect. After the audit, the user approved remediation of the
security findings A-02 and A-03; both are resolved in the working tree but
have not been committed or deployed. Other findings remain open.

## High

### A-01 — Laravel CI suite has 49 failures

- **Area:** Backend authentication, Region/Depo, permissions, tenant scoping,
  receiving, reports, shipping plans.
- **Evidence:** CI run 41412222481 reports 49 failed and 795 passed tests
  (3,277 assertions). The latest local run reports 49 failed and 797 passed
  tests (3,292 assertions) out of 846; the PHP job remains failed.
- **Affected test files:** `ApprovalAssignmentTest.php`, `AuthTest.php`,
  `BiayaThlPdfSettingTest.php`, `DockControllerTest.php`,
  `EmailRecipientControllerTest.php`, `GateDepotFilterTest.php`,
  `HierarchyManagementTest.php`, `IndexKodeDepotFilterTest.php`,
  `LoginToCompleteFlowTest.php`, `PenerimaanExpiredReportTest.php`,
  `PermissionEnforcementTest.php`, `ReceivingDepotFilterTest.php`,
  `ReceivingItemControllerTest.php`, `RegionDepoValidationTest.php`,
  `RegionDepotScopeTest.php`, `RencanaKirimFlowTest.php`,
  `RencanaKirimIndexFilterTest.php`, `RencanaKirimReportTest.php`,
  `RencanaKirimStatsTest.php`, `RencanaKirimValidationTest.php`,
  `ReportDepotFilterTest.php`, `SjValidationDepotFilterTest.php`,
  `SjValidationFlowTest.php`, and `SystemEndToEndTest.php`.
- **Impact:** CI blocks release confidence; core workflows and isolation
  behavior lack a green regression signal.
- **Follow-up:** Triage actual assertion/exception causes, starting with
  authentication and Region/Depo/tenant-scope failures. Fix each root cause,
  then run the narrow suites followed by the full PHP suite.
- **Verification:** NOT RESOLVED. The current local full suite still has 49
  failures; triage and fixes remain open.

## Medium

### A-02 — Composer advisory for `symfony/mime` — RESOLVED LOCALLY

- **Area:** PHP dependency chain.
- **Location:** `composer.lock` (`symfony/mime` v8.1.10).
- **Evidence:** The original audit found CVE-2026-45070 in v8.1.7. The
  dependency is now updated to v8.1.10; `composer audit` reports no
  vulnerability advisories.
- **Impact:** A vulnerable MIME library is installed; the reviewed code did
  not establish attacker control of the affected parameter names. The
  vulnerable version is no longer installed in this working tree.
- **Follow-up:** No further dependency remediation required. Commit and deploy
  the lockfile update through the normal release process.
- **Verification:** `composer audit` is clean; `SendEmailNotificationJobTest`
  passes (3 tests, 10 assertions) and `BiayaRetribusiPdfTest` passes
  (4 tests, 39 assertions).

### A-03 — Production risk if manual load-test preparation runs against prod — RESOLVED LOCALLY

- **Area:** Load-test operations.
- **Location:** `app/Console/Commands/PrepareLoadTest.php`.
- **Evidence:** The command now refuses environments other than `local` and
  `testing` before database writes. It writes tokens to a mode-restricted file
  in the system temporary directory and prints only the file path. The Node
  harness validates the file location/name, reads it, and deletes it without
  logging token values.
- **Impact:** Running the preparation command against production and sharing
  captured output could previously expose usable credentials for its
  load-test users; the controls above prevent that path in the current tree.
- **Follow-up:** Commit and deploy the remediation through the normal release
  process. Revoke any tokens created accidentally in production.
- **Verification:** `PrepareLoadTestCommandTest` passes (2 tests, 12
  assertions), `LoadTestHarnessTest` passes (2 tests, 4 assertions), and the
  Node token-file test and script syntax check pass.

### A-04 — Region UI trusts local storage while backend requires session state

- **Area:** Login / Region Access.
- **Locations:** `onezentra-web/src/app/login/page.tsx:112-120`;
  `app/Http/Controllers/Api/V1/AuthController.php:116-120`;
  `app/Http/Controllers/Api/V1/RegionDepoValidationController.php:27-28`.
- **Evidence:** Login verifies a Region value exists in local storage, then
  calls login. The backend requires Region ID/code in the server session.
  Local storage may outlive that session.
- **Impact:** The UI can display a saved Region even when the server session
  has lost its Region context; sign-in then returns “Region Access belum
  dikonfigurasi”.
- **Follow-up:** On sign-in, revalidate the saved Region through the API (or
  clear/mark it stale when the backend reports missing context), and present
  a specific recovery action. Add tests for expired/missing server session.
- **Verification:** A stale local Region cannot leave the user with a
  misleading “saved” state; a fresh validation restores context before login.

### A-05 — Theme-token guard fails on legacy access pages

- **Area:** Web UI theme consistency.
- **Locations reported by `src/themeGuard.test.ts`:
  - Raw hex colors: `onezentra-web/src/app/depo-identify/page.tsx:58,61,67,100,109`
    and `onezentra-web/src/app/region-access/page.tsx:45,48,50,55,57,58,60,63,70,71,74,79,80,83,93,97`.
  - Dark-panel assumptions: `onezentra-web/src/app/access-gateway/pages/depo-identify/page.tsx:9-10`,
    `onezentra-web/src/app/access-gateway/pages/login/page.tsx:9-15`,
    `onezentra-web/src/app/access-gateway/pages/region-access/page.tsx:8-12`,
    and `onezentra-web/src/app/depo-identify/page.tsx:63,75,122`.
  - Translucent white controls: `onezentra-web/src/app/access-gateway/pages/depo-identify/page.tsx:11`,
    `onezentra-web/src/app/access-gateway/pages/login/page.tsx:11,13`,
    `onezentra-web/src/app/access-gateway/pages/region-access/page.tsx:10`.
- **Evidence:** Complete web suite reports 3 failed theme guard tests; 414
  other tests pass.
- **Impact:** Theme behavior can be inconsistent in light/dark modes and the
  CI web test job fails.
- **Follow-up:** Replace page-level raw colors with global theme tokens,
  preserving intentional branding, then rerun the three guard tests and full
  web suite.
- **Verification:** All theme guard tests pass and both themes remain legible
  on the affected routes.

### A-06 — Mobile CI formatter reports four changed files

- **Area:** Flutter build gate.
- **Locations:** `onezentra_mobile/lib/features/auth/pages/login_page.dart`,
  `onezentra_mobile/lib/features/inbound/pages/inbound_page.dart`,
  `onezentra_mobile/lib/features/splash/pages/splash_screen.dart`,
  `onezentra_mobile/lib/main.dart`.
- **Evidence:** CI's formatting step reports 4 changed Dart files; analyzer
  and tests are skipped after that failure.
- **Impact:** Mobile CI is red; mobile static analysis and test results are
  unavailable from this run.
- **Follow-up:** After sandbox access is restored, run the repository-prescribed
  formatter, inspect the diff, then run `flutter analyze` and `flutter test`.
- **Verification:** Formatter check, analyzer, and all mobile tests pass.

### A-07 — Mobile audit commands blocked by sandbox

- **Area:** Flutter project.
- **Location:** `onezentra_mobile/`.
- **Evidence:** Shell invocation failed with `Operation not permitted` while
  changing into/running commands in this path. No alternate access method was
  attempted.
- **Impact:** Mobile source, TLS pinning, token handling, permissions, and
  runtime behavior are not independently verified in this audit.
- **Follow-up:** Update the sandbox policy to permit read/test access to
  `onezentra_mobile/`; then rerun format check, analyzer, tests, and security
  inspection.
- **Verification:** The mobile checks complete without sandbox denial and
  produce reviewable results.

## Informational

### A-08 — Region port setting does not affect API destination

- **Area:** Login / Region Access.
- **Locations:** `onezentra-web/src/app/login/page.tsx:103`;
  `onezentra-web/src/lib/api.ts:9`;
  `onezentra-web/src/lib/accessGateway.ts:36-40`.
- **Evidence:** The port is persisted with the Region record, while the
  API client uses `NEXT_PUBLIC_API_URL` or `/api/v1`.
- **Impact:** Users may expect Port 8000 to change the server contacted; it
  currently does not.
- **Follow-up:** Confirm whether the port is intentionally legacy UI. Remove
  it or explain/configure the actual API URL; do not silently construct an
  API destination from an untrusted client field.
- **Verification:** UI and request destination behavior agree and are covered
  by a focused test.
