---
paths:
  - bootstrap/app.php
---

# Bootstrap

## Jangan referensikan route login di exception handler
Aplikasi API-only: routes/web.php kosong dan tidak ada route bernama "login". Exception handler tidak boleh memanggil route('login'); redirect non-API ke config('app.frontend_url').'/login'.
