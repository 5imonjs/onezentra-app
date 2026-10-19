# Backend rules (`app/**`, `routes/**`, `database/**`)

## Search / LIKE
- Never build a LIKE pattern by hand. Use `App\Support\LikePattern::contains()`
  (controllers: `$this->likeContains()`), and always pair it with an explicit
  escape clause: `whereRaw('col LIKE ? ESCAPE ?', [$like, '\\'])`.
- Why: SQLite (tests) has no default backslash escape, so a bare
  `->where('col', 'like', $like)` silently behaves differently from MySQL.
  A raw `'%'.$term.'%'` also lets user input `%`/`_` act as wildcards.
- Enforced by `Tests\Unit\LikeEscapingGuardTest`, which fails the build on
  `addcslashes()` outside the helper, `'%'.…` concatenation, a dynamic `'like'`
  builder call, or `LIKE ?` without `ESCAPE`.

## Time & operational dates
- The app timezone comes from `APP_TIMEZONE` (`config('app.timezone')`), set to
  `Asia/Jakarta` in `.env.example`. Never hardcode `UTC`; day boundaries
  (`now()->toDateString()`, `startOfWeek` for opname) must use the WIB zone.
- `phpunit.xml` pins `APP_TIMEZONE=UTC` so tests stay deterministic.

## Eloquent
- `AppServiceProvider::boot()` calls `Model::preventLazyLoading()` outside
  production. Eager-load relations (`with(...)`) instead of relying on lazy
  access, or tests/dev will throw `LazyLoadingViolationException`.

## Auth & authorization
- Route middleware carries the permission (`permission:...`) and depo scoping
  uses `forUserDepot()`; never trust a client-supplied depot.
- Login must not reveal whether an email exists: a wrong password and an unknown
  email return the same generic message. The distinct "Your account is inactive."
  message is allowed, but only after the password is verified correct (so it can
  never be used to enumerate accounts) — the mobile client maps it to Indonesian
  in `lib/features/auth/repositories/auth_repository.dart`.

## Domain conventions
- Approval modules (stamp/actor/section) are derived from the model type via
  `BiayaApprovalPresenter`; do not duplicate THL/Retribusi logic in controllers.
- Destructive admin operations must keep the allowlist + typed confirmation
  (`HAPUS`) + dry-run in `AdminDatabaseController`.
- Exports are row-capped through `ExportGuard`; keep the cheap `COUNT` pre-check.
- A `Batch` links to its ledger row (`receiving_items`) through three nullable
  columns: `receiving_id` (document level), `sj_validation_item_id` (SJ scan) and
  `receiving_item_id` (import / opname session). Any cancellation or eligibility
  rule must check all three — `OpnameExpiredService::eligibleItems()` once
  excluded cancelled labels by `receiving_id` alone and silently kept cancelled
  SJ/session/import batches in "Batch Expired".
- Deleting an `opname_expired_wave` cascades its `opname_expired_session_items`
  (photos, koreksi, verifier). `OpnameExpiredController::destroy()` refuses waves
  that are already in a session or validated; keep that guard.
- Every `receiving_items` ledger row should carry exactly one `Batch`
  (`Batch::issueForReceivingItem`, idempotent). `ReceivingController::store()`
  and `scanItem()` must issue one for rows they create — the scan path is the
  only place `expired_date` is captured when there is no SJ validation, and
  `OpnameExpiredService` only sees rows with a non-null `expired_date`.
- Opname progress "sudah kirim" is per-wave, not per-session:
  `submitted = seluruh wave depo tervalidasi`. Never mark a whole depot
  submitted just because one `COMPLETED` session exists — that session may
  cover only some waves.
- `receiving_items` is the single ledger source of truth. The legacy
  `/api/v1/penerimaan` CRUD (`PenerimaanController`, `App\Models\Penerimaan`)
  was removed — no UI ever consumed it (web Inbound = `/receiving-items`,
  mobile Inbound = `/receivings`). The `penerimaan` table and its
  `AdminDatabaseController` reset entry stay (no data loss), but no app code
  reads it; do not add a second receptacle ledger.
- `standar_umur_produk.umur` (months) feeds the shelf-life check in Validasi SJ
  (`SjValidationController::attachUmurStandar`), NOT opname. `OpnameExpiredService`
  classifies strictly by `sisa_hari` vs thresholds; don't promise umur-based
  opname analysis in UI copy.
- `ReceivingController::store()` fallback rows (no completed SJ validation) are
  intentionally created without `expired_date` — the data does not exist yet.
  They become opname-eligible once the operator fills expiry via Edit Inbound
  (`PUT /receiving-items/{id}` must keep accepting `expired_date`).
- Sesi opname has its own permissions (`opname.session.view/create/edit`), not the
  generic `opname.*` slugs that also drive wave monitoring (generate/threshold).
  The seeder derives them: `session.create/edit` follow `opname.create/edit`, and
  `session.view` follows the union of the two — so pure viewers (`opname.view`
  only) do NOT see the field-session menu. Routes (`opname-sessions/*`), the web
  menu/page gates, the seeder derived loop, and
  `add_opname_session_permissions` migration must stay in sync; `operator`
  relinquishes `opname.session.edit` alongside `opname.edit`.
- Logout revokes only the current token (`currentAccessToken()->delete()`), never
  `$user->tokens()->delete()`, to stay multi-device safe.
- Email recipient triggers have one source of truth: `EmailRecipientController::DOCUMENT_TRIGGERS`
  (document_type → valid triggers). `options()` returns it as
  `document_type_triggers` (the web dropdown renders from it; the local TS map
  only supplies labels/descriptions) and `validateRecipient()` rejects impossible
  pairs (e.g. `receiving` + `reminder`). When adding/removing a trigger in any
  `EmailNotificationService::send()` call, update this constant — the frontend map
  is not authoritative and already drifted once (`standarisasi_tumpukan.submitted`
  was missing from the UI while the controller kept sending it).
