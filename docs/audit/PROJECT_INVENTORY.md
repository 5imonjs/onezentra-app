# Project Inventory

Audit snapshot: 2026-11-02. This inventory records repository structure and
automated route/file counts; it is not evidence that every workflow was
manually exercised.

Security remediation update: `symfony/mime` is v8.1.10 and `composer audit`
is clean. `loadtest:prepare` is restricted to local/testing and no longer
prints reusable tokens. These changes are local and have not been committed or
deployed; see `AUDIT_ISSUES.md` for test evidence and remaining findings.

## Repository areas

- `app/`, `routes/`, `database/`, `tests/`: Laravel backend, API, migrations,
  and tests.
- `onezentra-web/`: Next.js web application.
- `onezentra_mobile/`: Flutter mobile application.
- `config/`, `bootstrap/`, `public/`, `resources/`, `storage/`, `scripts/`:
  Laravel configuration, runtime, static resources, and scripts.
- `.github/`: CI and deployment workflows.
- `.ai/rules/`: repository rules for application, web, mobile, and tests.

## Web application

- Framework: Next.js 16.4.2; the production build reports Laravel-facing
  application pages as dynamic routes.
- 38 `page.tsx` files, 54 test files, and no Next.js `route.ts` handlers were
  found under `src/app`.
- 38 page routes:
  - `/`, `/login`
  - `/admin-database`, `/approval-settings`, `/biaya-retribusi`,
    `/biaya-thl`, `/cluster-principal`, `/depo-identify`, `/docks`,
    `/email-recipients`, `/email-settings`, `/gate`, `/npn`,
    `/opname-expired`, `/opname-sessions`, `/penerimaan`, `/receiving`,
    `/region-access`, `/rencana-kirim`, `/roles`, `/standar-umur`,
    `/standarisasi`, `/tarif-retribusi`, `/users`, `/validasi-sj`
  - `/dashboard`, `/dashboard/profile`
  - `/reports/biaya-retribusi`, `/reports/biaya-thl`,
    `/reports/opname-expired`, `/reports/penerimaan`,
    `/reports/penerimaan-batch-expired`, `/reports/rencana-kirim`,
    `/reports/selisih-qty`
  - `/access-gateway`, `/access-gateway/pages/depo-identify`,
    `/access-gateway/pages/login`, `/access-gateway/pages/region-access`
- Shared areas include `src/components`, `src/lib`, and `src/store`.
- API requests use the shared client in `src/lib/api.ts`; Region/Depo
  operations are in `src/lib/accessGateway.ts`.

## Mobile application

- Flutter project: 41 Dart files under `lib/`; 31 Dart test files under
  `test/`.
- Feature areas observed in the file inventory: `auth`, `gate`, `history`,
  `home`, `inbound`, `splash`, `unload`, and `validation`.
- Repository rules document global light/dark theming and secure token storage.
- The mobile source tree could not be inspected or tested in this audit because
  shell access to `onezentra_mobile/` was denied by the sandbox. CI did identify
  four Dart files needing formatting; see `AUDIT_ISSUES.md`.

## Laravel backend and API

- Laravel Framework 13.37.0.
- `routes/api.php` resolves to 249 API routes (excluding vendor routes).
- Route counts by URI group:

| Group | Routes | Group | Routes |
|---|---:|---|---:|
| admin | 6 | approval-assignments | 2 |
| batches | 4 | biaya-config | 1 |
| biaya-retribusi | 17 | biaya-thl | 16 |
| cluster-principal | 10 | dashboard | 3 |
| depo | 1 | depo-validate | 1 |
| depot-settings | 4 | docks | 8 |
| email-recipients | 7 | email-settings | 4 |
| gate-transactions | 7 | login | 1 |
| login-with-context | 1 | logout | 1 |
| mobile | 2 | npn | 10 |
| opname-expired | 11 | opname-sessions | 9 |
| partner-sites | 2 | permissions | 5 |
| receiving-items | 9 | receivings | 13 |
| region-validate | 1 | regions | 3 |
| register | 1 | rencana-kirim | 13 |
| reports | 13 | retribusi-rates | 3 |
| roles | 10 | settings | 2 |
| sj-validations | 13 | standar-umur-produk | 9 |
| standarisasi-tumpukan | 14 | storage | 1 |
| user | 2 | users | 9 |

- API controller surfaces referenced by `routes/api.php`: admin database,
  approvals, auth, batches, biaya configuration/reports, cluster principal,
  dashboard, depo/depot settings, docks, email settings/recipients, gate,
  NPN, opname, partner sites, permissions, receiving, regions, shipping plans,
  reports, rates, roles, SJ validation, product standards, storage, and users.
- 152 database migration files and 111 backend test files were counted.
- The live database schema, indexes, query plans, and backups were not queried
  or modified.

## Deployment and configuration

- GitHub Actions contains CI and a web deploy-branch synchronization workflow.
- The deployment branch sync is not itself proof of a Hostinger production
  build or successful deployment.
- The mobile rule file describes a trial API IP and a pinned self-signed
  certificate; actual mobile source/runtime configuration was not verified.
