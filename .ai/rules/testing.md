# Testing rules (`tests/**`)

- Feature tests are the default (`php artisan make:test --phpunit Name`);
  they run on SQLite `:memory:` with `RefreshDatabase`.
- `phpunit.xml` pins `APP_TIMEZONE=UTC`; production uses `Asia/Jakarta`. Do not
  assert on the process timezone — assert on `config('app.timezone')`/`now()`
  behaviour instead.
- When fixing LIKE/search behaviour, add a test that searches a literal `%` (or
  `_`) and expects only rows containing that character — this is what catches a
  missing escape.
- Before finalizing PHP changes run `vendor/bin/pint --dirty --format agent`,
  then the narrowest affected test file, then the full suite:
  `php artisan test --compact --exclude-group=performance`.
