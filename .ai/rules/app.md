---
paths:
  - 'app/**'
---

# App

## Enforce hierarchy scope independently of role
Organization hierarchy is a separate account scope: Master manages Regions, Region manages Depots only within its Region, Depot manages Partner Sites only within its Depot, and PS accounts are the leaf level. Keep the operational permission role separate from `scope_level`; every account must carry a valid `region_id` and exactly one `kode_depo`, and PS accounts must reference a Partner Site in that same Depot.

## Activity logging runs after response, not on the queue
`TrackUserActivity` dispatches `LogUserActivity` with `->afterResponse()`. That runs the job synchronously once the response is sent — it is NOT a queued job, so activity is still recorded on shared hosting with no queue worker. Do not "fix" it back to a queued dispatch, and do not log `dashboard/activity/live` or `dashboard/activity/history` (self-polling floods the table).
