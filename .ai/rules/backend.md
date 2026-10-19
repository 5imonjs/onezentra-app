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
- Logout revokes only the current token (`currentAccessToken()->delete()`), never
  `$user->tokens()->delete()`, to stay multi-device safe.
