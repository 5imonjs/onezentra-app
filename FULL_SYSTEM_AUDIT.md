# Full System Audit

Audit date: 2026-11-02
Status: **Partial audit; not certified production-ready.** After the audit,
the user approved security remediation: the Composer advisory and conditional
load-test token risk are fixed in the local working tree, but are not yet
committed or deployed. Four report files document the audit.

## Executive summary

The web app passes ESLint, TypeScript checking as part of the production build,
and the production build itself. Its full unit suite has 3 failing theme-token
guard tests. The latest CI run reports 49 failing Laravel tests (795 passing);
the latest local full run also has 49 failures (797 passing). The original
Composer advisory and conditional load-test token risk have been remediated
locally; `composer audit` is clean.

The mobile app could not be inspected or tested because the sandbox denied
access to `onezentra_mobile/`. Responsive visual checks, live API flows,
database query performance, production deployment health, backup/recovery,
and external service behavior remain unverified. These are explicit scope
limits, not passes.

## Verification matrix

| Area | Status | Evidence |
|---|---|---|
| Web lint | PASS | `cd onezentra-web && npm run lint` exited 0. |
| Web TypeScript/build | PASS | `npm run build` completed, including TypeScript checking. |
| Web production dependencies | PASS | `npm audit --omit=dev` reported 0 vulnerabilities. |
| Web unit tests | FAIL | 414 passed; 3 failed in `src/themeGuard.test.ts`. |
| Laravel CI tests | FAIL | CI run 41412222481: 49 failed, 795 passed, 3,277 assertions. |
| PHP local suite | FAIL | Latest run: 49 failed, 797 passed, 3,292 assertions (846 tests); failures remain in existing backend areas. |
| Mobile formatting | FAIL in CI | Four Dart files are reported by CI as needing formatting. |
| Mobile analyze/tests | BLOCKED | Shell execution was denied by the sandbox for `onezentra_mobile/`; update sandbox access before retrying. |
| Composer security audit | PASS | `composer audit` reports no advisories; `symfony/mime` is v8.1.10. |
| Load-test token handling | PASS LOCALLY | Command is limited to local/testing, tokens use a private temporary file, and the harness removes it without logging token values. Targeted command/harness tests pass. |
| Security source review | PARTIAL PASS | No concrete exploitable web/Laravel application vulnerability was confirmed. The Composer advisory and conditional load-test-token risk have been remediated locally. Mobile source review was blocked. |
| Browser/responsive/accessibility | NOT TESTED | No full viewport/browser matrix or assistive-technology test was run. |
| Database integrity/performance | NOT TESTED | No live schema/query-plan/backup check was run; no database was modified. |
| Production integrations/deployment | NOT TESTED | No production login, API, Hostinger build, or external integration was exercised in this audit. |

CI run reference: [41412222481](https://github.com/5imonjs/onezentra-app/actions/runs/41412222481).

## Findings

### High — Backend regression suite is substantially red

The CI run has 49 failures across authentication, Region/Depo validation,
permission enforcement, depot scoping, receiving, reports, and shipping-plan
flows. This does not by itself prove each production behavior is broken, but
the affected core and tenant-isolation paths are not currently validated by a
green suite and the CI gate fails. See the affected test suites in
`AUDIT_ISSUES.md`.

### Medium — Region UI state can outlive authoritative server session

The login page checks for a locally stored Region record before calling login.
The backend independently requires `region_id` and `region_code` in the
Laravel session. A browser-local record can therefore remain visible after
the server session context is absent or expired; login then fails with the
backend's Region configuration message. This is a recovery/UX mismatch, not
evidence of a bypass.

The Region form also stores its `port` field, while API routing is configured
through `NEXT_PUBLIC_API_URL` (or `/api/v1`). The port field does not select or
change the API host/port.

### Resolved locally — Composer advisory for MIME dependency

The original audit found `symfony/mime` v8.1.7 affected by CVE-2026-45070.
It is now updated to v8.1.10 and `composer audit` reports no advisories.
`SendEmailNotificationJobTest` (3 tests) and `BiayaRetribusiPdfTest` (4 tests)
pass. The update is local and still needs the normal commit/deployment process.

### Resolved locally — Conditional load-test token disclosure

`PrepareLoadTest` now refuses to run outside `local`/`testing` before touching
the database. Tokens are written to a permission-restricted file in the
system temporary directory, not printed; the Node harness validates, reads,
and deletes that file. The focused PHP and Node tests pass. The fix is local,
uncommitted, and undeployed.

### Medium — Web theme guard fails on legacy access pages

Three theme-token tests fail due to raw hex colors, dark-panel assumptions, and
translucent white controls in the older access/depo pages. The affected page
paths and line references are listed in `AUDIT_ISSUES.md`. Other web tests
passed.

### Medium — Mobile CI formatting failure

CI reports four Dart files requiring formatting. The mobile formatter,
analyzer, tests, and source review could not be run locally due to the sandbox
access denial; see `AUDIT_ISSUES.md`.

## Security review result

No confirmed exploitable vulnerability was found in the reviewed web and
Laravel application paths. The two security items above are the composer
advisory and the conditional load-test command exposure. The mobile review is
blocked and must not be interpreted as a pass.

## Changes and working tree

After the user approved security remediation, the working tree changed
`PrepareLoadTest`, the load-test harness and tests, and `composer.lock`.
Pre-existing login modal restoration edits remain in
`onezentra-web/src/app/login/page.tsx` and
`onezentra-web/src/app/login/page.test.tsx`. No changes were committed,
pushed, or deployed.
