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
  was missing from the UI while the controller kept sending it). `EmailTriggerRegistryTest`
  enforces this: it scans every `->send('doc','trigger')` call site in `app/` plus the
  dynamic call sites (`BiayaApprovalService`, `StandarisasiTumpukanController`) and
  fails when a used pair is missing from the constant. If a dynamic call site moves,
  update the map in that test.
- Email recipient resolution contract (`EmailRecipient` + `EmailNotificationService`):
  a depot-specific recipient wins over the global row (global is fallback only, no
  double send), role recipients resolve to **active** users scoped to the trigger's
  depot, inactive recipients are never sent, and addresses are deduplicated.
  `EmailRecipient::resolveEmail()` must return null for a `user` recipient whose
  user is not `active`/has no email — it mirrors
  `EmailRecipientController::withResolution()` and the web "Tak terkirim" label.
  Before this was fixed the UI reported such a row as undeliverable while the
  service still emailed it.
- The **global fallback must keep the document's depot for role scoping**:
  `resolveRecipients()` selects `kode_depo = null` rows but resolves their role
  members with the document's `kodeDepo`. Passing `null` down to
  `resolveRoleEmailsByDepot()` emailed every depot's members for one document
  (the reported "Singkawang still gets reminders" leak).
- "Empty depot" is not "no email": an empty depot inherits the global rows. The
  explicit off-switch is `email_depot_settings` (unique `kode_depo`,
  `is_enabled`). `EmailNotificationService::isDepotEnabled()` treats an absent
  row as enabled, so old installs are unaffected; a disabled depot returns `[]`
  from `resolveRecipients()` even when global rows exist, and `send()` logs the
  skip with `"Email dinonaktifkan untuk depo {kode}."`. Managed via
  `PUT /api/v1/email-recipients/depot-settings/{kodeDepo}` (`emails.edit`).
- Successful sends are recorded in `email_notification_logs` with
  `status = sent` (plus recipients), not just `skipped`/`failed` — otherwise
  sent mail leaves no audit trail even though the setting page shows a log
  panel.
- `EmailNotificationSeeder` keys `updateOrCreate` on `kode_depo` too; without it
  the seeder matched (and could overwrite) depot-specific rows while creating the
  global defaults.
- Depot options for the approval settings AND the email recipients both come from
  `depot_settings` (real depots), NOT `users.kode_depo` — the latter contains role
  accounts (`ADMIN`, `BLC-01`, `RLH-01`, …). Fallback (when `depot_settings` is
  empty) excludes `ADMIN` so the page never defaults to a pseudo-depot.
- `approval_assignments` is not optional data: `BiayaApprovalService::ensureApprover()`
  requires an active assignment per level, so an empty table **403s every**
  check/approve/rfah/reject/revise for biaya THL & retribusi (even for
  `admin_master`, by separation of duties). `ApprovalAssignmentSeeder` fills
  BLC/BAC per real depot + RLH/RFAH at `kode_depo='ADMIN'`, via `firstOrCreate`
  so it never overwrites a manual admin choice.
- `kode_depo='ADMIN'` assignments are honored ONLY for the final approvers
  (RLH/RFAH). Keep read (`ApprovalAssignmentController::index`) and use
  (`ensureApprover()`/`approverName()`) aligned — never resolve ADMIN for
  BLC/BAC, or the settings page shows an assignment that has no effect.
- `ApprovalAssignmentController::index()` reads `kode_depo`/`module` via
  `$request->input()`, not `query()`, so the `upsert()` response (which passes
  them in the JSON body) reflects the depot just saved.
