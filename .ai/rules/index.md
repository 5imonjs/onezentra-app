# Project Rules

Committed, area-grouped rules for the OneZentra warehouse system. Before you
edit any file, read every rule file whose globs cover it. Run
`grep -rin '<keyword>' .ai/rules` to catch rules a path match alone misses.

| Glob | Rule file |
| --- | --- |
| `app/**` | `backend.md` |
| `app/Http/Controllers/Api/V1/**` | `v1.md` |
| `routes/**` | `backend.md` |
| `database/**` | `backend.md` |
| `tests/**` | `testing.md` |
| `onezentra_mobile/**` | `mobile.md` |
| `onezentra-web/**` | `web.md` |
