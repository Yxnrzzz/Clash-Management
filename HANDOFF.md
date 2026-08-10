# EPS Workspace — Handoff Progress

**Tanggal:** 7 Agustus 2026 (update ke-16)
**Status:** Frontend selesai. **Sprint 0-9 backend selesai, Sprint 11 sebagian besar selesai** (Sprint 10/AI opsional masih belum, sengaja ditunda — lihat §7/§12), produk sekarang bernama **EPS Workspace** (rebrand dari "ClashHub", lihat update ke-13), dan **benar-benar multi-project** (di luar 12 sprint asli — permintaan ad-hoc, lihat update ke-12 di bawah): auth, RBAC (termasuk **assignee kini dibatasi Engineer aktif saja**, lihat update ke-13; **Management sekarang bisa berkomentar**, lihat update ke-16), CRUD user/proyek/master-data, clash/komentar/audit log, lampiran (**sekarang bisa lewat signed URL berumur pendek**, lihat update ke-15; **clash sekarang bisa di-soft-delete Admin, lampiran bisa dikelola penuh dari halaman detail dengan pratinjau zoom/pan, dan bisa diberi markup vektor (kotak/panah/bebas/teks) tanpa menyentuh file asli**, lihat update ke-16), notifikasi email+WhatsApp, **impor massal CSV/XML async + template master data antar proyek**, **hardening keamanan + observability + uji beban 10.000 clash terukur nyata** (rate limiting **sekarang per-user, bukan per-IP**, lihat update ke-15), dan **otorisasi per-proyek yang ditegakkan server-side** (bukan lagi "single-project, semua user otomatis anggota") semuanya berjalan di NestJS + PostgreSQL + Redis (+ disk lokal untuk file) dengan RBAC ditegakkan server-side. **Tidak ada lagi apa pun yang client-only** — `localStorage` sudah pensiun total.

**Update ke-16 (siklus hidup clash & lampiran, di luar Sprint Plan asli — permintaan ad-hoc pasca update ke-15):** Empat fitur berurutan, masing-masing dirilis & diverifikasi terpisah, ditutup dengan sesi perbaikan bug pasca-review user. Ringkasan penuh ada di §5 "Soft-delete clash, kelola lampiran, pratinjau & markup vektor" — di sini cuma daftar isi.
(1) **Soft-delete clash** (Admin-only): `Clash.deletedAt` baru + fragmen where `NOT_DELETED` (`apps/api/src/clashes/clash-scope.ts`) di-spread ke semua jalur baca (list/metrics/bulkUpdate/detail, overdue scanner, notification processor) — **dengan dua pengecualian sengaja** (hitung sequence `uniqueCode` dan dedup `externalId` import) yang didokumentasikan di kode supaya tidak "diperbaiki" keliru di sesi depan. `DELETE /clashes/:id` + `POST /clashes/:id/restore`.
(2) **Kelola lampiran dari halaman detail** — sebelumnya cuma bisa ditambah saat clash dibuat. Sekarang upload/hapus langsung dari tab Lampiran, hapus dibatasi ke pengunggah sendiri (atau Coordinator/Admin), plus audit log `attachment_added`/`attachment_deleted` dan `StorageService.delete()` baru (proteksi path traversal, toleran file hilang).
(3) **Modal pratinjau lampiran** — zoom/pan, navigasi panah keyboard, dan refresh signed-URL proaktif 1 menit sebelum kedaluwarsa (TTL 5 menit sengaja **tidak** diperpanjang — signed URL tidak bisa dicabut, jadi jendela lebih panjang cuma menambah paparan tanpa manfaat UX).
(4) **Markup vektor** — model `Annotation` baru (geometri dinormalisasi `[0,1]` terhadap kotak intrinsik halaman, **file asli tidak pernah disentuh**), overlay SVG (kotak/panah/bebas/teks), dibagikan ke seluruh anggota proyek, edit/hapus dibatasi ke pembuat atau Coordinator/Admin. PDF dirender lewat `pdfjs-dist` (worker di-copy ke `public/` lewat script `prebuild`, bukan diresolve bundler). "Unduh dengan markup" meratakan ke PNG sepenuhnya di client.
**Juga:** Management sekarang bisa berkomentar (`canComment()` dan pesan baca-saja-nya dihapus total — komentar itu diskusi, bukan edit yang mengubah state).
**Dua bug ditemukan lewat verifikasi browser pasca-implementasi awal** (bukan lewat test otomatis — keduanya lolos test karena event sintetis tidak sepenuhnya meniru perilaku browser nyata): `useElementBox` memicu infinite loop (`setState` tanpa dependency array yang benar), dan **markup teks sama sekali tidak bisa diketik dengan mouse asli** — `mousedown`'s default action memindah fokus ke `<body>` *setelah* React memasang input `autoFocus`, jadi input langsung ter-blur di tick yang sama. Kedua bug + pelajarannya didokumentasikan lengkap di §8 (sesi update ke-16) dan §9.28-30 — **wajib dibaca sebelum menyentuh `AnnotationLayer.tsx`/`AttachmentPreviewModal.tsx` lagi**.

**Verifikasi otomatis update ke-16**: backend naik dari 147→**190** test (17→18 suite: +annotations service, +storage delete, +clashes soft-delete/attachment delete, +overdue-scanner/notifications-processor filter); frontend naik dari 57→**120** test (5→10 file: +DeleteClashDialog, +AttachmentPanel, +AttachmentPreviewModal, +AnnotationLayer, +annotations.ts, +lookup diperluas). `tsc --noEmit` bersih (1 error bawaan tak terkait di `AppShell.test.tsx`), lint bersih di kedua sisi, `next build` hijau (memvalidasi jalur worker `pdfjs-dist`+Turbopack — risiko terbesar tahap markup). Diverifikasi live di browser nyata untuk **semua** empat tahap dan kedua bug fix, dengan mouse & keyboard sungguhan (bukan `dispatchEvent`) setelah ketahuan itulah yang menyembunyikan bug teks — lihat §5 untuk detail lengkap per tahap.

**Update ke-15 (utang test & hardening kecil, di luar Sprint Plan asli — PR #12 di-merge ke `main` di awal sesi ini):** Enam langkah independen, semuanya diverifikasi test otomatis dan sebagian besar juga live/end-to-end.
(1) **Test untuk endpoint membership proyek** (`GET/POST/DELETE /projects/:projectId/members`) — sebelumnya cuma diverifikasi manual (update ke-12), sekarang 11 unit test baru di `projects.service.spec.ts` (404/409/mapping/urutan) + `apps/api/src/testing/project-members.e2e-spec.ts` baru (8 test HTTP penuh, pola sama dengan `project-isolation.e2e-spec.ts`: Prisma palsu in-memory + `TestAuthGuard`, membuktikan `@Roles(Role.ADMIN)` benar-benar satu-satunya peran yang lolos — termasuk Coordinator, meski dia salah satu `CROSS_PROJECT_ROLES` di tempat lain, tetap `403` di sini — dan `@SkipProjectScope()` di controller masih berlaku, Admin lolos tanpa header `X-Project-Id`).
(2) **Temuan tak terduga saat mengerjakan (1) — dan yang paling penting di update ini**: `apps/api/package.json`'s Jest `testRegex` (`.*\.spec\.ts$`) dan `apps/api/eslint.config.mjs`'s override block (`files: ["**/*.spec.ts"]`) sama-sama mensyaratkan titik literal tepat sebelum "spec" — nama file `*.e2e-spec.ts` punya strip di posisi itu, bukan titik, jadi **tidak pernah cocok dengan pola manapun**. Akibatnya `project-isolation.e2e-spec.ts` (341 baris, bukti IDOR multi-project dari update ke-12, diklaim di update ke-12 sebagai "10 test baru" yang menyumbang ke hitungan 96 test) **tidak pernah benar-benar dijalankan** — bukan oleh `npm test` lokal, bukan oleh CI, sejak ditulis. Dikonfirmasi dengan menjalankan `node -e "console.log(/.*\.spec\.ts$/.test('project-isolation.e2e-spec.ts'))"` → `false`. Kedua pola diperbaiki (`testRegex: '.*\\.(spec|e2e-spec)\\.ts$'`; ESLint `files: ["**/*.spec.ts", "**/*.e2e-spec.ts"]`), dan begitu file itu benar-benar dijalankan untuk pertama kalinya, ternyata **juga tidak lolos** — 3 bug nyata sekaligus di dalamnya, semua diperbaiki di sesi ini: (a) beberapa error TypeScript (fixture `makeClash()` kehilangan tipe field custom karena inferensi sirkular, `$transaction`'s `tx.clash` proxy function juga sirkular — diperbaiki dengan tipe `ClashFixture` eksplisit dan mengekstrak `clashMock` jadi variabel terpisah); (b) `TestAppModule`-nya tidak menyediakan `ConfigService` (dibutuhkan `StorageModule`/`NotificationsModule` yang ikut ter-import transitif lewat `ClashesModule`) maupun koneksi BullMQ nyata (`NotificationsProcessor`'s `@Processor()` decorator memicu `new Worker()` yang butuh Redis) — diperbaiki dengan `ConfigModule.forRoot()` + override provider `NotificationsProcessor` jadi `{}` (menghapus `metatype`-nya sehingga `BullExplorer` tidak mendaftarkannya sebagai worker — trik standar, didokumentasikan di komentar kode); (c) fixture id clash (`'clash-a'`/`'clash-b'`) bentrok dengan `@IsUUID` di `BulkUpdateClashDto.ids`, bikin satu test 404 yang diharapkan malah dapat 400 — diperbaiki dengan id UUID asli (`CLASH_A_ID`/`CLASH_B_ID`). File ini sekarang **benar-benar hijau** (18 test lolos gabungan dengan file (1)) dan ikut jalan di `npm test`/CI mulai sesi ini.
(3) **`allowedStatusTransitions` diekstrak** dari closure di `useMasterDataLookups()` (`use-master-data.ts`) jadi fungsi murni `allowedStatusTransitions(statuses, role, clash, userId)` di `src/lib/lookup.ts` (pola yang sama dipakai `canEditClash`/`isAssignable`) — hook lama tinggal delegasi satu baris, signature yang dilihat call site (`clashes/[id]/page.tsx`) tidak berubah. 7 test baru di `lookup.test.ts`, termasuk kasus yang sengaja meniru bug klasik: status "Closed" di-rename tapi `isClosedState` tetap `true` → Engineer tetap tidak bisa lompat ke situ (mengunci perilaku yang sudah didokumentasikan di komentar kode sejak awal, sekarang benar-benar dites).
(4) **Test komponen React pertama yang benar-benar merender lewat context** — sebelumnya tidak ada satupun test yang me-render komponen dengan `useData()`/`useAuth()`. `AppShell.test.tsx` baru (7 test: judul "EPS Workspace", tanpa user → cuma children, switcher proyek tunggal vs jamak, `setActiveProject` terpanggil saat ganti pilihan, banner `syncError`) meng-`vi.mock` `@/lib/auth-context`/`@/lib/data-context`/`next/navigation` **langsung di file test itu sendiri** (bukan lewat helper terpisah — hoisting `vi.mock` Vitest cuma berlaku dalam file yang sama, helper impor tidak akan ter-hoist di atas import komponen yang dites, jadi mock tidak akan aktif tepat waktu). `BulkToolbar.test.tsx` baru (6 test) — komponen ini murni props, tidak butuh mock context. **Temuan tak terduga kedua**: `vitest.setup.ts` tidak pernah mendaftarkan `afterEach(cleanup)` dari Testing Library — cleanup otomatisnya butuh `global afterEach` yang tidak ada karena `vitest.config.mts` tidak set `test.globals: true`; 3 test lama (`Badge.test.tsx` dkk) tidak pernah ketahuan karena masing-masing cuma render sekali dengan teks unik, tapi test `AppShell` yang render berkali-kali langsung tabrakan ("multiple elements found"). Diperbaiki sekali di `vitest.setup.ts`, otomatis berlaku untuk semua file test.
(5) **Signed URL untuk lampiran** (deliverable eksplisit Sprint 11 — `ClashHub_Sprint_Plan.md` §11 poin 2) — `StorageService.signKey()`/`verifySignedKey()` baru (HMAC-SHA256 atas `attachment:<id>|<expiresAt>`, secret dari `ATTACHMENT_URL_SECRET` env baru dengan default dev, dibandingkan pakai `crypto.timingSafeEqual`), endpoint baru `GET /clashes/:clashId/attachments/:attachmentId/signed-url` (RBAC/scoping sama persis dengan rute download lama, dipakai ulang lewat `assertAttachmentInClash()`) mengembalikan URL berumur 5 menit, dan rute publik `GET /clashes/attachments/:attachmentId/signed` (`@Public()`, memverifikasi tanda tangan lalu stream) — **yang ditandatangani adalah `attachmentId`, bukan path storage mentah**, supaya rute publik tetap query terindeks (`findUnique` by id) dan tidak pernah mempercayai path dari client. Rute download lama **tidak dihapus**, tetap ada berdampingan. Frontend (`clashes/[id]/page.tsx`) beralih dari fetch-blob-lalu-`createObjectURL` (butuh `URL.revokeObjectURL` manual saat unmount) ke fetch signed URL sekali lalu pakai langsung sebagai `<img src>`/`<a href download>` — lebih sederhana, efek revoke-on-unmount ikut terhapus karena tidak ada lagi object URL. 7 unit test baru (`storage.service.spec.ts`) + 5 unit test baru (`clashes.service.spec.ts`) untuk kedua method service baru. **Diverifikasi live end-to-end** (server API nyata, bukan cuma unit test): login sebagai Engineer sungguhan → upload lampiran sungguhan → minta signed URL → `curl` ke URL itu **tanpa header auth apa pun** → `200`, `Content-Type` benar, byte identik dengan file asli; token yang di-tempel satu karakter → `403`; `attachmentId` tidak dikenal → `404`; `expiresAt` di masa lalu → `403`; endpoint pembuat signed URL tanpa token JWT sama sekali → tetap `401` (RBAC generasi tidak melemah). Data uji (baris `Attachment` + file di disk) dibersihkan lagi setelah verifikasi lewat `node -e` + Prisma langsung (pola yang didokumentasikan di §12), bukan `docker exec ... psql`. **Catatan jujur, disampaikan ke user sebelum mengerjakan**: di topologi sekarang (disk lokal, satu instance, rute download lama sudah RBAC-protected) signed URL ini menambah permukaan kode tanpa menambah keamanan berarti hari ini — nilainya baru nyata kalau `StorageService` pindah ke S3/R2 yang menyajikan byte langsung tanpa lewat API ini lagi. Dikerjakan karena tetap deliverable eksplisit Sprint 11, bukan karena topologi saat ini membutuhkannya.
(6) **Rate limiting per-user, bukan per-IP** (gap jujur yang dicatat sendiri di update ke-11: "kantor/NAT bersama bisa saling memengaruhi kuota") — `UserThrottlerGuard` baru (`extends ThrottlerGuard`, override `getTracker()`: pakai `request.user.id` kalau ada, jatuh ke IP kalau tidak — jadi rute `@Public()` seperti `/auth/login` tetap per-IP, yang justru diinginkan untuk brute-force protection) menggantikan `ThrottlerGuard` polos di `app.module.ts`. **Urutan guard berubah**: `UserThrottlerGuard` sekarang terdaftar **setelah** `JwtAuthGuard` (sebelumnya `ThrottlerGuard` polos didaftarkan pertama karena "tidak bergantung apa pun") — kalau tidak, `request.user` belum terisi saat `getTracker()` jalan. Komentar penjelas urutan guard di `app.module.ts` diperbarui supaya tidak menyesatkan sesi berikutnya. 3 unit test baru (`user-throttler.guard.spec.ts`, dibangun via `Test.createTestingModule` sungguhan karena `ThrottlerGuard` butuh beberapa provider dari `ThrottlerModule` untuk diinstansiasi). **Diverifikasi live**: 610 request beruntun sebagai Engineer sungguhan (lewat server API nyata) → tepat 600 `200` lalu 10 `429` (limit global 600/menit persis kena); **request berikutnya sebagai Coordinator dari mesin/IP yang sama, langsung setelah itu** → `200`, membuktikan kuotanya benar-benar terpisah per-user, bukan lagi per-IP yang tadi baru habis.

**Verifikasi otomatis update ke-15**: backend naik dari 105→147 test (13→17 suite: +membership unit, +2 file e2e yang sekarang benar-benar jalan, +storage signed-url, +user-throttler), lint backend tetap 6 warning bawaan `fast-xml-parser` (baseline tidak berubah meski cakupan lint bertambah lewat perbaikan glob `.e2e-spec.ts`); frontend naik dari 36→57 test (3→5 file: +lookup, +AppShell, +BulkToolbar), lint frontend tetap 1 warning bawaan TanStack Table; build & lint bersih di kedua sisi. **Update ke-13 (assignee Engineer-only + rebrand "EPS Workspace", permintaan ad-hoc di luar Sprint Plan asli):** Dua perubahan independen dalam satu sesi.
(1) **Assignee sekarang dibatasi Engineer aktif saja** (sebelumnya Engineer *atau* Coordinator boleh, dan yang lebih penting: backend **tidak memvalidasi `assigneeId` sama sekali**). Validator baru `ClashesService.assertAssigneeIsEngineer()` (`null`/`undefined` selalu lolos — melepas assignee tetap boleh; selain itu user harus ada, `role === ENGINEER`, dan `isActive`) dipanggil dari **dua** jalur terpisah: `buildAllowedPatch()` (`PATCH /clashes/:id`) dan `bulkUpdate()` (`POST /clashes/bulk`) — yang kedua ini penting karena `bulkUpdate()` **tidak pernah** memanggil `buildAllowedPatch()`, jadi sebelum perubahan ini bulk-assign benar-benar tanpa penjagaan sama sekali, bukan cuma aturan yang lebih longgar. Frontend: predikat assignable yang tadinya terduplikasi identik di `RegisterView.tsx` dan `clashes/[id]/page.tsx` (`u.isActive && (peran Engineer atau Coordinator)`) disatukan jadi `isAssignable()` di `src/lib/lookup.ts`. Chip filter Assignee di Register juga dipersempit ke Engineer saja (`assigneeOptions`, tidak ada lagi Coordinator/Management/Admin di daftar) — keputusan awal sesi ini adalah membiarkannya tampil semua (pola soft-delete di §5: form tulis hanya opsi valid, filter baca tetap semua), tapi diralat atas permintaan eksplisit user karena sejak migrasi data di bawah **tidak ada lagi** clash dengan assignee non-Engineer, jadi opsi Coordinator/Management/Admin di filter ini tidak akan pernah match apa pun — Engineer nonaktif tetap ditampilkan (label `(nonaktif)`, pola sama dengan `priorityOptions`/`zoneOptions`) supaya clash historis yang di-assign ke Engineer yang sudah nonaktif tetap bisa dicari. Data lama diperbaiki lewat migrasi data-only `20260806120000_null_non_engineer_assignees` (assignee non-Engineer di-`NULL`-kan) — **tanpa** baris `AuditLog` karena `actorId` adalah FK wajib dan tidak ada aktor jujur untuk migrasi sistem (memakai reporter atau admin acak = memalsukan riwayat); efeknya cukup terlihat dari row count `migrate deploy` dan diverifikasi ulang lewat query Prisma langsung (`0` clash dengan assignee non-Engineer setelah migrasi+seed). Seed (`seed.ts`, `seed-load-test.ts`) diperbarui supaya data baru selalu lahir bersih. Terverifikasi lengkap: dropdown assignee di detail & bulk-assign cuma menampilkan Engineer aktif; **dan** `fetch()` langsung dari console browser ke `PATCH /clashes/:id`/`POST /clashes/bulk` dengan `assigneeId` milik Coordinator (melewati UI sepenuhnya) → `400 Bad Request`, membuktikan aturan ditegakkan server-side, bukan cuma disembunyikan di client. Sekaligus diverifikasi ulang (tanpa kode baru) bahwa **Management** dan **Coordinator** — bukan cuma Admin/Engineer yang sudah dibuktikan sebelumnya — benar-benar bisa lintas-proyek: switcher menampilkan MCA & GSB untuk keduanya, dan Dashboard+Register berganti isi saat proyek ditukar (MCA 91 clash ↔ GSB 12 clash), tidak ada yang tersumbat. Detail RBAC di §6.
(2) **Rebrand "ClashHub" → "EPS Workspace"**, lingkup **UI + dokumentasi saja**: judul tab (`layout.tsx`), sidebar (`AppShell.tsx`), halaman login (logo alt + `<h1>`, **dan subtitle penjelasan "Web platform manajemen clash & issue koordinasi BIM" dihapus** — permintaan eksplisit, bukan cuma rename), splash loading (`page.tsx`), header PDF export, nama file export Excel/PDF (`eps-workspace-register-*`), nama file contoh import CSV/XML, display-name email pengirim (`SMTP_FROM`, alamat `noreply@clashhub.dev` **tetap** — cuma display-name yang berubah), `README.md`/`apps/api/README.md`/`HANDOFF.md` ini. **Sengaja TIDAK diubah** (keputusan sadar, bukan kelupaan — jangan "dirapikan" di sesi berikutnya): nama database `clashhub_db`/user `clashuser` di `DATABASE_URL` + kedua `docker-compose*.yml` (butuh drop/recreate DB); volume Docker `clashhub-postgres-data`/`clashhub-redis-data`/`clashhub-uploads` (data & upload jadi yatim kalau di-rename); cookie `clashhub_refresh` (semua sesi ter-logout); localStorage key `clashhub:activeProjectId` (pilihan proyek aktif ter-reset); email seed `@clashhub.dev` + tombol demo di halaman login (keduanya harus sinkron — mengubah salah satu tanpa yang lain memutus login demo); nama paket `clashhub-web`/`clashhub-api` di `package.json`+lockfile+`.claude/launch.json`+`container_name` Docker; fixture email di semua `*.spec.ts` dan `load-test/common.js`; metadata SEO `description` di `layout.tsx` (permintaan #4 spesifik ke halaman login, ini tidak tampil di halaman manapun); `public/logo.png` (grafis murni, tidak ada wordmark teks di dalamnya, sudah dicek). Dokumen sumber `ClashHub_PRD.md`/`ClashHub_ERD.md`/`ClashHub_Sprint_Plan.md` **tidak diubah dan tidak di-rename** — dokumen historis, ditulis sebelum rebrand, dan me-rename filenya akan memutus glob `ClashHub_*.md` di `.dockerignore`; cukup dicatat di sini bahwa nama produk berubah setelah dokumen-dokumen itu ditulis. Verifikasi otomatis (backend 103 test/12 suite [96 lama + 7 baru], frontend 36 test [31 lama + 5 baru], build & lint bersih di kedua sisi, baseline warning tidak berubah) dan live browser (screenshot login/sidebar menampilkan "EPS Workspace", subtitle hilang) — lihat §12 untuk baseline lama yang dibandingkan.

**Update ke-14 (buat proyek baru dari UI, di luar Sprint Plan asli):** Sebelum sesi ini, tidak ada cara membuat proyek baru selain lewat Prisma/seed langsung — `/admin/projects` cuma bisa rename proyek aktif dan kelola anggota, dan menampilkan pesan eksplisit "buat proyek baru lewat database/seed" kalau `projects.length === 0`. Sekarang ada `POST /projects` (Admin-only, `CreateProjectDto { name, code }` — `code` 2-6 karakter alfanumerik, di-uppercase & di-trim, harus unik lewat `ProjectsService.create()`, `409` kalau `code` sudah dipakai) + form "Buat Proyek Baru" di `/admin/projects` (`createProject()` baru di `data-context.tsx`, pola sama dengan `createUser`). Proyek baru lahir **kosong** (tanpa `Discipline`/`Zone`/`ProjectMember` — `Priority`/`Status` global otomatis ikut) dan **langsung jadi proyek aktif** di frontend supaya admin bisa lanjut setup: salin disiplin/zona lewat `POST /master-data/templates/copy` yang sudah ada (dialog "Salin dari proyek lain" di `/admin/master-data`), lalu tambah anggota lewat form yang sudah ada di halaman yang sama. 2 unit test baru (`projects.service.spec.ts`, file baru — sebelumnya tidak ada test untuk `ProjectsService` sama sekali): create sukses dengan normalisasi kode, dan `409` untuk kode duplikat. Terverifikasi live: login Admin, buat proyek baru dari form, proyek langsung muncul di switcher sidebar dan jadi aktif, klik "Salin dari proyek lain" + tambah anggota berhasil.

**Update ke-12 (multi-project authorization, di luar Sprint Plan asli):** Sebelum sesi ini, `ProjectMemberGuard` memang ada tapi **tidak pernah dipasang di rute mana pun** (lihat riwayat di §5 "Koreksi ProjectMemberGuard") dan setiap service memakai `currentProject()` = "proyek tertua" — artinya ClashHub secara runtime terkunci ke satu proyek meski schema Prisma (`Project`/`ProjectMember`) sudah dirancang multi-project sejak awal. Sekarang: guard baru `ProjectContextGuard` (menggantikan `ProjectMemberGuard`, file lama dihapus) dipasang **global** sebagai `APP_GUARD` — membaca header `X-Project-Id`, deny-by-default (WAJIB ada header kecuali rute ditandai `@SkipProjectScope()`), dan menaruh `projectId` terverifikasi di `request.activeProjectId` lewat decorator `@ActiveProject()`. Role ADMIN/MANAGEMENT/COORDINATOR bypass cek keanggotaan (`CROSS_PROJECT_ROLES` di `common/constants/project-roles.ts`) — **hanya ENGINEER** yang benar-benar dibatasi ke proyek yang di-assign lewat `ProjectMember`. Setiap query per-proyek (clash, disiplin, zona, import job) sekarang di-scope oleh `projectId` ini, bukan "proyek tertua" lagi; resource-level check baru (`assertClashInProject`) mengembalikan 404 (bukan 403) untuk clash yang ada tapi bukan di proyek aktif, supaya tidak bocor keberadaan data proyek lain. Frontend dapat project switcher sungguhan (sebelumnya dropdown yang selalu `disabled`) di sidebar `AppShell.tsx` dan Dashboard, plus UI kelola anggota proyek baru di `/admin/projects`. Seed sekarang punya **dua** proyek (`proj-1`/MCA yang lama + `proj-2`/GSB baru, 12 clash, 3 anggota) untuk membuktikan isolasi. Detail lengkap di §5 "Otorisasi multi-project (update ke-12)". **Update ke-11 (Sprint 11 — Hardening, Performa & Observability):** helmet, rate limiting (global 600/menit per IP + `/auth/login` 5/menit, diverifikasi live), global exception filter (Prisma error dipetakan ke status HTTP yang benar, tidak bocor ke client), validasi env Joi saat boot (gagal cepat dengan pesan jelas, bukan gagal senyap di query pertama), refresh token *versioned* (logout benar-benar meng-invalidate token lama, bukan cuma hapus cookie browser), gap RBAC nyata di download lampiran diperbaiki (ditemukan: `ProjectMemberGuard` ternyata tidak pernah dipasang di rute mana pun sejak awal — lihat §5 "Koreksi ProjectMemberGuard"), logging terstruktur (pino, redact token/cookie), Sentry opsional (no-op tanpa `SENTRY_DSN`), `GET /health/ready` (DB+Redis, terpisah dari `/health` yang cuma DB), kredensial demo hilang dari bundle produksi (dead-code elimination via `NODE_ENV`, bukan env var baru), `npm audit`+`gitleaks` di CI. Uji beban k6 sungguhan terhadap 10.091 clash (proyek demo + 10rb baris bertanda `externalId: 'loadtest-*'`, sepenuhnya reversibel, sudah dibuktikan) — **ketiga target NFR PRD lolos nyaman**: Register p95=88ms (target 1000ms), Dashboard p95=167ms (target 3000ms), Export p95=1.03s (target 10s); index tambahan & refactor `metrics()` ke SQL dievaluasi lewat `EXPLAIN ANALYZE` dan **tidak** ditambahkan karena tidak ada bukti manfaat di skala target — didokumentasikan sebagai keputusan sadar, bukan diabaikan. **Deploy ke host nyata sengaja tidak dikerjakan** (tidak ada target infrastruktur) — hanya artefak & dokumentasi (`docker-compose.prod.yml` sudah ada dari Tahap A, `scripts/backup-db.sh` baru & terverifikasi, dokumen deploy/rollback baru di §13). Detail lengkap di §12. **Update ke-10 (Tahap A — menutup utang infrastruktur Sprint 0):** ditemukan bahwa `npm --prefix apps/api run lint` gagal total sejak awal proyek (`apps/api` tidak pernah punya `eslint.config.mjs`) — sekarang ada (`apps/api/eslint.config.mjs`, flat config ESLint 10 + typescript-eslint), lint backend **hijau** (0 error, 6 warning bawaan `fast-xml-parser` yang untyped) setelah memperbaiki 5 temuan nyata (unused import di `clashes.service.ts`, double-cast berlebih & floating promise di `import.processor.ts`/`main.ts`, `no-base-to-string` di `xml.parser.ts`, async-tanpa-await di `whatsapp.service.ts`) — 79 test backend tetap lulus setelahnya. Ditambahkan `.github/workflows/ci.yml` (job `web`/`api`/`docker`, belum pernah jalan sungguhan di GitHub karena belum di-push) dan Dockerfile produksi (`Dockerfile` root + `apps/api/Dockerfile`, multi-stage, image non-root) — **keduanya sudah dibangun dan dijalankan lokal di sesi ini** (web: `server.js` boot dan `/login` merespons 200; api: Nest app boot penuh sampai semua module ter-inisialisasi). Worktree nyasar `.claude/worktrees/fervent-gauss-19c30b` yang membuat `npm run lint` root melaporkan ribuan error palsu sudah dihapus (`git worktree remove`), dan `.claude/**` ditambahkan ke ignore lint root sebagai sabuk pengaman. `apps/api/.env.example` sekarang ter-track git (sebelumnya tertelan `.gitignore`'s `.env*`). Lihat §12 untuk detail lengkap & yang masih di luar scope (uji beban, hardening keamanan). **Update ke-9:** Sprint 9 backend (`ImportModule`: `/import/preview`+`/import/commit`+`/import/jobs/:id` via BullMQ, parser CSV & XML/Navisworks/Solibri, dedup by `externalId`, auto-create master data Admin-only) dan `POST /master-data/templates/copy` selesai + 31 unit test baru (79 total) + terverifikasi live lewat browser (upload → mapping → commit → progress → audit log `"imported"` → dedup re-import → error report → auto-create sebagai Admin → import XML). Menemukan & memperbaiki satu bug nyata di jalur ini: frontend `auditText()` belum punya case untuk action `"imported"`, hasilnya `"Priadi mengubah dari \"undefined\" ke \"undefined\""` — lihat §5 "Impor massal" dan §9. **Update ke-8:** Sprint 5/8 (notifikasi email+WhatsApp async) yang di update ke-7 baru lolos unit test, sekarang **sudah diverifikasi end-to-end dengan Redis/MailHog/Postgres benar-benar hidup** (Docker bisa diakses di sesi ini, beda dari sesi sebelumnya) — assign clash → email masuk MailHog, ubah status → email ke assignee+reporter, toggle WhatsApp di preferensi → baris `Notification(channel=WHATSAPP, isSent=true)` tanpa fallback email, `OverdueScannerService.scan()` dijalankan manual 2x lewat `NestFactory.createApplicationContext` → 44 notifikasi baru lalu 0 di run kedua (dedup harian bekerja). Detail lengkap ada di §5 "Notifikasi async" (tidak berubah) — hanya status verifikasi yang naik dari "belum" ke "sudah". **Update ke-7** (sebelumnya): Sprint 5 (email async via BullMQ+MailHog) dan Sprint 8 (WhatsApp mock + preferensi kanal via API) selesai — lihat §5 "Notifikasi async: email (MailHog) + WhatsApp (mock)". **Update ke-6** (sebelumnya): lampiran (`Attachment`) pindah dari client-only/sesi-only ke object storage nyata di server (`StorageService`, disk lokal, S3/R2-ready) — lihat §5 "Lampiran: object storage lokal", juga menghilangkan batasan lama "pratinjau tidak tersedia setelah reload".
**Lokasi proyek:** `D:\WebApp`

Dokumen ini untuk melanjutkan pengerjaan di sesi/chat baru. Baca ini dulu sebelum menulis kode.

> **Menjalankan sekarang butuh DUA server:** API di `localhost:3001` (`npm --prefix apps/api run start:dev`) dan web di `localhost:3000` (`npm run dev`). Keduanya terdaftar di `.claude/launch.json`. Tanpa API hidup, login gagal dan seluruh master data kosong.

---

## 1. Konteks

EPS Workspace (nama sebelumnya "ClashHub" — lihat update rebrand di bawah) adalah web platform manajemen clash & issue koordinasi BIM. Dokumen sumber ada di repo (ditulis sebelum rebrand, masih memakai nama "ClashHub" di judul/isi — file **tidak** di-rename, lihat alasan di bawah):

| Dokumen | Isi |
|---|---|
| `ClashHub_PRD.md` | Product Requirements — persona, user story, acceptance criteria, NFR |
| `ClashHub_ERD.md` | Entity Relationship Diagram (PostgreSQL) |
| `ClashHub_Sprint_Plan.md` | 12 sprint (0–11) + prompt siap-pakai per sprint |

**Update ke-5 (server-side pagination + agregasi dashboard):** `GET /clashes` menerima query params (`q`, `disc`/`stat`/`prio`/`zone`/`assignee`, `reporterId`, `cf`/`ct`, `overdue`, `sort`, `dir`, `page`, `pageSize`) dan mengembalikan `{ data, total }` — filter/sort/pagination Register sekarang dihitung Prisma, bukan array JS di browser. Endpoint baru `GET /clashes/metrics` menghitung KPI/tren mingguan/sebaran dashboard di server (port dari `computeMetrics()` di `dashboard-metrics.ts`), jadi `DashboardView` tidak lagi butuh seluruh array clash. Konsekuensi arsitektur: `DataContext` **berhenti memuat semua clash di bootstrap** — `master.clashes` (array) diganti `master.clashesById` (cache kecil, terisi on-demand oleh `loadClashDetail`/`createClash`/`updateClashField`). Register, Dashboard, dan "Clash Saya" masing-masing fetch sendiri dari `/clashes`; hanya halaman detail clash yang masih memakai `clashesById`. Lihat §5 "Clashes tidak lagi di-bulk-load" untuk detail lengkap.

**Update sejak handoff ke-3 (`ClashesModule`):** clash, komentar, dan audit log pindah dari `localStorage` ke NestJS + PostgreSQL. Backend baru: `apps/api/src/clashes/` (`ClashesController`/`ClashesService`/DTO) dengan 6 endpoint (list, detail, create, update, bulk update, comment) dan RBAC penuh di service layer — bukan cuma `@Roles()` — termasuk aturan "Engineer hanya boleh edit item sendiri" dan "Engineer hanya boleh maju status 1 langkah, tidak boleh menutup". Audit log dan `uniqueCode` sekarang dibuat server-side (tidak bisa dipalsukan client). Index `Clash` yang tadinya satu composite 8-kolom diganti 4 index yang benar-benar dipakai. Frontend: `data-context.tsx` tidak lagi menyimpan clash/komentar/audit di localStorage; `mock-data.ts` **dihapus total**; `localStorage` sekarang hanya berisi lampiran (sesi-only) dan preferensi notifikasi.

**Update sebelumnya (handoff ke-2/3, Sprint 1):** backend NestJS di `apps/api/` jadi backend resmi. AuthModule (JWT access 15m + refresh 7d di cookie `httpOnly`, password argon2id), `RolesGuard` + `@Roles()` + `ProjectMemberGuard` (klaim "benar-benar dipakai oleh route clash" di sini ternyata **tidak akurat** — dikoreksi di update ke-11, lihat §5 "Koreksi ProjectMemberGuard"), modul `users`/`projects`/`master-data`. Frontend punya lapisan `src/lib/api/`.

Sebelumnya (handoff ke-2): seluruh deliverable frontend dibangun — Admin panel, bulk update + export Excel/PDF, Pengaturan Notifikasi, wizard Import CSV, dan master data yang mutable.

---

## 2. Tech stack aktual

**Frontend** (root, port 3000)
```
Next.js 16.2.12 (App Router, Turbopack)  ·  React 19.2.4  ·  TypeScript strict
Tailwind CSS 4  ·  TanStack Table 8  ·  Recharts 3.10  ·  Zod 4
xlsx (SheetJS)  ·  jspdf + jspdf-autotable
```

**Backend** (`apps/api/`, port 3001, prefix `/api`)
```
NestJS 11  ·  Prisma 6  ·  PostgreSQL 16 (Docker)  ·  passport-jwt + @nestjs/jwt
@node-rs/argon2  ·  class-validator  ·  Jest
```

Redis 7 ada di `docker-compose.yml` tapi **belum dipakai** — BullMQ baru relevan di Sprint 5 (notifikasi async).

`@node-rs/argon2` dipakai, bukan paket `argon2`, karena mendistribusikan binary prebuilt sehingga tidak butuh node-gyp/Build Tools di Windows.

---

## 3. Struktur file

```
src/
├── app/
│   ├── layout.tsx              DataProvider → AuthProvider → AppShell (urutan penting, lihat §5)
│   ├── page.tsx                redirect / → /register atau /login
│   ├── login/page.tsx
│   ├── register/page.tsx       → RegisterView (filter, sort, bulk update, export)
│   ├── dashboard/page.tsx      → DashboardView
│   ├── my-clashes/page.tsx
│   ├── import/page.tsx         wizard CSV: upload → mapping → preview & commit
│   ├── settings/notifications/page.tsx
│   ├── admin/
│   │   ├── users/page.tsx      CRUD user + toggle aktif + ubah peran
│   │   ├── projects/page.tsx   edit nama/kode proyek AKTIF + kelola anggota proyek
│   │   │                       (tambah/hapus, update ke-12 — sebelumnya single-project,
│   │   │                       "anggota" cuma hitung semua user aktif; lihat §5)
│   │   └── master-data/page.tsx  tab Disiplin/Zona/Prioritas/Status
│   └── clashes/
│       ├── new/page.tsx        form input + upload lampiran SUNGGUHAN (File asli, object URL);
│       │                       konstanta MAX_FILE_MB/MAX_FILES/validateAttachmentFile diekstrak
│       │                       ke lib/attachments.ts sejak update ke-16 (dipakai bareng
│       │                       AttachmentPanel), sisanya (dropzone staged-file) tetap di sini
│       │                       karena siklus hidupnya beda (upload SETELAH clash dibuat)
│       └── [id]/page.tsx       detail, triase, komentar (SEMUA peran termasuk Management sejak
│                                update ke-16 — canComment() dihapus), audit trail, tab Lampiran
│                                (delegasi ke AttachmentPanel), tombol Hapus clash di "Zona
│                                berbahaya" (Admin-only, update ke-16)
├── components/
│   ├── AppShell.tsx             sidebar + nav (nav & menu Admin difilter per peran) + project
│   │                             switcher SUNGGUHAN (update ke-12 — sebelumnya cuma teks nama
│   │                             proyek, tidak pernah dropdown fungsional)
│   ├── Badge.tsx
│   ├── clashes/                 BARU (update ke-16) — semua UI siklus-hidup clash/lampiran/markup
│   │   ├── DeleteClashDialog.tsx      konfirmasi hapus, wajib ketik ulang kodeUnik
│   │   ├── AttachmentPanel.tsx        tab Lampiran penuh: dropzone upload + kartu lampiran +
│   │   │                              tombol Hapus (per-kartu, hanya utk pengunggah sendiri
│   │   │                              atau Coordinator/Admin) + trigger buka AttachmentPreviewModal
│   │   ├── AttachmentPreviewModal.tsx modal pratinjau: zoom/pan (transform di wrapper
│   │   │                              `contentRef`, BUKAN di <img>/<canvas> langsung — lihat
│   │   │                              §5), navigasi panah, refresh signed-URL proaktif, host
│   │   │                              AnnotationLayer + AnnotationToolbar + PdfPageCanvas,
│   │   │                              tombol "Unduh dengan markup" (flatten client-side)
│   │   ├── AnnotationLayer.tsx        overlay SVG: render shape per anotasi, draw draft,
│   │   │                              handleMouseDown WAJIB preventDefault (lihat §8/§9.29 —
│   │   │                              tanpa ini input teks tidak bisa diketik sama sekali)
│   │   ├── AnnotationToolbar.tsx      tool select/pan/rect/arrow/freehand/text + color picker;
│   │   │                              select/pan SELALU tampil (termasuk Management), tool
│   │   │                              menggambar+warna cuma kalau canDraw
│   │   └── PdfPageCanvas.tsx          render 1 halaman PDF ke <canvas> via pdfjs-dist, HANYA
│   │                                  dimuat lewat next/dynamic({ ssr:false }) — jangan pernah
│   │                                  di-import statis (lihat §5/§9.28)
│   ├── register/
│   │   ├── RegisterView.tsx     filter/sort/pagination server-side (fetch /clashes per
│   │   │                        perubahan filter, debounced); export fetch semua-cocok on-demand
│   │   ├── FilterChips.tsx      chip group (memoized)
│   │   └── BulkToolbar.tsx      toolbar bulk update + modal konfirmasi
│   └── dashboard/
│       ├── DashboardView.tsx    fetch /clashes/metrics (server hitung KPI/tren/sebaran)
│       ├── ChartPieces.tsx
│       └── viz-tokens.ts
└── lib/
    ├── api/                      LAPISAN BARU (Sprint 1)
    │   ├── client.ts             apiFetch/apiGet/apiPost/apiPatch/apiDelete, login, logout,
    │   │                         restoreSession. Access token disimpan DI MEMORI
    │   │                         (bukan localStorage). Retry sekali lewat /auth/refresh saat 401.
    │   ├── mappers.ts            SATU-SATUNYA tempat terjemahan Inggris ↔ Indonesia — +
    │   │                         toAnnotation/annotationPayload sejak update ke-16
    │   └── types.ts              bentuk respons API mentah (name/role/weight/sequence) — +
    │                             ApiAnnotation, +ApiClash.deletedAt sejak update ke-16
    ├── types.ts                 tipe domain — +Clash.deletedAt sejak update ke-16 (sisanya
    │                             tidak berubah sejak Sprint 1)
    ├── annotations.ts            BARU (update ke-16) — modul geometri MURNI (tanpa React/API):
    │                             toPixels/fromPixels (normalisasi [0,1] ↔ px pada PageBox aktif,
    │                             dipakai overlay SVG DAN flatten canvas supaya keduanya tidak
    │                             pernah berbeda), strokeWidthPixels (skala berdasar LEBAR saja,
    │                             biar garis tidak melar di halaman non-persegi),
    │                             simplifyFreehand (Ramer–Douglas–Peucker sebelum kirim ke server),
    │                             arrowHeadPoints (dipakai bareng oleh AnnotationLayer & canvas
    │                             flattener biar bentuk panahnya identik)
    ├── use-signed-url.ts         BARU (update ke-16) — hook fetch+refresh proaktif signed URL
    │                             1 lampiran, dipakai AttachmentPreviewModal & (tidak langsung)
    │                             kartu thumbnail di AttachmentPanel. Retry dari <img onError>
    │                             dibatasi SEKALI PER attachmentId (bukan reset tiap fetch
    │                             sukses) — lihat §8 16a kalau lupa kenapa itu penting
    ├── attachments.ts            BARU (update ke-16) — MAX_FILE_MB/MAX_FILES/ACCEPTED_TYPES/
    │                             validateAttachmentFile diekstrak dari clashes/new/page.tsx,
    │                             dipakai bareng AttachmentPanel
    ├── dashboard-metrics.ts      computeMetrics() TIDAK DIPAKAI DashboardView lagi (server yang
    │                             hitung sejak update ke-5) — sengaja dipertahankan sbg fungsi
    │                             murni untuk unit test (lihat §12); resolveRange/RANGE_PRESETS
    │                             masih dipakai untuk UI range picker & WEEK_LABEL diekspor utk mappers.ts
    ├── data-context.tsx          master data dari API; clashesById (BUKAN array, lihat §5) sbg
    │                             cache kecil on-demand utk clash; hanya preferensi notifikasi
    │                             yang masih dibaca via API di sini (attachments SUDAH server-side
    │                             sejak update ke-6, anotasi SENGAJA tidak masuk context sama
    │                             sekali — lihat §5 update ke-16). Sejak update ke-12: `projects:
    │                             Project[]` + `setActiveProject()`. Sejak update ke-16:
    │                             `deleteClash`, `uploadAttachments`, `deleteAttachment` baru —
    │                             anotasi TIDAK di sini (state lokal modal, lihat §5)
    ├── auth-context.tsx          auth ASLI — login/refresh/logout ke API
    ├── use-master-data.ts        hook lookup (disciplineById dst.) terikat ke array live
    ├── use-require-auth.ts       guard route (login wajib)
    ├── use-require-admin.ts      guard route (Admin-only, redirect ke /register)
    ├── lookup.ts                 helper murni: format tanggal/bytes, canEditClash,
    │                             canDeleteClash/canUploadAttachment/canDeleteAttachment/
    │                             canDrawAnnotation/canEditAnnotation (semua BARU update ke-16).
    │                             `canComment` DIHAPUS update ke-16 — semua peran boleh komentar,
    │                             tidak ada lagi gating sama sekali (jangan ditambah balik)
    ├── dashboard-metrics.ts       agregasi KPI/tren/sebaran (nerima master data sbg parameter)
    ├── export.ts                  exportClashesToExcel, exportClashesToPdf
    └── csv.ts                     parser CSV minimal untuk wizard import

apps/api/src/
├── main.ts                       setGlobalPrefix('api') + cookieParser + ValidationPipe
├── app.module.ts                 JwtAuthGuard, RolesGuard, & ProjectContextGuard (update ke-12)
│                                 didaftarkan sbg APP_GUARD global, urutan ini penting (lihat §5)
├── auth/                         login/refresh/logout/me, JwtStrategy, AuthService
├── common/
│   ├── decorators/               @Public(), @Roles(), @CurrentUser(), @SkipProjectScope() +
│   │                             @ActiveProject() (keduanya baru, update ke-12)
│   ├── guards/                   JwtAuthGuard, RolesGuard, ProjectContextGuard (update ke-12 —
│   │                             menggantikan ProjectMemberGuard yang dihapus total, bukan lagi
│   │                             cuma didefinisikan-tapi-tidak-dipasang; lihat §5)
│   ├── constants/project-roles.ts  CROSS_PROJECT_ROLES (ADMIN/MANAGEMENT/COORDINATOR — update ke-12)
│   └── user.view.ts              serializer user (passwordHash tidak pernah ikut)
├── users/  ·  projects/  ·  master-data/     controller + service + dto — projects/ sekarang juga
│                             endpoint membership (`GET/POST/DELETE /projects/:projectId/members`,
│                             Admin-only, update ke-12)
├── clashes/                      clash + komentar + audit log + lampiran + anotasi (markup, BARU
│   │                             update ke-16 — modul terbesar di backend sekarang)
│   ├── clashes.controller.ts     GET /clashes (+ `deleted=1` Admin-only utk lihat clash
│   │                             terhapus, update ke-16), GET /clashes/metrics (HARUS
│   │                             didaftarkan sebelum GET /:id — lihat komentar di file),
│   │                             GET /:id, POST, PATCH /:id, **DELETE /:id + POST
│   │                             /:id/restore (BARU update ke-16, Admin-only)**, POST /bulk,
│   │                             POST /:id/comments (sekarang MANAGEMENT juga boleh, update
│   │                             ke-16), POST /:id/attachments, GET /:clashId/attachments/:id/
│   │                             download, GET .../signed-url, GET .../signed (@Public,
│   │                             update ke-15), **DELETE /:clashId/attachments/:attachmentId
│   │                             (BARU update ke-16)** — semuanya menerima `@ActiveProject()
│   │                             projectId` (update ke-12)
│   ├── clashes.service.ts        RBAC per-field, generator uniqueCode, audit log server-side,
│   │                             list() (where/orderBy/skip/take Prisma, sekarang selalu
│   │                             di-spread `NOT_DELETED` kecuali `deleted=1`), metrics() (port
│   │                             dari computeMetrics() frontend — keduanya harus tetap sinkron),
│   │                             applyPatch() memanggil NotificationsService setelah commit
│   │                             (assigned/status_change) — lihat §5 "Notifikasi async".
│   │                             `assertClashInProject()` (update ke-12, SEKARANG `findFirst`
│   │                             + `NOT_DELETED` bukan `findUnique` — update ke-16) menggantikan
│   │                             semua akses `prisma.clash.findUnique` telanjang — lihat §5.
│   │                             `softDelete()`/`restore()` baru (update ke-16). `deleteAttachment()`
│   │                             baru (update ke-16) — hard-delete baris + `tx.annotation.
│   │                             deleteMany` + unlink disk fire-and-forget. `assertAttachmentInClash()`
│   │                             sekarang `public` (dulu `private`) supaya `AnnotationsService`
│   │                             bisa pakai ulang scoping yang sama (update ke-16)
│   ├── clash-scope.ts             BARU (update ke-16) — SATU-SATUNYA definisi `NOT_DELETED`
│   │                             (`{ deletedAt: null }`), file terpisah (bukan di dalam service)
│   │                             supaya `overdue-scanner.service.ts`/`notifications.processor.ts`
│   │                             bisa impor tanpa circular dependency ke ClashesModule
│   ├── annotations.controller.ts  BARU (update ke-16) — nested di bawah
│   │                             `:clashId/attachments/:attachmentId/annotations`, GET tanpa
│   │                             `@Roles()` (markup dibagikan ke semua peran termasuk
│   │                             Management), POST/PATCH/DELETE `@Roles(ENGINEER, COORDINATOR,
│   │                             ADMIN)`
│   ├── annotations.service.ts     BARU (update ke-16) — `parseGeometry()` memvalidasi tiap
│   │                             angka finite & di [0,1] per-kind (RECT/ARROW/FREEHAND/TEXT),
│   │                             cap 2000 titik freehand + 64KB payload — validasi INI wajib
│   │                             di service karena discriminated union di atas kolom `Json`
│   │                             tidak bisa diekspresikan lewat class-validator.
│   │                             `assertOwnerOrCoordinator()` — pembuat sendiri atau
│   │                             Coordinator/Admin, pola identik `assertCanDeleteAttachment()`
│   │                             di `clashes.service.ts`
│   ├── dto/annotation.dto.ts      BARU (update ke-16) — `geometry` cuma divalidasi `@IsObject()`
│   │                             di level DTO (isi per-kind divalidasi di service, lihat atas)
│   └── clashes.service.spec.ts   test: RBAC, transisi status, closedAt, audit, uniqueCode,
│                                  list()/metrics(), attachment, +isolasi proyek (update ke-12),
│                                  +soft-delete/restore/deleteAttachment (update ke-16) —
│                                  ditambah `annotations.service.spec.ts` baru terpisah
├── testing/                      BARU (update ke-12): project-isolation.e2e-spec.ts — satu-satunya
│                             test di repo ini yang lewat HTTP sungguhan (supertest + Nest
│                             TestingModule, Prisma tetap di-mock), lihat §5. Mock `clash`-nya
│                             ditambah `findFirst` sejak update ke-16 (`assertClashInProject`
│                             pindah dari `findUnique`)
├── storage/                      StorageService — file lampiran ke disk lokal (S3/R2-ready),
│                                  lihat §5 "Lampiran: object storage lokal". `delete(key)` baru
│                                  (update ke-16) — proteksi path traversal via `path.resolve`
│                                  + cek prefix, `force:true` (file hilang = no-op), TANPA
│                                  `recursive:true` (key yang salah arah ke direktori harus
│                                  gagal, bukan menghapus seluruh folder clash)
├── notifications/                BullMQ producer (NotificationsService) + consumer
│   │                             (NotificationsProcessor), EmailService (nodemailer + MailHog),
│   │                             WhatsAppService (WhatsAppProvider interface + mock),
│   │                             OverdueScannerService (cron harian 07:00),
│   │                             NotificationPreferenceController/Service (GET/PATCH /me,
│   │                             @SkipProjectScope() sejak update ke-12 — bukan data proyek) —
│   │                             lihat §5 "Notifikasi async"
└── prisma/                       PrismaService
```

**localStorage sekarang tidak dipakai sama sekali** — preferensi notifikasi (item terakhir yang masih client-only) pindah ke API di update ke-7. `clashhub-data-v5` tidak lagi dibaca/ditulis; kode hidrasinya sudah dihapus dari `data-context.tsx`, bukan sekadar dikosongkan. Key `clashhub-auth-user-id` **sudah tidak dipakai** — sesi sekarang bersandar pada cookie `httpOnly` `clashhub_refresh`.

---

## 4. Akun demo

Password untuk semua akun: **`demo1234`** — sekarang password asli, di-hash argon2id di database. Password salah ditolak 401.

| Peran | Email |
|---|---|
| Engineer | `engineer@clashhub.dev` |
| Coordinator | `coordinator@clashhub.dev` |
| Management | `management@clashhub.dev` |
| Admin | `admin@clashhub.dev` |

User tambahan: `rizky@clashhub.dev` (Engineer), `putri@clashhub.dev` (Coordinator).

Admin bisa membuat user baru dari `/admin/users`; user itu tersimpan di database dengan password default `demo1234` dan **langsung bisa login** (sudah diverifikasi end-to-end).

**Reset data demo (frontend):**
```js
localStorage.clear(); location.reload();   // hanya lampiran & preferensi notifikasi sekarang
```
Ini **tidak lagi menghapus clash** — clash ada di database. Untuk reset clash, hapus baris di tabel `Clash`/`Comment`/`AuditLog` lalu jalankan ulang `npx prisma db seed` (idempoten via `upsert` untuk master data; seeding clash **dilewati** kalau tabel `Clash` sudah tidak kosong — lihat `seedClashes()` di `apps/api/prisma/seed.ts`).

---

## 5. Arsitektur data — baca ini sebelum mengubah apa pun

### Fase hybrid sudah berakhir untuk domain inti

Sampai sebelum update ke-4, clash/komentar/audit log ada di `localStorage`. Sekarang semuanya dari API:

| Dari API (PostgreSQL) | Masih di `localStorage` |
|---|---|
| `project`, `users`, `disciplines`, `zones`, `statuses`, `priorities`, `clashes`, `comments`, `auditLogs` | `attachments`, `notificationPreferences` |

Sisa dua yang masih lokal masing-masing menunggu prasyaratnya sendiri: `attachments` menunggu object storage (schema `Attachment.fileUrl` sudah ada, belum ada yang mengisi — lihat §5 "Lampiran" di bawah), `notificationPreferences` menunggu modul notifikasi (Sprint 5/8, butuh Redis + BullMQ).

**Id master data BUKAN uuid — jangan pakai `@IsUUID()` untuk field yang mereferensikannya.** `apps/api/prisma/seed.ts` sengaja memakai id eksplisit (`proj-1`, `u-eng`, `disc-ars`, `st-open`, `pr-low`, `zone-1`, …) supaya seed idempoten dan gampang dibaca, bukan uuid acak. `Clash.disciplineId`/`zoneId`/`priorityId`/`statusId` dan `assigneeId` (user id) semuanya bisa berisi id seed non-uuid ini. `ClashesModule`'s DTO (`clash.dto.ts`) memakai `@IsString() @MinLength(1)` untuk field-field itu — **ini sempat bug** (awalnya pakai `@IsUUID()` dan menolak semua data seed dengan pesan "Disiplin/Zona/Prioritas tidak valid", ketahuan saat verifikasi browser). Kalau menambah DTO baru yang mereferensikan master data, jangan validasi sebagai uuid. Id `Clash`/`Comment`/`AuditLog`/`User`/`Project` baru (dibuat lewat API, bukan seed) tetap uuid asli dari `@default(uuid())` Prisma.

### Master data dibaca lewat useData(), bukan konstanta

- Untuk MEMBACA master data di komponen: pakai `useData()` (array live: `disciplines`, `zones`, `statuses`, `priorities`, `users`, `project`, `clashes`, `comments`, `auditLogs`) atau `useMasterDataLookups()` dari `use-master-data.ts`.
- `mock-data.ts` **sudah dihapus**. Kalau menemukan kode yang masih mengimpornya, itu sisa lama — hapus, jangan dikembalikan.

### Provider order penting (dan alurnya sekarang lebih halus)

`layout.tsx`: `DataProvider` membungkus `AuthProvider` (bukan sebaliknya) — **tetap seperti sebelumnya, jangan dibalik**.

Karena semua endpoint master data butuh token, urutan bootstrap-nya jadi:
1. `AuthProvider` mount → `restoreSession()` (POST `/api/auth/refresh` pakai cookie `httpOnly`).
2. Kalau ada sesi → panggil `reloadMasterData()` milik DataContext. Kalau tidak → `clearMasterData()`.
3. `DataContext.isLoading` baru `false` setelah salah satu dari keduanya dipanggil.

Jadi arah ketergantungannya: **auth memanggil data**, sesuai nesting provider-nya. Perilaku lama tetap dipertahankan:
1. User yang baru dibuat Admin bisa langsung login.
2. Kalau Admin menonaktifkan user yang sedang login, sesinya otomatis ter-logout (`user` di-derive dari `users.find(...).isActive`). Server juga menolak refresh untuk akun nonaktif, jadi penegakannya sekarang di dua sisi.

### Penulisan master data: optimistic + debounce 500ms

Halaman `/admin/master-data` memanggil `updateDiscipline(...)` dari `onChange` **setiap ketikan**. Kalau tiap keystroke jadi satu PATCH, itu badai request. Polanya sekarang: state lokal diperbarui seketika (optimistic), PATCH-nya di-coalesce dan ditunda 500ms (`PATCH_DEBOUNCE_MS`). Sudah diverifikasi: mengetik 19 karakter → **1** PATCH.

Kalau PATCH gagal, `data-context` menaruh pesannya di `syncError` dan menarik ulang data dari server (membatalkan perubahan optimistic). `AppShell` menampilkan `syncError` sebagai banner merah — jangan dihapus, itu satu-satunya cara kegagalan tulis terlihat user.

### Soft-delete, bukan hard-delete

`Discipline`, `Zone`, `Priority` punya field `isActive`. Admin "menghapus" via toggle nonaktif, bukan hapus permanen — supaya clash lama yang mereferensikan id itu tidak orphan. Konsekuensinya:
- Form input clash baru (`/clashes/new`) dan wizard import hanya menampilkan opsi **aktif**.
- Filter chip di Register menampilkan **semua** (termasuk nonaktif, diberi label "(nonaktif)") supaya item lama tetap bisa dicari.
- `Status` **tidak** punya `isActive` dan **tidak bisa** ditambah/dihapus dari Admin — cuma label & `isClosedState` yang bisa diubah. Alasan: `allowedStatusTransitions()` di `use-master-data.ts` bergantung pada `urutan` (4 tahap tetap) dan `isClosedState` (bukan lagi nama string — sudah diperbaiki supaya rename status "Closed" tidak merusak RBAC).

### ClashesModule: pola integrasi, mutator sekarang async

Clash, komentar, dan audit log mengikuti pola yang sama persis dengan Sprint 1 (tipe di `api/types.ts` → mapper di `api/mappers.ts` → context) tapi dengan satu perbedaan penting: **`createClash`, `updateClashField`, `bulkUpdateClashes`, dan `addComment` sekarang mengembalikan `Promise`**, bukan langsung memberi hasil sinkron. Semua call site sudah di-`await` (lihat `clashes/new/page.tsx`, `clashes/[id]/page.tsx`, `RegisterView.tsx`, `import/page.tsx`) — kalau menambah call site baru, jangan lupa `await`/`.catch()`, atau state UI (mis. tombol "Menerapkan…") tidak akan pernah sempat tampil.

**`GET /clashes` sekarang filter/sort/pagination server-side (update ke-5).** Query params: `q`, `disc`/`stat`/`prio`/`zone`/`assignee` (csv id), `reporterId`, `cf`/`ct` (tanggal, `YYYY-MM-DD`), `overdue` (`1`), `sort`, `dir`, `page`, `pageSize` (default 10, maks 10000). Respons `{ data, total }`. `RegisterView.tsx` mem-fetch endpoint ini langsung (debounced ~250ms per perubahan filter) alih-alih memfilter array lokal. Export (Excel/PDF) memanggil endpoint yang sama dengan `pageSize=10000` untuk mendapat seluruh hasil filter tanpa paginasi — makanya tombol export sekarang **async** dan bisa gagal (lihat `fetchAllMatching()` di `RegisterView.tsx`).

### Clashes tidak lagi di-bulk-load (update ke-5)

Sebelum update ke-5, `DataContext` memuat **seluruh** clash sekali di bootstrap (`master.clashes: Clash[]`) dan membaginya ke semua konsumen. Ini pola yang sama persis dengan masalah "muat semua" di atas, hanya dari sisi frontend: bahkan kalau `/clashes` sudah dipaginasi server-side, memuat semuanya ke context di awal sesi tetap mengirim seluruh tabel clash ke browser setiap login.

Sekarang `master.clashesById: Record<string, Clash>` — **cache kecil, bukan daftar lengkap**, terisi on-demand oleh `loadClashDetail()`, `createClash()`, dan `updateClashField()`. Konsekuensinya:

- **Register** (`RegisterView.tsx`), **Dashboard** (`DashboardView.tsx`), dan **Clash Saya** (`my-clashes/page.tsx`) masing-masing fetch sendiri dari `/clashes` (atau `/clashes/metrics` untuk Dashboard) — tidak ada satu pun yang membaca `clashesById`.
- **Halaman detail** (`clashes/[id]/page.tsx`) membaca `clashesById[id]`, diisi oleh `loadClashDetail(id)` yang sudah dipanggil di `useEffect` saat mount (tidak berubah dari sebelumnya).
- **`bulkUpdateClashes`** tidak lagi refetch & menyimpan ulang seluruh daftar clash ke context (dulu satu-satunya alasan fungsi ini melakukan refetch adalah supaya array global tetap segar). Sekarang ia hanya `POST /clashes/bulk` dan mengembalikan `{ updated }` — pemanggilnya (Register) yang bertanggung jawab refresh halamannya sendiri (lihat `reloadTick` di `RegisterView.tsx`).
- Kalau menambah halaman baru yang perlu menampilkan clash, **jangan** tergoda menambahkannya kembali ke `MasterState` sebagai array — fetch langsung dari `/clashes` dengan query params yang sesuai, seperti tiga contoh di atas.

**Komentar & audit log dimuat lazy per clash**, bukan ikut batch fetch awal. Halaman detail (`clashes/[id]/page.tsx`) memanggil `loadClashDetail(id)` di `useEffect` saat mount; hasilnya di-*merge* ke array `comments`/`auditLogs` di context (dedupe by id via `mergeById`). Kalau butuh komentar/audit di halaman lain, panggil `loadClashDetail` dulu — jangan asumsikan array itu sudah terisi.

**RBAC field-level ada di `ClashesService`, bukan cuma `@Roles()`.** Aturan "Engineer hanya boleh edit item sendiri (assignee atau reporter)" dan "Engineer hanya boleh maju status 1 langkah, tidak boleh ke status `isClosedState`" ditegakkan di server (`assertCanEdit`, `buildAllowedPatch`, `assertEngineerStatusTransition`) — sudah diverifikasi lewat `fetch()` langsung (bypass UI) mengembalikan 403. Kalau menambah field baru yang bisa diedit, field itu harus ditambahkan ke pengecekan role di sana, bukan cuma disembunyikan di form.

**Audit log & `uniqueCode` dibuat server-side.** `nilaiLama`/`nilaiBaru` diterjemahkan ke nama (status/prioritas/assignee), bukan id mentah — supaya riwayat tetap terbaca meskipun id-nya bukan uuid. `uniqueCode` dihitung dalam transaksi dengan retry sekali kalau kena `P2002` (dua user membuat clash di disiplin yang sama bersamaan).

### Lampiran: object storage lokal (update ke-6)

Lampiran sekarang benar-benar tersimpan di server, bukan lagi sesi-only. `NewClashInput.attachments[].file?: File` tidak berubah di form input, tapi `data-context.tsx`'s `createClash()` sekarang meng-upload file lewat `POST /clashes/:id/attachments` (multipart, `FilesInterceptor`) setelah clash-nya dibuat, alih-alih menulis metadata ke `localStorage`.

Backend: `apps/api/src/storage/storage.service.ts` (`StorageService`) menyimpan file ke disk di bawah `UPLOAD_DIR` (default `./uploads` relatif ke `apps/api`, key `${clashId}/${uuid}-${namaFileAsli}`) — satu-satunya tempat yang tahu path filesystem-nya; sisa kode (controller/service/frontend) hanya berurusan dengan `Attachment.id`. Didesain sebagai seam tunggal untuk pindah ke S3/R2 nanti (ganti isi file ini saja). Validasi tipe/ukuran/jumlah file (`image/*`/`application/pdf`, maks 10 MB, maks 10 file) ditegakkan ulang di server (`ClashesController.addAttachments`) — cek di frontend (`clashes/new/page.tsx`) cuma UX.

Unduh lewat `GET /clashes/:clashId/attachments/:attachmentId/download` (terbuka untuk semua user login, sama seperti `GET /clashes/:id`). Karena access token disimpan di memori (bukan cookie — lihat Gotcha #11), `<img src=...>`/`<a href=...>` biasa tidak bisa membawa header `Authorization`; jadi frontend selalu fetch lampiran lewat `apiDownloadBlob()` (`lib/api/client.ts`) lalu bikin `URL.createObjectURL()` dari `Blob`-nya. Ini dilakukan di `clashes/[id]/page.tsx` lewat `useEffect` yang jalan tiap kali attachment baru muncul — bukan lagi di `data-context.tsx` seperti sebelumnya — sehingga preview **selalu di-fetch ulang dari server**, bukan di-cache saat pembuatan. Konsekuensinya, batasan lama "pratinjau tidak tersedia setelah reload" **sudah tidak berlaku**.

### Notifikasi async: email (MailHog) + WhatsApp (mock) (update ke-7)

Sprint 5 (email) dan Sprint 8 (WhatsApp + preferensi) selesai sekaligus. Alurnya: `ClashesService.applyPatch()` — satu-satunya jalur tulis untuk `update()` dan `bulkUpdate()`, sudah menghitung label lama/baru per field yang berubah — memanggil `NotificationsService` **setelah** transaksi commit:
- `assigneeId` berubah ke non-null → `enqueueAssigned(clashId, assigneeId)`.
- `statusId` berubah → `enqueueStatusChange(clashId, recipients, oldLabel, newLabel)`, `recipients` = gabungan `{assigneeId, reporterId}` (setelah patch, minus null, minus actor sendiri). **Ini asumsi produk**, bukan dari sprint plan literal (yang cuma bilang "notifikasi terpicu saat status berubah" tanpa merinci penerima) — kalau ternyata harus assignee-only, ubah di `ClashesService.publishNotifications()`.

Enqueue ini **fire-and-forget** (`.catch()` + `Logger.warn`, tidak di-`await` sebagai bagian dari response): kegagalan queue (mis. Redis mati) tidak boleh menggagalkan update clash itu sendiri.

Worker (`NotificationsProcessor`, `@Processor('notifications')`) memuat `NotificationPreference` user (default `{ emailEnabled: true, whatsappEnabled: false }` kalau belum ada baris — sama seperti default di `settings/notifications/page.tsx`), kirim ke kanal aktif, dan **selalu fallback ke email kalau WhatsApp gagal** — terlepas dari toggle email user (spesifik dari Sprint 8). Satu baris `Notification` ditulis per kanal yang benar-benar dicoba (`isSent` true/false).

**Email:** `EmailService` pakai `nodemailer` ke MailHog (`SMTP_HOST`/`SMTP_PORT` di `.env`, tanpa auth) — bukan SMTP produksi. Lihat email yang "terkirim" di `http://localhost:8025`. Ganti ke SMTP asli tinggal isi `auth` di `email.service.ts` dan ubah env.

**WhatsApp:** `WhatsAppService` adalah interface (`WhatsAppProvider`) + `MockWhatsAppProvider` yang cuma log dan menganggap selalu berhasil — **bukan integrasi WhatsApp Business API asli**. Pola sama seperti `StorageService`: satu binding di `NotificationsModule` (`{ provide: WHATSAPP_PROVIDER, useClass: MockWhatsAppProvider }`) yang diganti kalau mau pasang provider asli (mis. Meta Cloud API), tanpa menyentuh `NotificationsProcessor`.

**Overdue scanner:** `OverdueScannerService` jalan cron harian jam 07:00 (`@Cron('0 7 * * *')`), cari clash `dueDate < now` + belum closed + ada assignee, skip pasangan clash+assignee yang sudah dapat notifikasi `OVERDUE` hari itu (dedup by `Notification.createdAt >= startOfToday`).

**Preferensi notifikasi pindah dari `localStorage` ke API** — `GET`/`PATCH /notification-preferences/me`, upsert per user dari JWT (bukan body — tidak bisa ubah preferensi orang lain). Validasi E.164 untuk `whatsappNumber` ada di server (`NotificationPreferenceService`) juga, bukan cuma di form frontend. `data-context.tsx` fetch ini sekaligus di `reloadMasterData()`; `settings/notifications/page.tsx` sekarang manggil `updateNotificationPreference()` (async) alih-alih `setNotificationPreference()` (sync, localStorage).

### Impor massal: CSV/XML async + dedup (update ke-9)

Sprint 9 backend selesai. Sebelumnya `/import` mem-parse file **di browser** (`src/lib/csv.ts`) lalu menembak `POST /clashes` satu request per baris — tidak ada job async, tidak ada idempotensi, XML di-scope-cut. Sekarang seluruhnya pindah ke `apps/api/src/import/` (`ImportModule`):

- `POST /import/preview` (multipart, maks 10 MB) mem-parse file (CSV via parser ported dari `src/lib/csv.ts` lama; XML lewat `fast-xml-parser`, mendukung bentuk atribut Navisworks `<clashresult>` dan Solibri `<issue>` — lihat `src/import/parsers/`), menyimpannya lewat `StorageService` di bawah prefix `imports/`, dan mengembalikan `{ token, columns, sampleRows, totalRows, suggestedMapping }`. `token` = storage key, dipakai `commit` supaya file tidak perlu di-upload ulang.
- `POST /import/commit` `{ token, fileName, mapping, autoCreateMasterData? }` membuat baris `ImportJob` (status `QUEUED`) dan `queue.add()` ke antrean BullMQ `import`, **tidak menunggu prosesnya** — langsung balas `{ jobId }`. `autoCreateMasterData: true` ditolak 403 untuk non-Admin.
- `GET /import/jobs/:id` — status/progres/laporan error, di-poll frontend tiap 1 detik. Di-scope ke pembuat job atau Admin.
- `ImportProcessor` (`@Processor('import')`) memproses tiap baris dalam **transaksi terpisah** lewat `ClashesService.createClashRecord()` — method baru yang diekstrak dari `ClashesService.create()` supaya generate-`uniqueCode`-plus-retry-`P2002` tidak disalin-tempel. Baris sukses ditulis dengan `AuditLog.action = "imported"` (bukan `"created"`) — **frontend `auditText()` di `clashes/[id]/page.tsx` sudah di-update untuk case ini**; kalau lupa menambah case baru untuk action baru di masa depan, hasilnya string `"undefined"`/`"undefined"` yang lolos type-check tapi salah di runtime (ditemukan & diperbaiki di sesi ini, lihat §9).
- **Dedup**: kalau mapping menyertakan kolom `externalId`, `(projectId, externalId)` yang sudah ada di-skip (`skippedRows`, bukan `failedRows`). Constraint unique di DB adalah penjaga akhir untuk race antar job — kalau kena, `createClashRecord()` melempar `DuplicateExternalIdError` alih-alih retry `uniqueCode`, dan `ImportProcessor` menangkapnya sebagai skip juga.
- **Auto-create master data** (Admin-only): disiplin/zona/prioritas dari file yang tidak dikenal dibuat otomatis alih-alih membuat barisnya gagal.
- Migrasi baru: `Clash.externalId` (nullable, `@@unique([projectId, externalId])`) + model `ImportJob` (progres/laporan per job).

**Template master data antar proyek** (sisa deliverable Sprint 9): `POST /master-data/templates/copy` `{ fromProjectId, toProjectId, include }` (Admin), menyalin disiplin/zona **aktif** yang belum ada di tujuan — idempoten. Saat ditulis (update ke-9), ClashHub masih single-project secara runtime meski schema-nya sudah multi-project (lihat update ke-12 di bawah — ini sudah tidak berlaku lagi), jadi saat itu cuma ditambah `GET /projects` (Admin) minimal supaya dialog "Salin dari proyek lain" di `/admin/master-data` punya sesuatu untuk dipilih. Endpoint ini sengaja **tetap** cross-project by design (body eksplisit `fromProjectId`/`toProjectId`, ditandai `@SkipProjectScope()` sejak update ke-12) — beda dari endpoint clash/master-data lain yang sekarang wajib scoped ke satu proyek aktif.

Frontend: `src/app/import/page.tsx` ditulis ulang total — upload lewat `apiUpload()`, terima kolom & saran mapping dari server (bukan menghitungnya sendiri), commit lalu poll job dengan `setTimeout` chain (bukan `setInterval`, supaya tidak ada request tumpang tindih) yang di-`clearTimeout` saat unmount. `src/lib/csv.ts` dan `csv.test.ts` **dihapus** — satu-satunya konsumen (`import/page.tsx`) sudah tidak memakainya lagi.

### Koreksi ProjectMemberGuard + hardening Sprint 11 (update ke-11)

**`ProjectMemberGuard` (`common/guards/project-member.guard.ts`) ternyata tidak pernah dipasang di rute mana pun.** Klaim di update ke-2/3 dan §3/§7 sebelumnya ("RolesGuard + @Roles() + ProjectMemberGuard dipakai oleh route clash") sudah basi — `grep` di seluruh `apps/api/src` cuma menemukan definisi kelasnya, nol pemakaian `@UseGuards(ProjectMemberGuard)`. Ditemukan saat audit RBAC Sprint 11. Konsekuensi konkret yang diperbaiki: `GET /clashes/:clashId/attachments/:attachmentId/download` cuma dijaga guard global (login saja, peran apa pun) — `getAttachmentForDownload` cuma mencocokkan `attachment.clashId === clashId`, tidak ada cek keanggotaan proyek sama sekali. Karena `ProjectMemberGuard` men-skip diri sendiri kalau tidak ada `:projectId` di route params (dan rute clash cuma punya `:id`/`:clashId`/`:attachmentId`), memasang guard itu di rute ini tidak akan memperbaiki apa-apa — perbaikannya jadi pengecekan langsung di `ClashesService.assertProjectMember()` (dipanggil dari `getAttachmentForDownload`, Admin bypass, method sama seperti pola guard yang sudah ada). **Dampak nyata di produksi rendah** — `UsersService.create()` (`src/users/users.service.ts:29-36`) sudah membuat baris `ProjectMember` untuk setiap user baru (Admin panel maupun seed), jadi semua user aktif hari ini memang anggota proyek; gap ini cuma kena kalau `ProjectMember`-nya dihapus manual atau di masa depan ClashHub jadi benar-benar multi-project.

**Audit RBAC controller lain** (users, projects, master-data, import, notification-preferences): dibaca ulang semua kombinasi `@Roles()`/`@Public()`, konsisten dengan tabel RBAC §6 — tidak ditemukan gap tambahan di luar yang di atas.

> **Update ke-12 menggantikan seluruh subbab ini.** `ProjectMemberGuard` yang dibahas di atas **sudah dihapus total** (bukan lagi "didefinisikan tapi tidak dipasang") dan digantikan `ProjectContextGuard` yang benar-benar dipasang global. Subbab ini dipertahankan sebagai riwayat (kenapa keputusan sebelumnya masuk akal saat itu), bukan deskripsi kondisi saat ini — baca subbab berikutnya untuk kondisi sekarang.

### Otorisasi multi-project (update ke-12)

Permintaan ad-hoc (di luar `ClashHub_Sprint_Plan.md`, tidak ada sprint number): ubah dari single-project runtime jadi multi-project sungguhan dengan otorisasi per-proyek, memakai schema `Project`/`ProjectMember` yang sebenarnya sudah ada sejak Sprint 0 tapi tidak pernah benar-benar ditegakkan (lihat subbab di atas).

**Desain guard.** `ProjectContextGuard` (`common/guards/project-context.guard.ts`) didaftarkan sebagai `APP_GUARD` di `app.module.ts`, urutan **Throttler → JwtAuthGuard → RolesGuard → ProjectContextGuard** (guard butuh `request.user` dari JwtAuthGuard dan role dari situ juga sebelum bisa memutuskan apakah membership perlu dicek). Perilakunya:
- Route ditandai `@SkipProjectScope()` → lolos tanpa cek apa pun.
- Tidak ada `request.user` (route `@Public()`) → lolos (tidak ada yang perlu di-scope).
- Selain itu: **wajib** ada header `X-Project-Id`, kalau tidak → 403. Proyek harus benar-benar ada di DB → kalau tidak → 404. Kalau role user **bukan** salah satu `CROSS_PROJECT_ROLES` (`ADMIN`/`MANAGEMENT`/`COORDINATOR`, di `common/constants/project-roles.ts`) → wajib ada baris `ProjectMember(projectId, userId)` → kalau tidak → 403.
- Lolos semua → `request.activeProjectId = projectId`, dibaca controller lewat decorator `@ActiveProject()` (mirip `@CurrentUser()`).

Ini **deny-by-default** — beda filosofi dari `ProjectMemberGuard` lama yang `return true` kalau tidak ada `:projectId` di request. Konsekuensinya: **setiap controller baru yang tidak butuh scope proyek WAJIB ditandai eksplisit** `@SkipProjectScope()`, kalau lupa route itu akan menolak semua request dengan 403 "Header X-Project-Id wajib disertakan." — ini persis bug yang ditemukan lewat verifikasi browser di sesi ini sendiri (lihat §8).

**Kenapa Coordinator/Management ikut bypass, bukan cuma Admin.** Keputusan eksplisit dari user selama sesi ini (bukan asumsi) — hanya Engineer yang benar-benar dibatasi ke proyek assignment-nya; Coordinator/Management/Admin dianggap peran yang mengawasi lintas-proyek. Kalau ini berubah nanti, satu tempat yang perlu diubah adalah array `CROSS_PROJECT_ROLES`.

**Resource-level check, bukan cuma header.** Header yang valid hanya membuktikan "user boleh memakai proyek ini", bukan "resource yang diminta memang ada di proyek ini". `ClashesService.assertClashInProject(clashId, projectId)` (menggantikan pola lama yang langsung `prisma.clash.findUnique({ where: { id } })` tanpa cek apa pun) dipakai di `findDetail`, `update`, `addComment`, `addAttachments`, `getAttachmentForDownload` — clash yang ada tapi bukan di proyek aktif dilaporkan **404**, bukan 403, supaya caller tidak bisa membedakan "tidak ada" dari "ada tapi bukan punyamu". `bulkUpdate` memvalidasi **seluruh** batch sekaligus (`clash.findMany({ where: { id: { in: ids }, projectId } })`, cocokkan jumlahnya dengan `ids.length`) — kalau satu saja id dari proyek lain, seluruh batch ditolak 404, tidak diam-diam di-skip (skip diam-diam akan membuat respons 200 parsial bisa dipakai memprobe id asing).

**Empat helper `currentProject()`/`currentProjectId()` yang lama (masing-masing query "proyek tertua" sendiri-sendiri di `clashes.service.ts`, `master-data.service.ts`, `import.service.ts`, dan inline di `projects.service.ts`/`users.service.ts`) semuanya dihapus.** Semua method service yang tadinya memanggilnya sekarang menerima `projectId` sebagai parameter dari controller (`@ActiveProject()`). `import.processor.ts` (worker BullMQ) **tidak diubah** — dari awal sudah resolve project lewat `importJob.projectId` sendiri, bukan lewat helper "proyek tertua", jadi sudah aman multi-project by construction.

**`GET /projects` sekarang terbuka untuk semua role** (sebelumnya Admin-only) — hasilnya difilter: `CROSS_PROJECT_ROLES` dapat semua proyek, Engineer cuma dapat proyek yang dia jadi `ProjectMember`-nya. `GET /projects/current` dipertahankan (bukan dihapus) sebagai fallback "proyek pertama" untuk pre-select awal sebelum user memilih lewat switcher — semantiknya berubah dari "proyek tertua global" jadi "proyek tertua milik user ini" (atau proyek tertua overall untuk `CROSS_PROJECT_ROLES`). Endpoint baru Admin-only: `GET/POST/DELETE /projects/:projectId/members` (`ProjectsService.listMembers/addMember/removeMember`) — `UsersService.create()` **berhenti** auto-join user baru ke satu proyek (dulu ini justru yang membuat gap `ProjectMemberGuard` lama nyaris tidak kerasa — lihat subbab di atas); assign membership sekarang harus eksplisit lewat endpoint ini.

**Frontend.** `lib/api/client.ts` kirim header `X-Project-Id` otomatis di setiap request (`setActiveProjectId()`, pola identik `setAccessToken()`) — tidak perlu mengubah tiap call site satu-satu. `data-context.tsx`: `reloadMasterData()` sekarang fetch `GET /projects` (bukan `/projects/current`) untuk dapat daftar proyek milik user, pilih `activeProjectId` (dari `localStorage` kalau masih valid, kalau tidak proyek pertama), baru fetch disiplin/zona (yang butuh proyek aktif) — urutannya penting, header harus di-set sebelum fetch yang di-scope proyek jalan. `setActiveProject(id)` baru: ganti proyek aktif, refetch disiplin/zona, **kosongkan** `clashesById`/`comments`/`auditLogs`/`attachments` (cache lama sudah tidak valid untuk proyek baru). `AppShell.tsx` & `DashboardView.tsx` dapat dropdown switcher sungguhan (yang di `DashboardView` sebelumnya selalu `disabled`). `/admin/projects` dapat UI kelola anggota (list + tambah + hapus) memakai `lib/api/projects.ts` baru.

**Seed** (`prisma/seed.ts`): `PROJECT` lama (`proj-1`/MCA, semua 10 user jadi anggota) **tidak diubah** — hanya *ditambah* `PROJECT_2` (`proj-2`/GSB, 3 disiplin, 2 zona, 12 clash dengan rng seed berbeda) dengan `PROJECT_2_MEMBER_IDS = ['u-eng2', 'u-coord', 'u-admin']` sengaja **tidak** semua user, supaya ada Engineer (`u-eng`/Yanuar) yang murni anggota `proj-1` untuk uji isolasi. `seedProject2Clashes()` cek eksistensi di-scope `projectId` (bukan `prisma.clash.count()` global seperti `seedClashes()` lama) supaya tetap jalan walau `proj-1` sudah ada clash-nya.

**Testing.** Tidak ada infrastruktur e2e/HTTP sebelumnya di `apps/api` — semua `*.spec.ts` lama instantiate service langsung dengan Prisma di-mock, tanpa lewat routing HTTP sungguhan. Untuk membuktikan IDOR (ganti id di URL, ganti header, kirim id proyek lain di body/query) secara jujur, ditambah harness baru: `apps/api/src/testing/project-isolation.e2e-spec.ts` — Nest `TestingModule` (hanya `ClashesModule`+`MasterDataModule`+`ProjectsModule`, BUKAN `AppModule` penuh supaya tidak butuh koneksi Redis/BullMQ nyata) + `supertest` (devDependency baru, bareng `@types/supertest`) terhadap `app.getHttpServer()`, Prisma tetap di-mock in-memory (2 proyek, masing-masing clash/disiplin/zona/member sendiri), `JwtAuthGuard` diganti `TestAuthGuard` lokal (baca `x-test-user-id`/`x-test-user-role` dari header, tidak perlu JWT sungguhan) sementara `RolesGuard`+`ProjectContextGuard` **asli** tetap dipakai — yang diuji jadi logika otorisasi sesungguhnya, bukan mock. 10 skenario: header hilang, header proyek asing (non-member ditolak), id URL disilang (404), PATCH/comment ke id proyek lain (404), bulk update yang menyelundupkan id asing (404, tidak ada mutasi), list/master-data terisolasi per proyek, projectId asing di query string diabaikan (DTO whitelist), `CROSS_PROJECT_ROLES` tetap tembus tanpa `ProjectMember`, proyek yang tidak ada di-404. Plus `project-context.guard.spec.ts` (unit test guard, pola sama seperti `roles.guard.spec.ts` yang sudah ada).

**Diverifikasi live di browser** (bukan cuma test otomatis) — lihat §9 gotcha baru soal bug yang ketemu justru dari langkah ini: login Admin → switch proyek MCA↔GSB di sidebar → Register/disiplin/zona berganti sesuai (91 vs 12 clash); tambah/hapus anggota proyek di `/admin/projects` → daftar berubah sungguhan lewat API; login Engineer (`u-eng`, cuma anggota MCA) → navigasi langsung ke URL clash milik GSB → **"Clash tidak ditemukan"** (404 dari network tab, bukan cuma UI yang menyembunyikan), project switcher otomatis hilang (karena `projects.length <= 1` untuknya).

### Soft-delete clash, kelola lampiran, pratinjau & markup vektor (update ke-16)

Permintaan ad-hoc (di luar `ClashHub_Sprint_Plan.md`), dikerjakan sebagai 4 tahap berurutan — tiap tahap dirilis & diverifikasi live di browser sendiri-sendiri sebelum lanjut ke tahap berikutnya, ditutup satu sesi perbaikan bug setelah user mencoba fitur markup dan dua kali melaporkan "masih tidak bisa" (lihat penutup subbab ini — **wajib dibaca**, itu bagian paling berharga dari update ini).

**Tahap 1 — Soft-delete clash (Admin-only).** `Clash.deletedAt DateTime?` baru (migrasi `20260807131750_add_clash_soft_delete`) — **bukan** `isActive` boolean seperti `Discipline`/`Zone`/`Priority` (§5 "Soft-delete, bukan hard-delete") karena semantiknya beda: `isActive` berarti "tidak bisa dipilih lagi tapi tetap kelihatan di riwayat" (disiplin nonaktif tetap muncul di filter chip Register), sedangkan ini berarti "hilang dari mana-mana" sampai di-restore. `uniqueCode` **tidak pernah dibebaskan** saat dihapus — restore harus lossless dan kode itu muncul di export/notifikasi.

Fragmen where `NOT_DELETED = { deletedAt: null }` (file terpisah `clashes/clash-scope.ts`, bukan konstanta di dalam service, supaya modul lain bisa impor tanpa circular dependency ke `ClashesModule`) di-spread ke **semua** jalur baca: `list()`, `metrics()`, `bulkUpdate()`, `assertClashInProject()` (sekarang `findFirst` + opsi `includeDeleted` — bukan lagi `findUnique` polos), `overdue-scanner.service.ts`, `notifications.processor.ts` (guard job yang sudah di-enqueue tapi clash-nya keburu dihapus). **Dua pengecualian sengaja, didokumentasikan di kode supaya tidak "diperbaiki" keliru nanti**:
- hitung sequence `uniqueCode` di `createClashRecord()` — kalau difilter, baris terhapus (yang tetap memegang kodenya) akan bikin nomor urut baru bentrok dengan kode yang sudah dipakai, retry `P2002` menghitung ulang angka yang sama persis, dan pembuatan clash gagal total setelah 2 percobaan;
- dedup `externalId` di `import.processor.ts` — mencerminkan constraint `@@unique([projectId, externalId])` yang memang tidak sadar soft-delete; membiarkannya apa adanya menjaga jalur "skipped" tetap bersih dan re-import tidak diam-diam menghidupkan kembali baris yang sengaja dihapus.

Endpoint `DELETE /clashes/:id` + `POST /clashes/:id/restore` (keduanya Admin-only, dalam transaksi bareng baris `AuditLog` action `deleted`/`restored`). `GET /clashes?deleted=1` (Admin-only, ditolak 403 utk peran lain) untuk lihat clash terhapus — belum ada UI "keranjang sampah" di frontend, cuma endpointnya yang tersedia (lihat §12). Frontend: tombol "Hapus clash" di panel "Zona berbahaya" (aside merah, hanya tampil kalau `canDeleteClash`), `DeleteClashDialog` wajib ketik ulang `kodeUnik` persis sebelum tombol konfirmasi aktif — pola sama dengan konfirmasi bulk-update yang sudah ada.

**Diverifikasi live**: hapus clash → hilang dari Register/Dashboard/My Clashes/export, buka URL detail langsung → "Clash tidak ditemukan"; **buat clash baru di disiplin yang sama persis setelah menghapus** → kode lanjut normal (`JTB-ARS-0007`, bukan bentrok dengan `JTB-ARS-0006` yang baru dihapus) — ini yang membuktikan pengecualian sequence count di atas benar-benar perlu, bukan cuma teori.

**Tahap 2 — Kelola lampiran dari halaman detail.** Sebelumnya lampiran cuma bisa ditambah saat form `clashes/new` disubmit — halaman detail sama sekali tidak punya kontrol upload/hapus, jadi file salah unggah permanen. Sekarang tab Lampiran (`AttachmentPanel.tsx`, komponen baru yang memiliki seluruh isi tab — dropzone + kartu + tombol Hapus per kartu) bisa upload kapan saja (`ENGINEER`/`COORDINATOR`/`ADMIN`, **ke clash siapa pun di proyeknya, bukan cuma clash sendiri** — sengaja TIDAK dibatasi `assertCanEdit()`, beda dari mengedit field clash itu sendiri) dan hapus (**hanya pengunggah sendiri, atau Coordinator/Admin** — helper baru `assertCanDeleteAttachment()`, beda aturan dari `assertCanEdit()` karena kuncinya `uploadedById`, bukan assignee/reporter).

`StorageService.delete(key)` baru — `path.resolve` + cek prefix root utk proteksi path traversal (walau key **tidak pernah** datang dari client, cuma dari `attachment.fileUrl` yang sudah divalidasi `assertAttachmentInClash()` — ini pertahanan lapis kedua, bukan kontrol akses utama), `force:true` (file sudah hilang = no-op, bukan error), sengaja **tanpa** `recursive:true` (kalau key entah bagaimana menunjuk direktori, harus gagal — bukan menghapus seluruh folder `<clashId>/`). Baris `Attachment` **di-hard-delete** (beda dari `Clash` yang soft-delete) — satu-satunya nilai historisnya cuma nama file, dan itu sudah terekam di `AuditLog`; unlink file di disk fire-and-forget **setelah** transaksi commit (pola sama seperti `publishNotifications()`) supaya kegagalan I/O tidak pernah membuat baris DB hilang tapi request-nya 500. Audit log baru: `attachment_added`/`attachment_deleted` (field `attachment`, `oldValue`/`newValue` = nama file) — `auditText()` di `clashes/[id]/page.tsx` dapat cabang baru untuk keduanya, **plus fallback defensif** `if (!entry.field) return ...` sebelum template diff generik (lihat §8 z-series update ke-15 soal action `"imported"` yang dulu lolos type-check tapi salah runtime — pola yang sama persis bisa terulang untuk action baru mana pun kalau fallback ini tidak ada).

**Diverifikasi live**: Engineer unggah ke clash milik Rhendy (bukan miliknya) → sukses; hapus lampiran sendiri → sukses, baris `AuditLog` muncul di tab Riwayat dengan kalimat Indonesia yang benar; tombol Hapus tidak tampil sama sekali untuk lampiran unggahan Engineer lain (dicoba dengan 2 lampiran, masing-masing pengunggah beda).

**Tahap 3 — Modal pratinjau lampiran (`AttachmentPreviewModal.tsx`).** Sebelumnya gambar dirender sebagai thumbnail 40×40px + link "Unduh" — untuk sekadar melihat screenshot, harus diunduh ke disk dulu. Modal baru: zoom (scroll wheel + tombol −/Reset/+, dipasang manual via `addEventListener({passive:false})` karena `onWheel` React itu passive dan `preventDefault()`-nya no-op di situ), pan (drag saat scale>1), navigasi panah kiri/kanan antar lampiran, Escape/klik-backdrop utk tutup, fokus dikembalikan ke elemen semula saat unmount.

**TTL signed URL (5 menit, dari update ke-15) sengaja TIDAK diperpanjang** — URL itu tidak bisa dicabut sekali terbit, jadi jendela lebih panjang cuma menambah paparan tanpa manfaat UX. Sebagai gantinya: `use-signed-url.ts` (hook baru) refresh **proaktif** 1 menit sebelum kedaluwarsa (dijadwalkan lewat `setTimeout` dari `expiresAt` yang dikembalikan server, bukan interval tetap), plus retry sekali dari `<img onError>` — **retry dibatasi per-`attachmentId`, bukan counter yang di-reset tiap fetch sukses** (lihat bug 16a di §8, ini persis penyebab infinite-request-loop yang ditemukan pasca-implementasi).

**Tahap 4 — Markup vektor.** Model `Annotation` baru (migrasi `20260807135624_add_annotations`, enum `AnnotationKind = RECT|ARROW|FREEHAND|TEXT`) — geometri disimpan **dinormalisasi ke [0,1]** relatif kotak intrinsik halaman (bukan piksel mentah), supaya satu mapping tetap presisi di zoom/viewport berapa pun; `strokeWidth` dinormalisasi cuma terhadap LEBAR (bukan lebar & tinggi terpisah) supaya garis tidak melar di halaman non-persegi. Modul murni `src/lib/annotations.ts` (`toPixels`/`fromPixels`/`strokeWidthPixels`/`arrowHeadPoints`/`simplifyFreehand`) dipakai bareng oleh overlay SVG **dan** flattener canvas (tombol "Unduh dengan markup") — supaya keduanya tidak mungkin menggambar bentuk yang beda.

**Overlay SVG, bukan `<canvas>`** — hit-testing/seleksi gratis lewat DOM node (klik langsung pada `<rect>`/`<path>`/`<text>`), dan tetap bisa di-assert Testing Library (canvas buram total di jsdom, tidak ada `getContext`). Wrapper transform pan/zoom dari Tahap 3 (`contentRef`, `inline-block`, transform diterapkan DI SITU bukan langsung di `<img>`/`<canvas>`) jadi fondasi: overlay SVG jadi sibling `<img>`/`<PdfPageCanvas>` di dalam wrapper yang sama, jadi pan/zoom otomatis berlaku ke markup tanpa perhitungan koordinat tambahan. Ukuran box overlay diukur via `ResizeObserver` pada `contentRef` (`useElementBox`, lihat bug 16a di §8 soal cara BENAR memicu ulang efeknya).

**RBAC markup**: `ENGINEER`/`COORDINATOR`/`ADMIN` boleh menggambar; **Management melihat markup (dibagikan ke semua anggota proyek) tapi TIDAK melihat tool menggambar/color picker** — tool "Pilih"/"Geser" tetap tampil untuk semua peran (termasuk Management, supaya tetap bisa drag-to-pan gambar yang di-zoom) lewat `AnnotationToolbar`'s prop `canDraw` yang cuma menyaring 4 tombol tool-gambar + palet warna, bukan menyembunyikan toolbar-nya sekaligus. Edit/hapus markup dibatasi ke pembuat sendiri atau Coordinator/Admin (`assertOwnerOrCoordinator()` di backend, `canEditAnnotation()` di frontend — pola identik `assertCanDeleteAttachment`/`canDeleteAttachment` di Tahap 2). Validasi geometri (tiap koordinat finite & di [0,1], freehand maks 2000 titik, payload maks 64KB) **wajib di service**, bukan `class-validator` di DTO, karena discriminated union di atas kolom `Json` tidak bisa dinyatakan lewat decorator.

**PDF via `pdfjs-dist` (pin versi eksak `6.2.108`, bukan `^`)**, diisolasi total di `PdfPageCanvas.tsx` dan cuma dimuat lewat `dynamic(() => import(...), { ssr:false })` dari modal — pdf.js menyentuh `DOMMatrix`/`document` saat import, jadi TIDAK BOLEH pernah ter-import statis (akan meledak di SSR). Worker-nya (`pdf.worker.min.mjs`) **di-copy ke `public/` lewat script `scripts/copy-pdf-worker.mjs`**, dijalankan otomatis via hook npm `predev`/`prebuild` — bukan diresolve bundler (`new URL(..., import.meta.url)` rapuh antara Turbopack dev vs `next build`). File hasil copy di-gitignore, regenerasi tiap `npm install`. **Ini risiko teknis terbesar di seluruh update ke-16** dan divalidasi eksplisit dengan `next build` sukses (bukan cuma `next dev`) sebelum dianggap selesai.

"Unduh dengan markup" meratakan **sepenuhnya di client**: gambar sumber (atau halaman PDF, `scale:2` via `pdfjs-dist` langsung, bukan lewat `PdfPageCanvas`) digambar ke `<canvas>` offscreen pada resolusi natural, markup diputar ulang lewat `toPixels()` yang sama, lalu `canvas.toBlob()` → download. Unduhan biasa (tombol "Unduh") **tetap file asli byte-demi-byte, tidak pernah tersentuh** — markup itu murni layer terpisah, sesuai permintaan awal user.

Anotasi **sengaja bukan bagian dari `data-context.tsx`** — state lokal modal (fetch/mutate langsung pakai `apiGet`/`apiPost`/`apiPatch`/`apiDelete` dari dalam `AttachmentPreviewModal.tsx`), karena sifatnya per-lampiran dan berumur pendek, beda dari `clashesById`/`attachments` yang dipakai lintas-halaman.

**Juga di update ke-16 (perubahan kecil tapi lintas RBAC):** Management sekarang bisa berkomentar — `canComment()` (yang tadinya `role !== "Management"`) **dihapus total** dari `lookup.ts`, bersama pesan baca-saja "Peran Management bersifat baca-saja dan tidak dapat menambah komentar." di `clashes/[id]/page.tsx`; backend `@Roles()` di `POST /clashes/:id/comments` tambah `Role.MANAGEMENT`. Alasannya: komentar itu diskusi, bukan edit yang mengubah state clash — beda kelas dari kolom "Edit item" di tabel RBAC §6 yang memang sengaja membatasi Management.

**Pasca-implementasi — dua bug ditemukan HANYA lewat verifikasi browser sungguhan, keduanya lolos test otomatis pada percobaan pertama. Baca §8 (bagian "update ke-16") untuk kronologi lengkap sebelum mengubah `AnnotationLayer.tsx`/`AttachmentPreviewModal.tsx` lagi**, ringkasannya:
- `useElementBox` memicu *"Maximum update depth exceeded"* — `setState` di efek tanpa dependency array yang benar (lihat bug 16a).
- **Markup teks TIDAK BISA DIKETIK SAMA SEKALI dengan mouse sungguhan**, meski semua unit test (termasuk yang khusus dibuat utk memverifikasi ini) lolos hijau — event sintetis (`dispatchEvent`) yang dipakai testing tidak meniru *default action* browser, dan justru default action itulah sumber bugnya (`mousedown` memindah fokus ke `<body>` setelah React memasang input, lihat bug 16b). **Pelajaran paling mahal di update ini**: fitur interaktif berbasis pointer/mouse (drag, klik-ganda, gambar bebas) HARUS diverifikasi dengan `computer` tool (klik/ketik sungguhan) di Browser pane, bukan cuma `javascript_tool`'s `dispatchEvent` atau unit test — keduanya bisa lolos hijau di atas fitur yang benar-benar rusak.

### Export Laporan Clash — format konsultan (update ke-17)

Permintaan ad-hoc: user mengirim tangkapan layar laporan konsultan ("Tabel Clash Detection") dan bertanya apakah export bisa mengikuti format itu — baris judul ter-merge, dikelompokkan per lantai (`Floor: Basement 2 Plan`), dan **dua kolom gambar** per baris (Original + Clash Detection) dengan markup merah tercetak di gambarnya.

Tiga hal menghalangi, dan ketiganya harus diselesaikan lebih dulu:

1. **`xlsx@0.18.5` (SheetJS community) tidak bisa menanam gambar sama sekali.** Ditambahkan `exceljs` — library yang justru sudah disebut sejak awal di `ClashHub_PRD.md` dan `ClashHub_Sprint_Plan.md`, jadi SheetJS-lah yang menyimpang dari rencana. Di-import dinamis (~280 KB gz) mengikuti pola pdf.js. **Temuan Gate 0**: pakai `base64`, bukan `buffer` — tipe `Image.buffer` milik ExcelJS adalah `Buffer` Node yang tidak ada di browser; `extension` hanya menerima `'jpeg' | 'png' | 'gif'`, bukan `'jpg'`; field `browser` di package-nya dihormati Turbopack jadi tidak perlu fallback ke `dist/exceljs.min.js`.
2. **Tidak ada cara membedakan lampiran "Original" dari "Clash Detection".** Ditambahkan enum `AttachmentRole` + kolom `Attachment.role` (DEFAULT `OTHER`), dengan picker "Kolom laporan" di `AttachmentPanel` dan di halaman clash baru. Lihat gotcha 37 soal kenapa tidak ada fallback implisit.
3. **Kolom "Resolve (TATA Proposed)" dan "Resolve by Consultant" tidak punya tempat.** Ditambahkan dua kolom teks nullable di `Clash`, dengan section "Penyelesaian" di halaman detail. `Resolve Date` memakai `closedAt` yang sudah ada. RBAC: Engineer boleh mengisi usulan TATA tapi **tidak** jawaban konsultan — transkripsi tangan kedua adalah cara laporan salah mengutip pihak eksternal.

**Arsitektur: dibangun di client, bukan di server.** Alasannya bukan selera: `src/lib/annotations.ts` sudah menyatakan bahwa geometri ternormalisasi dipakai bersama SVG overlay dan canvas flattener "so the two can never drift". Renderer server-side akan jadi renderer **ketiga** dengan matematika arrowhead/stroke/font sendiri. Ditambah lampiran PDF: browser sudah bisa merendernya lewat pdf.js, server butuh native canvas module di Docker + Windows. `loadImage`/`drawAnnotationsOnCanvas` diekstrak dari `AttachmentPreviewModal` ke `src/lib/markup-flatten.ts` supaya "Unduh dengan markup" dan laporan memakai renderer yang sama persis — `AttachmentPreviewModal.test.tsx` lulus **tanpa diubah satu baris pun**, itu bukti ekstraksinya behavior-preserving.

**API**: `GET /clashes/report` (selalu **empat** query berapa pun jumlah baris — pencarian lampiran dan anotasi di-batch dengan `in`, ada test yang mematoknya), cap 300 baris (bukan 5000 seperti `/export`, karena satu baris berarti sampai dua unduhan gambar), TTL signed URL 15 menit (bukan 5 — export 300 baris bisa lebih lama, dan URL kedaluwarsa di tengah jalan jadi lubang di spreadsheet). Plus `GET /clashes/report/capability` supaya Register tahu harus merender tombolnya atau tidak.

**Kill switch `CLASH_REPORT_ENABLED`** (Joi, default true): setel false lalu restart API — tombolnya hilang dari Register dan endpoint membalas 404 (bukan 403; fitur yang dimatikan sebaiknya tampak tidak ada). Diverifikasi dua arah lewat UI, termasuk regresi bahwa kedua export lama tetap berfungsi saat fitur baru mati. Lihat §13 untuk empat lapis rollback.

**Dua bug yang hanya ketahuan dari uji browser**, keduanya lolos typecheck/build/semua unit test:
- **CSP `img-src 'self' data:` memblokir `blob:`** — versi pertama `report/images.ts` mengunduh lampiran jadi Blob lalu memasang object URL-nya ke `img.src`, hasilnya "0 gambar tertanam, 2 gagal" tanpa exception apa pun. Diperbaiki dengan memakai signed URL same-origin apa adanya alih-alih melonggarkan CSP — kebetulan juga menghemat satu fetch penuh per gambar. Lihat gotcha 36.
- **Picker peran terhimpit jadi "Ori…"/"Clas…"** di kartu lampiran grid dua kolom, karena disusun sebaris dengan nama file dan tombol aksi. Kartu diubah jadi kolom. Tidak ada unit test yang bisa menangkap ini.

**Diverifikasi**: file `laporan-clash-JTB-2026-08-10.xlsx` (47.169 byte) benar-benar terunduh dari data asli lalu dibuka kembali dengan ExcelJS — judul, label bulan, kesembilan header, band `Floor:` di baris yang benar, 2 JPEG di `xl/media` dengan anchor `col=1 row=4 editAs=oneCell`, tinggi baris 112,5 pt, header beku, landscape `fitToWidth=1`.

---

## 6. RBAC yang ditegakkan

| Peran | Register | Bulk update | Export | Buat clash | Edit item | Hapus clash | Komentar² | Lampiran³ | Markup⁴ | Dashboard | Admin | Import CSV |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Engineer** | ✅ | ❌ | ✅ | ✅ | Item sendiri, status maju 1 langkah saja | ❌ | ✅ | Upload semua; hapus milik sendiri | Gambar semua; edit/hapus milik sendiri | ❌ | ❌ | ❌ |
| **Coordinator** | ✅ | ✅ | ✅ | ✅ | Penuh¹ | ❌ | ✅ | Upload+hapus semua | Gambar+edit/hapus semua | ✅ | ❌ | ✅ |
| **Management** | ✅ baca-saja | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (sejak update ke-16) | Lihat/unduh saja | Lihat saja (tool Pilih/Geser tetap ada) | ✅ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | Penuh¹ | ✅ | ✅ | Upload+hapus semua | Gambar+edit/hapus semua | ✅ | ✅ | ✅ |

¹ **Assignee hanya boleh Engineer aktif** (permintaan ad-hoc pasca update ke-12, di luar Sprint Plan asli — bukan lagi "Engineer atau Coordinator"). "Penuh" berarti Coordinator/Admin boleh mengubah `assigneeId` ke user manapun *yang lolos aturan itu*, atau `null` untuk melepas — bukan benar-benar bebas. Ditegakkan `ClashesService.assertAssigneeIsEngineer()`, dipanggil dari dua jalur terpisah: `buildAllowedPatch()` (`PATCH /clashes/:id`) dan `bulkUpdate()` (`POST /clashes/bulk`, yang **tidak** melalui `buildAllowedPatch()` — sebelum perubahan ini, bulk-assign sama sekali tidak divalidasi). Data lama diperbaiki lewat migrasi `20260806120000_null_non_engineer_assignees` (assignee non-Engineer di-null-kan, tanpa baris `AuditLog` — lihat §12 untuk alasannya). Terverifikasi: dropdown assignee di UI (detail & bulk) cuma menampilkan Engineer aktif, **dan** `fetch()` langsung ke `PATCH /clashes/:id`/`POST /clashes/bulk` dengan `assigneeId` Coordinator dari console browser (melewati UI) → `400 Bad Request`, bukan tersembunyi doang di client.

² **Sejak update ke-16, semua peran termasuk Management boleh berkomentar** — sebelumnya Management ditolak (`canComment()` lama). `canComment()` dihapus total, bukan diubah jadi selalu-`true` — tidak ada gating tersisa sama sekali, jadi jangan tambahkan lagi tanpa alasan baru.

³ **Kolom baru update ke-16** — sebelumnya lampiran cuma bisa ditambah saat clash dibuat, tidak ada kontrol sama sekali dari halaman detail. "Item sendiri" di kolom Edit tidak berlaku di sini — Engineer boleh upload ke clash siapa pun di proyeknya, hapus dibatasi berdasar **siapa yang mengunggah**, bukan siapa assignee/reporter clash-nya. Lihat §5 Tahap 2.

⁴ **Kolom baru update ke-16** — markup dibagikan ke semua anggota proyek (semua peran bisa MELIHAT), tapi menggambar/edit/hapus dibatasi seperti kolom Lampiran (berdasar pembuat markup, bukan assignee/reporter clash). Management tetap punya tool "Pilih"/"Geser" (bukan cuma baca statis) supaya bisa drag-to-pan gambar yang di-zoom. Lihat §5 Tahap 4.

Hapus clash (Admin-only, soft-delete) tidak masuk kategori "Edit item" — dipisah kolom sendiri karena sifatnya beda (reversibel lewat `POST /:id/restore`, bukan mengubah field). Lihat §5 Tahap 1.

Aturan terpusat di frontend: `src/lib/lookup.ts` (`canEditClash`, `canDeleteClash`, `canUploadAttachment`, `canDeleteAttachment`, `canDrawAnnotation`, `canEditAnnotation`, `isAssignable` — semua kecuali `canEditClash`/`isAssignable` baru update ke-16) + `src/lib/use-master-data.ts` (`allowedStatusTransitions`) + guard `use-require-auth.ts`/`use-require-admin.ts`.

**Sejak Sprint 1, RBAC juga ditegakkan di server** — guard frontend kini sekadar UX, bukan satu-satunya pertahanan. `RolesGuard` di NestJS menolak dengan 403, dan `JwtAuthGuard` global menolak request tanpa token dengan 401. **Sejak `ClashesModule`, ini juga berlaku untuk kolom "Edit item"** — bukan cuma peran, tapi juga "item sendiri", "status maju 1 langkah", dan sekarang "assignee harus Engineer aktif" ditegakkan di `ClashesService`, sudah diverifikasi lewat `fetch()` langsung yang melewati UI. Tabel endpoint lengkap ada di `apps/api/README.md`.

**Sejak update ke-12, ada dimensi otorisasi kedua yang independen dari tabel di atas: proyek.** Tabel ini menjawab "boleh apa", bukan "di proyek mana" — keduanya digabung, bukan salah satu menggantikan yang lain. Engineer tetap cuma bisa edit item sendiri, **dan** hanya untuk clash yang ada di proyek yang dia jadi anggotanya (`ProjectMember`). Coordinator/Management/Admin tetap terikat tabel di atas untuk "boleh apa", tapi khusus dimensi proyek mereka **lintas-proyek** (`CROSS_PROJECT_ROLES`, lihat §5 "Otorisasi multi-project"). Ditegakkan oleh `ProjectContextGuard` + `assertClashInProject`, bukan bagian dari tabel/kode RBAC yang dijelaskan di paragraf ini.

---

## 7. Status per sprint (Sprint Plan asli)

| Sprint | Fokus | Status | Catatan |
|---|---|---|---|
| 0 | Fondasi backend | ✅ Selesai | NestJS + Prisma + PostgreSQL, 4 migrasi ter-apply, seed idempoten, `/api/health`. CI (`.github/workflows/ci.yml`) + Dockerfile produksi (web & api) ditambahkan update ke-10 — lihat §12 untuk detail & yang masih tersisa |
| 1 | Auth, RBAC, Administrasi | ✅ Selesai | JWT + argon2id, RolesGuard (ProjectMemberGuard awalnya didefinisikan tapi tidak dipasang, sekarang diganti `ProjectContextGuard` yang benar-benar aktif — lihat §5 "Otorisasi multi-project", update ke-12), CRUD user/proyek/master-data, **frontend tersambung**, 12 unit test lulus |
| 2 | Input clash + lampiran | ✅ Selesai | Clash dari DB via `ClashesModule`; lampiran tersimpan di disk lewat `StorageService` (update ke-6, lihat §5 "Lampiran") |
| 3 | Clash Register | ✅ Selesai | Data clash dari DB, filter/sort/pagination server-side (`GET /clashes`, update ke-5) |
| 4 | Detail, komentar, audit, triase | ✅ Selesai | Komentar & audit dari DB (lazy-load per clash), RBAC field-level di server, audit trail server-generated; tab Riwayat sekarang refresh otomatis setelah edit (`updateClashField` memanggil `loadClashDetail` — diperbaiki di commit `548db09`) |
| 5 | Notifikasi email async | ✅ Selesai, terverifikasi live | BullMQ + Redis, `NotificationsProcessor` kirim email via MailHog (update ke-7, lihat §5 "Notifikasi async"); diverifikasi end-to-end di update ke-8 |
| 6 | Dashboard Manajemen | ✅ Selesai | Agregasi (KPI/tren/sebaran) dihitung server-side (`GET /clashes/metrics`, update ke-5) |
| 7 | Export Excel/PDF + Bulk update | ✅ Selesai | Export client-side (SheetJS + jsPDF); bulk update sekarang lewat `POST /clashes/bulk` |
| 8 | WhatsApp + preferensi kanal | ✅ Selesai, terverifikasi live | `WhatsAppService` mock (bukan Business API asli — lihat §5), preferensi pindah dari localStorage ke `GET`/`PATCH /notification-preferences/me` (update ke-7); diverifikasi end-to-end di update ke-8 |
| 9 | Bulk import CSV/XML | ✅ Selesai (update ke-9) | `ImportModule` async via BullMQ (`/import/preview`+`/commit`+`/jobs/:id`), CSV & XML (Navisworks/Solibri), dedup by `externalId`, auto-create master data (Admin), `POST /master-data/templates/copy`; lihat §5 "Impor massal" |
| 10 | Fitur AI (opsional) | ❌ Belum | Butuh eval harness + AI asli |
| 11 | Hardening, performa, deploy | 🟡 Sebagian besar selesai (update ke-11, rate limit & signed URL disempurnakan update ke-15) | Keamanan (helmet, rate limit **per-user sejak update ke-15**, exception filter, validasi env, refresh token versioning, RBAC lampiran, **signed URL lampiran sejak update ke-15**), observability (pino, Sentry opsional, `/health/ready`), dan uji beban 10.000 clash (semua target NFR lolos, terukur nyata) selesai. **Belum**: deploy ke host nyata (cuma artefak/dokumentasi, lihat §13), Prometheus, uptime 99,5% (butuh monitoring produksi riil). Lihat §12 untuk rincian lengkap. |
| — | **Otorisasi multi-project** (ad-hoc, bukan sprint asli) | ✅ Selesai (update ke-12) | `ProjectContextGuard` + `@SkipProjectScope()`/`@ActiveProject()`, isolasi per-proyek server-side untuk clash/master-data/import, `assertClashInProject` (404 bukan 403), `CROSS_PROJECT_ROLES`, project switcher + kelola anggota di frontend, harness IDOR baru via `supertest` (**sempat tidak pernah benar-benar berjalan karena bug glob Jest/ESLint — diperbaiki update ke-15, lihat §1**), diverifikasi live browser. Lihat §5 "Otorisasi multi-project". |
| — | **Soft-delete clash, kelola lampiran, pratinjau & markup vektor** (ad-hoc, bukan sprint asli) | ✅ Selesai (update ke-16) | 4 tahap: soft-delete Admin-only (`deletedAt` + `NOT_DELETED`), kelola lampiran penuh dari halaman detail (upload siapa saja, hapus cuma pengunggah/Coordinator/Admin), modal pratinjau (zoom/pan/refresh signed-URL proaktif), markup vektor (`Annotation` baru, overlay SVG, PDF via `pdfjs-dist`, "Unduh dengan markup"). + Management sekarang bisa berkomentar. Dua bug ditemukan HANYA lewat verifikasi mouse/keyboard sungguhan di browser — lolos semua unit test pada percobaan pertama (lihat §8/§9.28-30, wajib dibaca sebelum menyentuh `AnnotationLayer.tsx`). Lihat §5 "Soft-delete clash, kelola lampiran, pratinjau & markup vektor". |

**Langkah berikutnya yang paling masuk akal:** lihat §12.

---

## 8. Bug & jebakan yang ditemukan (lintas sesi)

Dicatat supaya tidak terulang kalau menyentuh file yang sama.

**Sesi siklus hidup clash & markup (update ke-16) — kedua bug ini paling berharga di seluruh dokumen ini, baca sebelum menyentuh `AnnotationLayer.tsx`/`AttachmentPreviewModal.tsx`:**

16a. **`useElementBox` (hook baru, ukur box render `<img>`/`<canvas>` via `ResizeObserver` utk overlay markup) memicu *"Maximum update depth exceeded"*.** Versi pertama memanggil `setBox({ width, height })` di dalam `useEffect` **tanpa dependency array** — efek jalan tiap render, `setBox` selalu dapat objek baru (walau nilainya sama), React re-render, efek jalan lagi, tanpa henti. Perbaikan pertama (tambah dependency array `[resetKey]` dari `current?.id`) **masih kurang**: pada render pertama `contentRef`-nya belum ter-mount sama sekali (elemen di balik placeholder "Memuat…" sampai `url` dari `useSignedUrl` resolve), jadi efek langsung `return` tanpa memasang observer — dan karena `resetKey` (id lampiran) tidak berubah lagi setelah `url` resolve, efeknya **tidak pernah dicoba ulang**, overlay markup tidak pernah muncul sama sekali. Perbaikan final: (1) `setBox` pakai updater fungsional yang cek kesetaraan nilai dulu (`prev.width === next.width && prev.height === next.height ? prev : next`) — memutus loop meski efek jalan berkali-kali; (2) dependency array hook diperluas jadi array eksplisit yang WAJIB menyertakan kondisi yang menggerbang elemen itu benar-benar ter-render (`[current?.id, url]`, bukan cuma `current?.id`) — kalau elemen di balik `ref` dikontrol kondisional (loading state, dst.), effect harus tahu kapan kondisi itu berubah, bukan cuma kapan "identitas logis"-nya berubah. **Pelajaran umum**: kalau bikin hook custom yang mengukur/mengobservasi elemen di balik ref, dependency array efeknya harus mencakup SEMUA kondisi yang menentukan kapan `ref.current` benar-benar terisi — bukan cuma id/key yang "kelihatan relevan".
16b. **Markup teks (tool "Teks" di `AnnotationLayer.tsx`) sama sekali tidak bisa diketik dengan mouse sungguhan — meski SEMUA unit test lolos, termasuk yang dibuat khusus untuk memverifikasi alur ini.** Kronologi: user melaporkan "tidak bisa edit text", agen memperbaiki 2 bug lain (termasuk 16a), menguji ulang dengan `javascript_tool`'s `dispatchEvent(new PointerEvent(...))` — lolos, dilaporkan "sudah bisa". User mencoba lagi di browser sungguhan — **masih tidak bisa sama sekali**. Root cause: klik `mousedown` pada elemen non-form (di sini `<svg>`) punya *default action* browser bawaan yaitu memindahkan fokus ke `<body>` — **default action ini dieksekusi SETELAH semua React event handler untuk event yang sama selesai**, termasuk commit yang memasang `<input autoFocus>`. Urutannya: `mousedown` → React `onPointerDown` handler jalan → `setTextDraft(...)` → React commit → `<input>` muncul & dapat fokus lewat `autoFocus` → **baru kemudian** browser menjalankan default action `mousedown` → fokus pindah ke `<body>` → `<input>` ter-blur di tick yang sama → `onBlur={commitText}` jalan dengan value masih kosong → input ditutup. Dari sudut pandang user: kotak input berkedip sepersekian detik lalu hilang, tidak sempat mengetik apa pun. **Kenapa lolos test**: `fireEvent`/`dispatchEvent` (baik dari Testing Library maupun `javascript_tool`) membuat event sintetis yang **tidak** memicu default action browser bawaan sama sekali — jadi langkah "browser pindahkan fokus ke body" itu tidak pernah terjadi di lingkungan test, dan assertion "input tetap ada & fokus" selalu benar di sana walau salah total di browser nyata. Perbaikan: `handleMouseDown` baru di `<svg>` yang memanggil `e.preventDefault()` — ini secara eksplisit membatalkan default action `mousedown`, termasuk pemindahan fokusnya. Test regresi baru (`AnnotationLayer.test.tsx`, "focus handling") sengaja **tidak** cuma cek state React, tapi assert `fireEvent.mouseDown(...)` mengembalikan `false` (tandanya `preventDefault()` benar-benar dipanggil) — itulah satu-satunya cara unit test bisa menangkap kelas bug ini sama sekali. **Pelajaran paling mahal di seluruh sesi**: untuk fitur interaktif berbasis pointer/mouse (drag-to-draw, klik-ganda, gambar bebas, apa pun yang punya alur fokus/gesture), **unit test dan `dispatchEvent` TIDAK CUKUP** — wajib diverifikasi dengan `computer` tool (klik & ketik sungguhan) di Browser pane sebelum melaporkan selesai ke user, karena default action browser adalah kelas bug yang benar-benar tidak terlihat lewat simulasi event sintetis apa pun.

**Sesi utang test & hardening (update ke-15):**

z1. **Jest `testRegex` dan ESLint `files: ["**/*.spec.ts"]` sama-sama tidak pernah cocok dengan nama file `*.e2e-spec.ts`.** Kedua pola mensyaratkan titik literal tepat sebelum "spec" (`\.spec\.ts$` / `**/*.spec.ts`); nama file `project-isolation.e2e-spec.ts` punya strip di posisi itu ("e2e-spec.ts"), bukan titik — jadi `npm test` **dan** `npm run lint` sama-sama diam-diam melewati file itu sejak ditulis di update ke-12, meski file itu sendiri diklaim sebagai "10 test baru" yang menyumbang ke hitungan total. Dikonfirmasi dengan `node -e "console.log(/.*\.spec\.ts$/.test('project-isolation.e2e-spec.ts'))"` → `false`. **Pelajaran**: kalau menambah file test dengan penamaan non-standar (`*.e2e-spec.ts`, `*.integration.ts`, dst.), verifikasi eksplisit dengan `--listTests` (Jest) atau jalankan lint langsung ke file itu (`npx eslint path/to/file`) — jangan asumsikan "ada di direktori yang benar" berarti "ikut ter-scan". Kedua pola sudah diperbaiki (lihat §1 update ke-15); kalau menambah varian penamaan baru lagi, ulangi pengecekan yang sama.
z2. **Begitu `project-isolation.e2e-spec.ts` benar-benar dijalankan untuk pertama kalinya (setelah z1 diperbaiki), file itu sendiri gagal total** — bukan cuma tidak-pernah-jalan, tapi memang belum pernah benar-benar teruji. Tiga bug independen sekaligus: fixture `makeClash()` yang inferensi tipenya sirkular (TypeScript gagal compile), `TestAppModule`-nya tidak menyediakan `ConfigService`/koneksi BullMQ yang dibutuhkan modul yang ikut ter-import transitif (`ClashesModule` → `StorageModule`/`NotificationsModule`), dan fixture id (`'clash-a'`) yang bentrok dengan `@IsUUID` di `BulkUpdateClashDto`. **Pelajaran**: sebuah file test yang "terlihat lengkap" (comment rapi, assertion masuk akal) bukan bukti pernah dijalankan — kalau ragu, jalankan `--listTests` dulu sebelum mempercayai klaim "N test lulus" di histori commit/handoff manapun, termasuk dokumen ini.
z3. **`vitest.setup.ts` tidak pernah mendaftarkan `afterEach(cleanup)` dari Testing Library.** Cleanup otomatis bawaan Testing Library butuh `global afterEach`, yang tidak ada karena `vitest.config.mts` tidak set `test.globals: true` — jadi setiap `render()` tetap menumpuk di DOM antar `it()` dalam satu file. 3 file test lama (`Badge.test.tsx` dkk) tidak pernah ketahuan karena masing-masing `it()` cuma render sekali dengan teks unik (tidak pernah render dua kali dengan elemen yang sama). Baru ketahuan saat `AppShell.test.tsx` (banyak `it()` yang masing-masing me-render ulang `<AppShell>`) langsung tabrakan `getByRole` "found multiple elements". Diperbaiki sekali di `vitest.setup.ts` (`afterEach(() => cleanup())`), otomatis berlaku untuk semua file test yang ada maupun mendatang.

**Sesi otorisasi multi-project (update ke-12):**

x. **`NotificationPreferenceController` kelewat saat memasang `ProjectContextGuard` global.** Guard baru itu deny-by-default — setiap controller yang bukan data proyek harus ditandai eksplisit `@SkipProjectScope()`. Semua controller lain (users, projects, master-data non-disiplin/zona, import) sudah ditandai lewat audit manual per-file, tapi `NotificationPreferenceController` (`/notification-preferences/me`) kelupaan karena letaknya di modul `notifications/`, bukan salah satu yang "kelihatan jelas" butuh scoping proyek. **Baru ketahuan lewat verifikasi browser** (bukan lewat test — tidak ada test yang menyentuh route ini sama sekali): login sukses tapi `GET /notification-preferences/me` balas 403 begitu `reloadMasterData()` jalan, padahal seharusnya selalu bisa diakses siapa pun yang login (preferensi per-user, bukan per-proyek). Diperbaiki: tambah `@SkipProjectScope()`. **Pelajaran untuk sesi berikutnya**: kalau menambah guard global baru yang butuh opt-in/opt-out per route, jangan cuma menandai controller yang "kelihatan" butuh — `grep -rn "@Controller(" apps/api/src` dulu untuk daftar lengkap, lalu putuskan tiap satu secara eksplisit (lihat daftar lengkap 8 controller di §3).
y. **`ForbiddenException`/`NotFoundException` yang tepat, bukan asal pilih satu.** Godaan awal adalah membuat semua penolakan proyek jadi 403 (lebih gampang seragam), tapi itu bocor informasi: 403 di level resource (`assertClashInProject`) berarti "clash ini ADA tapi bukan proyekmu" — atacker bisa memakai perbedaan 403 vs 404 untuk memetakan id yang valid di proyek lain. Aturan yang dipakai: guard level (header salah/hilang/non-member) → 403 (memang benar-benar "kamu tidak boleh pakai proyek ini"), resource level (clash/disiplin/zona yang ada tapi di proyek lain) → 404 (supaya tidak beda dari "tidak ada sama sekali"). Kalau menambah resource-scoped check baru, ikuti pembagian ini, jangan asal konsisten-1-kode-status.

**Sesi `ClashesModule` (update ke-4):**

a. **DTO clash memvalidasi id master data sebagai uuid, padahal bukan.** `CreateClashDto`/`UpdateClashDto`/`BulkUpdatePatchDto` awalnya pakai `@IsUUID()` untuk `disciplineId`/`zoneId`/`priorityId`/`statusId`/`assigneeId`. Semua id seed (`disc-ars`, `zone-1`, dst.) bukan uuid, jadi setiap request ditolak 400 dengan pesan "Disiplin/Zona/Prioritas tidak valid" — ketahuan langsung saat verifikasi browser (submit form clash baru). Diperbaiki: ganti jadi `@IsString() @MinLength(1)`. Lihat §5 "Id master data BUKAN uuid".
b. **`BulkToolbar` sudah `await onApply()` dengan benar, tapi `RegisterView.tsx` memberinya callback yang tidak mengembalikan Promise.** `onApply={(patch) => { bulkUpdateClashes(...); setSelectedIds(...); }}` — closure ini `undefined`, bukan `Promise`, jadi `await` di `BulkToolbar` langsung lanjut walau `bulkUpdateClashes` (network call) belum selesai. Efeknya: state `applying`/"Menerapkan…" tidak pernah sempat tampil, dan tidak ada jalur galat kalau request gagal. Diperbaiki: `onApply` di `RegisterView.tsx` sekarang `async` dan meng-`await` `bulkUpdateClashes` sebelum mengosongkan seleksi.
c. **Prisma `ClashUpdateInput` (checked) tidak mengekspos field FK skalar** ketika field itu punya relasi di schema — hanya bentuk relasi (`connect`/`disconnect`) yang tersedia. Karena `ClashesService.applyPatch` sudah memvalidasi keberadaan `statusId`/`priorityId`/`assigneeId` sebelum menulis, dipakai `Prisma.ClashUncheckedUpdateInput` supaya bisa set field skalar langsung tanpa ceremony `connect`.

**Sesi Sprint 1 (integrasi backend):**

0a. **PATCH per keystroke.** `/admin/master-data` memanggil `updateDiscipline` dari `onChange`, jadi menyambungkannya langsung ke API berarti satu request per huruf. Diperbaiki dengan optimistic update + debounce 500ms di `data-context.tsx` (lihat §5).
0b. **Daftar akun demo di `/login` jadi kosong.** Kartu itu dulu membaca `users` dari `useData()`; setelah user datang dari API, sebelum login daftarnya kosong. Diperbaiki: `DEMO_ACCOUNTS` ditulis statis di `login/page.tsx`.
0c. **Seed lama ber-UUID membuat proyek salah.** `projects/current` memakai `findFirst({ orderBy: createdAt asc })`, sehingga selama baris seed Sprint 0 (uuid, `PMW-01`) masih ada, sidebar menampilkan proyek yang salah dan chip filter jadi ganda. Baris-baris basi itu sudah dihapus; seed sekarang idempoten dan ber-id tetap.
0d. **`expiresIn` dari `ConfigService` tidak lolos tipe.** `@nestjs/jwt` mengetatkan `expiresIn` ke `number | StringValue`, sedangkan `config.get<string>()` mengembalikan `string`. Ditangani lewat helper `ttl()` di `auth.service.ts` — jangan diganti jadi `any`.

**Sesi frontend sebelumnya:**

1. **`RegisterView.tsx`** — filter memicu `router.replace()` Next.js di setiap klik → request RSC ke server tiap interaksi, terasa lemot. Diperbaiki: filter state murni di client + `window.history.replaceState` yang di-debounce 350ms.
2. **`FilterChips.tsx` / `RegisterView.tsx`** — re-render seluruh 24 chip filter tiap 1 klik karena handler & array opsi dibuat baru tiap render. Diperbaiki: `memo()` + opsi di-`useMemo`, handler di-`useCallback`.
3. **`DashboardView.tsx`** — semua bar chart Recharts tidak tergambar sama sekali (grup `<g>` kosong) karena animasi masuk bergantung `requestAnimationFrame`. Diperbaiki: `isAnimationActive={false}` di semua `<Bar>`/`<Line>`.
4. **`settings/notifications/page.tsx`** — toggle WhatsApp ON memvalidasi nomor tapi tidak ikut menyimpannya (hanya `whatsappEnabled` yang di-patch) → bisa aktif dengan nomor kosong kalau user tidak sempat blur field nomor dulu. Diperbaiki: nomor ikut disertakan dalam patch yang sama saat toggle ON.
5. **`dashboard-metrics.ts` / `RegisterView.tsx`** — array prioritas dari context tidak dijamin terurut bobot (Low→Critical), padahal ramp warna ordinal di dashboard dan urutan chip filter mengasumsikan urutan itu. Diperbaiki: `.sort((a,b) => a.bobot - b.bobot)` sebelum dipakai di kedua tempat.

---

## 9. Gotcha penting (baca sebelum menulis kode)

1. **`AGENTS.md` mewajibkan** membaca `node_modules/next/dist/docs/` sebelum menulis kode. Next.js 16 punya breaking change dari versi yang mungkin ada di data latihmu (contoh: `params`/`searchParams` di halaman adalah `Promise`, dipakai dengan `use()` bahkan di Client Component — lihat `src/app/clashes/[id]/page.tsx`).
2. **Jangan pakai `router.replace()` untuk update URL di jalur interaksi cepat** (filter, search, chip toggle). Pola yang dipakai: state di React + `window.history.replaceState` yang di-debounce. Lihat §8.1.
3. **Recharts wajib `isAnimationActive={false}`** di lingkungan ini. Lihat §8.3.
4. **ESLint `react-hooks/set-state-in-effect`** akan error pada hidrasi dari `localStorage` — beri `eslint-disable-next-line` dengan alasan (pola sudah ada di `data-context.tsx`, `auth-context.tsx`, `RegisterView.tsx`, `DashboardView.tsx`; jangan dihapus).
5. **`tsconfig.json` & `eslint.config.mjs` mengecualikan `apps/**`** — itu backend NestJS terpisah, bukan bagian dari proyek Next.js ini. Jangan hapus exclude ini kecuali memang berniat menyatukan monorepo.
6. **Warning lint yang aman & sudah diketahui:** `react-hooks/incompatible-library` pada `useReactTable` di `RegisterView.tsx` — TanStack Table memang stack wajib PRD.
7. **Next 16 hanya izinkan satu instance `next dev`** per proyek (lockfile). Jangan jalankan dua dev server. Hal serupa berlaku untuk backend: proses `nest start --watch` yang menumpuk akan **mengunci `node_modules/.prisma/client/query_engine-windows.dll.node`** sehingga `npx prisma generate` gagal dengan `EPERM`. Kalau kena itu, matikan dulu semua proses node yang menunjuk ke `D:\WebApp`.
8. **Warna chart divalidasi, bukan dikira-kira.** Kalau mengubah hex di `viz-tokens.ts`, jalankan ulang skill `dataviz` → `scripts/validate_palette.js`. Kategori nominal (disiplin, zona) pakai satu warna datar; hanya prioritas (tingkatan berurutan) yang boleh pakai ramp — dan array prioritas HARUS di-sort by `bobot` dulu sebelum dipetakan ke ramp (lihat §8.5).
9. **Testing browser di lingkungan ini kadang menembak race condition palsu.** Firing beberapa `.click()` sinkron dalam satu loop tanpa `await`/delay antar klik bisa membuat elemen DOM lama (sebelum re-render React) jadi stale reference — hasilnya klik kelihatan "gagal" padahal app-nya benar. Selalu beri jeda kecil (~50ms) antar interaksi saat menguji lewat `javascript_tool`.
10. **`localStorage` key sekarang `clashhub-data-v5`** (v1 → v2 saat master data jadi mutable, v2 → v3 saat master data pindah ke API, v3 → v4 saat clash/komentar/audit pindah ke API, v4 → v5 saat lampiran pindah ke object storage server-side). Tidak ada migrasi: kalau `JSON.parse` gagal, data lama hilang dan di-seed ulang. Kalau mengubah bentuk `LocalState` lagi, naikkan versinya.
11. **Access token TIDAK boleh dipindah ke `localStorage`.** Sekarang disimpan di variabel modul `src/lib/api/client.ts` supaya tidak terbaca XSS; ketahanan sesi datang dari cookie refresh `httpOnly`, bukan dari menyimpan token di disk.
12. **Jangan tambahkan CORS di backend.** `next.config.ts` mem-proxy `/api/*` ke `localhost:3001` lewat `rewrites`, jadi dari sisi browser semuanya same-origin dan cookie tetap first-party. Menambah CORS + `credentials: "include"` hanya akan menambah permukaan masalah tanpa manfaat.
13. **Id master data (disiplin/zona/prioritas/status/user) BUKAN uuid untuk baris hasil seed** — jangan pakai `@IsUUID()` di DTO backend untuk field yang mereferensikannya. Lihat §5 dan §8a.
14. **Mutator clash (`createClash`, `updateClashField`, `bulkUpdateClashes`, `addComment`) sekarang mengembalikan `Promise`.** Call site baru wajib `await` atau `.catch()` — kalau tidak, state loading/error di UI tidak akan pernah muncul (lihat §8b) dan galat jaringan jadi unhandled rejection yang senyap.
15. **Testing browser via `javascript_tool` di lingkungan ini: `await` top-level sering gagal dengan `SyntaxError`.** Pola yang jalan: bungkus dalam `(function() { ... })()` (IIFE, bukan arrow function kalau butuh `return`), atau untuk `fetch` async simpan hasilnya ke `window.__namaVariabel` di satu panggilan lalu baca di panggilan berikutnya. Redeclare `const`/`let` dengan nama sama di beberapa panggilan juga akan error ("Identifier ... has already been declared") karena scope tampaknya persisten antar panggilan — pakai IIFE atau nama variabel unik.
16. **`ClashesController.metrics()` (`GET /clashes/metrics`) HARUS didaftarkan sebelum `findOne()` (`GET /:id`).** NestJS/Express mencocokkan route sesuai urutan deklarasi di kelas — kalau `:id` dideklarasikan lebih dulu, request ke `/clashes/metrics` akan ketangkap sebagai `id="metrics"` alih-alih handler metrics. Kalau menambah route statis baru di bawah `/clashes`, taruh sebelum `:id`.
17. **`GET /clashes/metrics`'s `from`/`to` beda kontrak dari `GET /clashes`'s `cf`/`ct`.** `cf`/`ct` (dipakai Register) adalah tanggal saja (`YYYY-MM-DD`, dari `<input type="date">`) — backend yang menambahkan waktu akhir hari. `from`/`to` (dipakai Dashboard) adalah ISO instant lengkap (`Date#toISOString()`, sudah termasuk waktu & `Z`) — backend memakainya langsung tanpa modifikasi. Jangan disamakan formatnya kalau menyalin pola salah satu ke yang lain.
18. **`ClashesService.publishNotifications()` sengaja fire-and-forget** (`.catch()` + `Logger.warn`, bukan `await` di jalur request). Kalau Redis mati atau `queue.add()` gagal, `update()`/`bulkUpdate()` tetap harus sukses — notifikasi itu efek samping, bukan syarat clash-nya tersimpan. Jangan ubah jadi `await` tanpa try/catch, atau satu masalah Redis bisa menggagalkan semua edit clash.
19. **Sandbox agen di sesi update ke-7 tidak bisa menjalankan Docker** (`docker`/`docker compose` gagal connect ke named pipe Docker Desktop, dari Bash maupun PowerShell tool) meski Postgres yang sudah berjalan sebelumnya tetap kedeteksi (proses lain di luar sandbox). Kalau sesi berikutnya kena hal serupa, itu bukan masalah `docker-compose.yml`-nya — jalankan `docker compose up -d` dari terminal biasa di luar tool, atau minta user yang menjalankan.
20. **`NotificationPreferenceController` tidak punya `@Roles()`** — sengaja, karena setiap route-nya di-scope ke `/me` lewat `@CurrentUser()`, bukan ke id dari client. Jangan tambah parameter `userId` yang bisa dikontrol caller ke endpoint ini; itu akan membuka celah user A mengubah preferensi user B. Sejak update ke-12 juga ditandai `@SkipProjectScope()` (bukan data proyek — lihat §8x, ini sempat kelewat dan ketahuan lewat verifikasi browser, bukan test).
21. **Menambah `AuditLog.action` baru? Update `auditText()` di `clashes/[id]/page.tsx` juga.** Fungsi itu cuma punya case eksplisit untuk `"created"`; action lain jatuh ke cabang default yang mengasumsikan ada `field`/`oldValue`/`newValue` (dipakai untuk log perubahan field). Action tanpa field seperti `"imported"` (ditambah di update ke-9 untuk baris hasil impor) lolos type-check tapi merender `'... mengubah "" dari "undefined" ke "undefined".'` di runtime — cuma ketahuan lewat klik manual di browser, bukan dari test atau type-check. Ditemukan & diperbaiki di update ke-9.
22. **`docker compose` di `apps/api/docker-compose.yml` dijalankan dari CWD `apps/api`, bukan root** — `docker compose -f docker-compose.yml up -d` (bukan `-f apps/api/docker-compose.yml` dari root sambil `cwd` masih di `apps/api` dari perintah sebelumnya) akan mencoba path `apps/api/apps/api/docker-compose.yml` dan gagal "cannot find the path specified". Kalau tool Bash-mu mempertahankan `cd` antar panggilan (banyak yang begitu), cek `pwd` dulu sebelum menulis path relatif.
23. **Tool Bash otomatis yang "mencoba" set `input.files` lewat `form_input`/`.value =` pada `<input type=file>` akan gagal** (`InvalidStateError`, dilindungi browser). Yang berhasil: `javascript_tool` bikin `File` + `DataTransfer`, `input.files = dt.files`, lalu `input.dispatchEvent(new Event('change', {bubbles: true}))` — React menangkap event native ini lewat listener di root, jadi `onChange` tetap terpanggil. Dipakai untuk menguji `/import` end-to-end di update ke-9.
24. **Menambah controller/route baru sejak update ke-12? Putuskan `@SkipProjectScope()`-nya secara eksplisit, jangan asumsi.** `ProjectContextGuard` global itu deny-by-default — kalau lupa, route yang sebenarnya bukan data proyek (mis. preferensi per-user, pengaturan global) akan menolak semua request dengan 403 "Header X-Project-Id wajib disertakan" begitu ada user login (lihat §8x, kejadian nyata di sesi ini). Sebaliknya, kalau route itu memang data per-proyek (clash, disiplin, zona, import) JANGAN ditandai skip — nanti lolos tanpa scoping proyek sama sekali.
25. **`X-Project-Id` cuma dibaca dari header, bukan dari body/query.** Kalau menambah endpoint baru yang butuh tahu proyek aktif, pakai `@ActiveProject()` (nilai yang sudah diverifikasi `ProjectContextGuard`) — jangan baca `projectId` dari DTO/body/query request, itu datang dari client dan tidak diverifikasi kepemilikannya sama sekali.
26. **`CROSS_PROJECT_ROLES` (`common/constants/project-roles.ts`) itu satu-satunya tempat yang menentukan siapa bypass keanggotaan proyek.** Dipakai di dua tempat berbeda (`ProjectContextGuard` untuk cek akses, `ProjectsService.listAll/findCurrent` untuk isi daftar proyek) — kalau salah satunya diubah tanpa yang lain, Coordinator/Management/Admin bisa "diizinkan pakai proyek X" oleh guard tapi "tidak pernah melihat proyek X" di dropdown switcher (atau sebaliknya). Selalu ubah lewat konstanta ini, jangan hardcode `Role.ADMIN`/dst. di tempat baru.
27. **Resource yang beda proyek harus 404, bukan 403 — lihat §8y.** Kalau menambah resource-scoped check baru (mis. suatu saat ada model baru yang butuh isolasi proyek), ikuti pembagian: guard-level (header salah/non-member) → 403, resource-level (data ada tapi bukan di proyek aktif) → 404.
28. **Modul yang menyentuh `document`/`DOMMatrix` (`pdfjs-dist`, dan sejenisnya) HARUS diisolasi di file terpisah dan dimuat lewat `next/dynamic(() => import(...), { ssr: false })`.** Import statis akan meledak saat SSR/build (`document is not defined`) dan **tidak akan pernah berjalan di Vitest/jsdom** (jsdom tidak implementasi `getContext` canvas yang dibutuhkan pdf.js) — jangan pernah mengimpor `PdfPageCanvas.tsx` langsung dari file test, `vi.mock()` modulnya. Worker pdf.js (`pdf.worker.min.mjs`) tidak boleh diresolve bundler (`new URL(..., import.meta.url)` rapuh antara Turbopack dev vs `next build`) — dicopy ke `public/` lewat `scripts/copy-pdf-worker.mjs` via hook npm `predev`/`prebuild`, file hasil copy di-gitignore. Kalau menambah dependency serupa (WASM, native binding, dll.) yang cuma jalan di browser, ikuti pola yang sama: isolasi + dynamic import + verifikasi eksplisit dengan `next build` (bukan cuma `next dev`) sebelum dianggap selesai — lihat §8 (update ke-16) untuk kenapa ini ditandai sebagai risiko teknis terbesar sesi itu.
29. **`mousedown`/`click` pada elemen non-form (SVG, div, dst.) yang memasang `<input autoFocus>` sebagai respons harus `preventDefault()` pada `mousedown`-nya kalau ingin inputnya benar-benar bisa diketik.** Default action bawaan `mousedown` (memindah fokus ke elemen yang diklik atau `<body>`) dieksekusi browser **setelah** semua React event handler & commit untuk event yang sama — jadi urutan sebenarnya adalah "input dipasang & fokus lewat `autoFocus`" **lalu** "browser pindahkan fokus lagi" **lalu** input itu ter-blur di tick yang sama sebelum sempat ada input keyboard apa pun. Lihat §8 16b untuk kronologi lengkap (termasuk kenapa ini lolos semua unit test) — kalau menambah pola UI serupa (klik di kanvas/SVG untuk memunculkan input inline), langsung terapkan `onMouseDown={(e) => e.preventDefault()}` di elemen pemicunya, jangan tunggu bug ini terulang.
30. **Unit test dan `fireEvent`/`dispatchEvent` TIDAK memicu default action browser bawaan (perpindahan fokus, submit form, navigasi link, dst.) — jangan pernah menyimpulkan "fitur pointer/mouse ini berfungsi" hanya dari situ.** Ini alasan bug §8 16b lolos test pada percobaan pertama dan lolos verifikasi `javascript_tool`'s `dispatchEvent` pada percobaan kedua — baru ketahuan saat user mencoba dengan mouse sungguhan. **Aturan wajib untuk sesi berikutnya**: setiap fitur yang melibatkan gesture pointer (drag, klik-ganda, gambar bebas, apa pun yang bergantung pada urutan fokus/blur) harus diverifikasi dengan `computer` tool (klik & ketik betulan) di Browser pane SEBELUM dilaporkan selesai — bukan cukup dengan unit test hijau atau `javascript_tool`. Kalau test regresi ditulis untuk kelas bug ini, assert pada `defaultPrevented`/nilai balik `fireEvent.*()` (`false` berarti `preventDefault()` terpanggil), bukan cuma state React — lihat pola di `AnnotationLayer.test.tsx` "focus handling".
31. **`Clash_uniqueCode_live_key` dan `Clash_disciplineId_seq_live_key` (kedua partial unique index yang membuat gap-filling clash code bekerja, ditambah di migrasi `20260808120000_project_archive_and_clash_seq`) TIDAK bisa dinyatakan di `schema.prisma`** — Prisma tidak punya sintaks partial index. Setiap `prisma migrate dev` akan mem-diff schema terhadap shadow DB dan mencoba `DROP INDEX` keduanya lalu membuat ulang versi non-partial (yang salah). **Selalu edit migrasi yang di-generate untuk menghapus baris `DROP`/`CREATE INDEX` itu** sebelum `migrate dev` menerapkannya — jangan pernah biarkan window tanpa index sama sekali (satu migrasi tunggal untuk drop+create, jangan dipisah). Jalankan `npm run check:clash-seq` (baca `apps/api/scripts/check-clash-seq.ts`) setelah migrasi apa pun yang menyentuh tabel `Clash` untuk memastikan invarian `uniqueCode == project.code + '-' + discipline.code + '-' + seq` masih benar.
32. **Kode clash sekarang mengisi celah, dan restore bisa mengubah kode.** Sejak update fitur arsip-proyek/rename-cascade/gap-fill: hapus (soft-delete) sebuah clash membebaskan `uniqueCode`/`seq`-nya untuk dipakai clash baru di disiplin yang sama (`ClashesService.createClashRecord`, alokator di `clashes/clash-code.ts`). Kalau clash yang dihapus itu di-restore lewat `POST /clashes/:id/restore` dan kodenya sudah "diambil" clash lain, `restore()` memberi kode BARU di ujung urutan dan mencatatnya sebagai `AuditLog` action `code_reassigned` — bukan lagi lossless seperti sebelumnya. Kalau menambah `AuditLog.action` baru terkait ini, ingat gotcha 21: tambahkan case eksplisit di `auditText()` (`src/app/clashes/[id]/page.tsx`) untuk `code_changed` dan `code_reassigned`.
33. **Ada instalasi PostgreSQL 16 native Windows (service `postgresql-x64-16`, `C:\Program Files\PostgreSQL\16`) yang ikut listen di port 5432**, terpisah dari container `clashhub-postgres` yang dibuat `docker-compose.yml`. Karena keduanya bind ke `0.0.0.0:5432`/`::1:5432`, koneksi `localhost:5432` dari proses Node/Prisma di Windows host mendarat di service native itu, BUKAN di container Docker — container-nya kosong (`\dt` di dalamnya nol tabel) sementara data proyek yang sesungguhnya (seed + histori manual) ada di service native. Kalau `docker exec clashhub-postgres psql ...` menunjukkan tabel kosong padahal `prisma migrate status` bilang "up to date", ini penyebabnya — cek data lewat `psql` native (`"C:\Program Files\PostgreSQL\16\bin\psql.exe" -h localhost -U clashuser -d clashhub_db`), bukan lewat `docker exec`. Belum diperbaiki (di luar cakupan sesi ini); kalau mau menyelaraskan dengan alur `docker compose` yang didokumentasikan di §10, salah satu dari keduanya harus dimatikan atau port-nya diubah.
34. **`pg_advisory_xact_lock(int4, int4)` butuh KEDUA argumen persis `int4` — literal angka JS biasa lewat Prisma tagged-template raw query dikirim sebagai `bigint`, bukan `int4`, dan gagal runtime dengan error `42883` (`function ... does not exist`) yang TIDAK ketahuan oleh test unit manapun** karena semua test memock `$executeRaw`/`$queryRaw` sepenuhnya — hanya ketahuan lewat klik manual di browser sungguhan yang menembak Postgres asli (lihat `clash-code.ts` `lockDiscipline()`, ditemukan & diperbaiki saat verifikasi fitur arsip-proyek/rename-cascade/gap-fill: `restore()` gagal 500 di browser padahal 63 test clashes.service.spec.ts hijau semua). **Pelajaran wajib**: kalau raw SQL Prisma memanggil fungsi Postgres dengan overload sempit (banyak fungsi built-in cuma punya varian `int4`/`int8` tertentu, bukan keduanya), selalu cast eksplisit tipe tiap parameter (`${x}::int4`) alih-alih mengandalkan inferensi tipe Prisma — dan verifikasi lewat DB nyata (browser/`psql`), bukan cuma test bermock, untuk kode yang isi query-nya memanggil fungsi Postgres spesifik (bukan cuma `SELECT`/`UPDATE` generik).

35. **`apps/api/scripts/backup-db.sh` MENGHASILKAN BACKUP KOSONG di mesin dev ini, dan tetap melaporkan sukses.** Konsekuensi langsung dari gotcha 33: skrip itu `docker exec clashhub-postgres pg_dump`, sedangkan data sesungguhnya ada di PostgreSQL native Windows. Dump-nya valid secara format tapi berisi nol tabel — dan itu baru ketahuan saat Anda mencoba restore, yaitu momen terburuk untuk menemukannya. **Selama gotcha 33 belum diselesaikan, backup dev harus lewat binary native:**
    ```bash
    "C:/Program Files/PostgreSQL/16/bin/pg_dump.exe" -U clashuser -h localhost -F c \
      -f backups/nama.dump clashhub_db
    "C:/Program Files/PostgreSQL/16/bin/pg_restore.exe" -l backups/nama.dump | head   # WAJIB verifikasi
    ```
    Backup yang tidak diverifikasi bukan backup. `pg_dump` juga tidak menyertakan file di `apps/api/uploads/` — DB dan lampiran harus di-backup berpasangan, kalau tidak restore meninggalkan baris `Attachment` yang menunjuk file hilang.
36. **CSP aplikasi ini adalah `img-src 'self' data:` — `blob:` TIDAK diizinkan.** Setiap kode yang mengambil gambar lalu memasangnya ke `img.src` harus memakai URL same-origin (`/api/...`) atau `data:` URI, bukan `URL.createObjectURL()`. Browser memblokirnya diam-diam: tidak ada exception yang tertangkap, hanya `onerror` — jadi lolos typecheck, lolos build, dan lolos semua unit test. Ditemukan saat verifikasi browser fitur laporan clash (`src/lib/report/images.ts` versi pertama menghasilkan "0 gambar tertanam, 2 gagal"). Sebelum melonggarkan CSP di `next.config.ts`, pertimbangkan dulu apakah URL same-origin bisa dipakai langsung — di kasus itu ternyata bisa, dan malah menghemat satu fetch penuh per gambar.
37. **Peran lampiran (`Attachment.role`) menentukan isi dokumen yang dikirim KE LUAR perusahaan, dan sengaja tidak punya fallback.** Clash tanpa lampiran ber-`ORIGINAL`/`CLASH_DETECTION` menghasilkan sel gambar kosong di laporan — bukan "ambil saja lampiran pertama". Foto yang salah di laporan konsultan jauh lebih merugikan daripada sel kosong, dan ringkasan export menghitung berapa clash yang belum ditandai supaya kekosongan itu bisa dijelaskan. Kalau satu clash punya beberapa lampiran dengan peran sama, yang `createdAt`-nya terbaru menang (`ClashesService.report()`).

---

## 10. Menjalankan & verifikasi

Butuh **dua** server. Keduanya terdaftar di `.claude/launch.json`.

```bash
# sekali saja
docker compose -f apps/api/docker-compose.yml up -d
npm install && npm --prefix apps/api install
npm --prefix apps/api exec prisma migrate deploy
npm --prefix apps/api exec prisma db seed
```

Sejak update ke-12, seed membuat **dua** proyek (`proj-1`/MCA — data lama, tidak berubah — dan `proj-2`/GSB baru, 12 clash, 3 anggota) untuk membuktikan isolasi multi-project — lihat §5 "Otorisasi multi-project". Login sebagai `engineer@clashhub.dev` (Yanuar) untuk melihat single-project view (dia cuma anggota MCA, switcher otomatis sembunyi); login sebagai `admin@clashhub.dev` untuk melihat switcher dua proyek di sidebar.

Sejak update ke-7, `docker compose up -d` menjalankan **tiga** service, bukan dua: `postgres`, `redis` (dipakai BullMQ — sebelumnya nganggur), dan `mailhog` (kotak masuk email dev, UI di `http://localhost:8025`). Tanpa Redis hidup, `NotificationsProcessor` tidak akan memproses job (enqueue tetap jalan, tapi `.catch()` di `ClashesService.publishNotifications` cuma mencatat warning — clash update-nya sendiri tetap sukses, lihat §5 "Notifikasi async").

```bash
npm --prefix apps/api run start:dev   # API  → http://localhost:3001/api
```

```bash
npm run dev                            # Web → http://localhost:3000
```

Pemeriksaan:

```bash
npm run build && npm run lint && npm test   # frontend — build+lint+192 test/16 file (update ke-17:
                                             # +report/layout, +report/workbook (termasuk round-trip
                                             # xlsx), +report/images, +markup-flatten, +AttachmentPanel
                                             # peran laporan). Sebelumnya 120/10 (update ke-16:
                                             # update ke-16: +DeleteClashDialog, +AttachmentPanel,
                                             # +AttachmentPreviewModal, +AnnotationLayer, +annotations.ts,
                                             # +lookup diperluas). Build juga memvalidasi worker pdfjs-dist
                                             # (lihat §9.28) — jangan skip langkah build ini kalau menyentuh
                                             # PdfPageCanvas.tsx/AttachmentPreviewModal.tsx
npm --prefix apps/api run build             # backend
npm --prefix apps/api run lint              # backend lint (sejak update ke-10, lihat §1) — 0 error,
                                             # warning bawaan tidak berubah (fast-xml-parser + supertest
                                             # untyped) meski cakupan lint bertambah lewat modul anotasi
npm --prefix apps/api test                  # 301 unit+e2e test/26 suite (update ke-17: +report() termasuk
                                             # regresi N+1, +kill switch, +updateAttachmentRole,
                                             # +kolom resolve/RBAC). Sebelumnya 190/18 (update ke-16:
                                             # +annotations.service.spec.ts baru, +storage.service.spec.ts
                                             # (delete), +clashes.service.spec.ts (soft-delete/restore/
                                             # deleteAttachment), +overdue-scanner & notifications-processor
                                             # (filter clash terhapus)
```

Docker (opsional, untuk memverifikasi image produksi — lihat README §"Menjalankan dengan Docker"):

```bash
docker build -t clashhub-web .
docker build -t clashhub-api apps/api
```

Uji beban (opsional, k6 lewat Docker — lihat §12 untuk hasil terukur update ke-11). API harus jalan native (`npm --prefix apps/api run start:dev`), bukan container, supaya gampang di-tuning berulang tanpa rebuild image:

```bash
npm --prefix apps/api run seed:load-test          # +10.000 clash bertanda externalId 'loadtest-*'
docker run --rm -v "$(pwd)/apps/api/load-test:/scripts" grafana/k6 run /scripts/register.js
docker run --rm -v "$(pwd)/apps/api/load-test:/scripts" grafana/k6 run /scripts/dashboard.js
docker run --rm -v "$(pwd)/apps/api/load-test:/scripts" grafana/k6 run /scripts/export.js
npm --prefix apps/api run seed:load-test:cleanup  # hapus lagi, data demo tidak tersentuh
```

Di Git Bash/MSYS (Windows), prefix perintah `docker run` di atas dengan `MSYS_NO_PATHCONV=1` — tanpa itu path `/scripts/...` akan salah diterjemahkan jadi path Windows lokal (lihat error `"couldn't be found on local disk"` kalau lupa).

Performa: mode dev ~5x lebih lambat dari production. Untuk menilai kelancaran UI sesungguhnya, ukur di `npm run build && npm start`.

---

## 11. Parameter URL

**Register** (`/register`): `q`, `disc`, `stat`, `prio`, `zone`, `assignee` (comma-separated), `cf`/`ct` (rentang dibuat), `overdue=1`, `sort`, `dir`, `page`.

**Dashboard** (`/dashboard`): `range` (`30d`|`90d`|`1y`|`all`), `from`, `to`.

Drill-down dashboard → register memakai parameter yang sama (termasuk `overdue=1` dari kartu KPI Overdue), jadi keduanya tetap konsisten.

---

## 12. Rekomendasi langkah berikutnya

- ~~Object storage untuk lampiran (disk lokal dulu)~~ — **selesai (update ke-6)**, lihat §5 "Lampiran: object storage lokal". Masih S3/R2-ready lewat `StorageService`, belum ada implementasi cloud-nya — kerjakan itu kalau memang butuh multi-instance/deploy.
- ~~Filter/sort/pagination server-side untuk `GET /clashes`~~ — **selesai (update ke-5)**, lihat §5 "Clashes tidak lagi di-bulk-load".
- ~~Endpoint agregasi dashboard~~ — **selesai (update ke-5)**, `GET /clashes/metrics`.
- ~~Verifikasi target performa PRD di data besar~~ — **selesai & terukur nyata (update ke-11)**. `apps/api/prisma/seed-load-test.ts` (baru, saat itu) menambah 10.000 clash ke proyek demo yang sama — **catatan update ke-12**: kalimat ini ditulis saat ClashHub masih runtime single-project (`currentProject()` yang dijelaskan di sini sudah dihapus total sejak update ke-12, lihat §5 "Otorisasi multi-project"); skrip `seed-load-test.ts` sendiri memakai Prisma langsung (bukan lewat service yang dihapus itu), jadi tidak terpengaruh, tapi kalau menjalankannya ulang sekarang hasilnya menambah 10rb clash ke `proj-1`/MCA spesifik, bukan lagi "satu-satunya proyek yang ada" — sebagai gantinya baris ditandai `externalId: 'loadtest-<n>'`, sepenuhnya reversibel lewat satu `deleteMany` scoped, sudah dibuktikan: 10.091 clash saat pengujian → 91 clash setelah `npm run seed:load-test:cleanup`, sama seperti sebelum diseed). k6 (`apps/api/load-test/*.js`, dijalankan via `docker run grafana/k6` karena tidak ada binary k6 lokal, target `host.docker.internal:3001`) mengukur ketiga target NFR PRD 4.6 di 10.091 clash nyata:
  - Register (`GET /clashes`, filter+search+sort campuran): **p(95) = 87.55ms** (target ≤1000ms)
  - Dashboard (`GET /clashes/metrics`): **p(95) = 167.28ms** (target ≤3000ms) — dugaan awal bahwa 5-pass agregasi JS di `metrics()` (`clashes.service.ts:182-283`) akan jadi bottleneck ternyata tidak terbukti di skala 10rb: margin 18x di bawah target, jadi **sengaja tidak direfactor ke SQL `groupBy`** — menambah kompleksitas tanpa manfaat terukur. Revisit kalau skala jauh melewati 10rb.
  - Export (`GET /clashes?pageSize=10000`): **p(95) = 1.03s** (target ≤10.000ms)
  - `EXPLAIN ANALYZE` pada query search (`q`, `contains`/`ILIKE` tanpa index) dan filter `disciplineId` (juga tanpa index dedicated) sama-sama memakai `Clash_projectId_createdAt_idx` yang sudah ada secara efisien (index scan backward + filter, bukan seq scan penuh) berkat pola sort-by-date+limit yang dominan di Register — **index tambahan untuk `disciplineId`/`zoneId`/`priorityId` (diminta PRD 4.2) dievaluasi dan tidak ditambahkan** karena tidak ada bukti manfaat di skala target, bukan diabaikan diam-diam.
  - **Keterbatasan lingkungan uji, dicatat jujur**: diukur di Docker Postgres lokal (kemungkinan besar seluruhnya ter-cache di memori, latensi jaringan nyaris nol, satu node, tanpa beban tulis konkuren) — angka ini sinyal nyata bahwa arsitektur query saat ini memadai untuk 10rb baris, bukan jaminan untuk semua topologi produksi (disk I/O, jaringan, load tulis bersamaan bisa beda).
  - **Temuan penting saat uji beban**: rate limiter global 100 req/menit (baru ditambah sesi ini juga) langsung kena 83% gagal 429 di percobaan k6 pertama dengan cuma 10 VU — dinaikkan ke 600 req/menit per IP setelah dikonfirmasi 100 terlalu ketat untuk trafik Register yang wajar (lihat "Rate limiting" di bawah).
- ~~Sprint 5/8 (notifikasi email + WhatsApp async)~~ — **selesai (update ke-7), dan sudah diverifikasi live (update ke-8)**, lihat §5 "Notifikasi async" dan §1. Kelima langkah verifikasi (assign→email, status change→email 2 penerima, toggle WhatsApp→`Notification(channel=WHATSAPP, isSent=true)` tanpa fallback, `OverdueScannerService.scan()` 2x→44 baru lalu 0 dedup) semuanya lolos di sesi update ke-8 dengan Docker (`postgres`+`redis`+`mailhog`) benar-benar hidup — bukan lagi cuma mock. Catatan infra: di sesi update ke-8, `docker exec clashhub-postgres psql` sempat terlihat menunjukkan database kosong (0 tabel) padahal aplikasi jalan normal dengan data lengkap — ternyata `docker exec` tidak menjangkau proses postgres yang sebenarnya dipakai (ada ambiguitas engine/context Docker Desktop di mesin ini). Kalau butuh query DB langsung dari sesi Claude Code berikutnya, jangan pakai `docker exec ... psql`; pakai `node -e` dengan `@prisma/client` dari `apps/api` (connect via `DATABASE_URL` di `.env`, TCP asli, terbukti akurat) — lihat pola query yang dipakai di verifikasi ini kalau perlu contoh.
- **WhatsApp masih mock** (`MockWhatsAppProvider` di `apps/api/src/notifications/whatsapp.service.ts`) — kalau mau kirim WhatsApp sungguhan, ganti binding `WHATSAPP_PROVIDER` di `NotificationsModule` dengan implementasi `WhatsAppProvider` yang memanggil provider asli (mis. Meta Cloud API); `NotificationsProcessor` tidak perlu diubah.
- **Email lewat MailHog, bukan SMTP produksi** — ganti `SMTP_HOST`/`SMTP_PORT` di `.env` dan tambah `auth` di `email.service.ts` kalau provider aslinya butuh kredensial.
- ~~Refresh token rotation & blacklist~~ — **selesai (update ke-11)**. Pendekatan *versioned token*, bukan tabel revocation penuh: `User.refreshTokenVersion Int @default(0)` (migrasi baru), disertakan sebagai klaim `ver` di refresh JWT (`AuthService.issueTokens()`), diverifikasi cocok dengan nilai user saat ini di `AuthService.refresh()` — token lama otomatis tidak valid begitu `refreshTokenVersion` naik, meski tanda tangan & `exp`-nya masih sah. `AuthController.logout()` (masih `@Public()` — access token pemanggil mungkin sudah kedaluwarsa saat logout, jadi tidak boleh mewajibkan auth; sebagai gantinya baca `sub` dari cookie refresh yang dibawa) memanggil `AuthService.invalidateSession()` yang menaikkan versi — best-effort, tidak pernah melempar (cookie hilang/tidak valid = tidak ada yang perlu di-invalidate). Cookie `maxAge` yang tadinya konstanta hardcoded 7 hari (`auth.controller.ts:11`, lepas dari `JWT_REFRESH_TTL`) sekarang diturunkan dari env yang sama lewat paket `ms` — diverifikasi live: 6 percobaan login salah beruntun → percobaan ke-6 kena 429 (lihat rate limiting login di bawah), token refresh lama ditolak setelah versi naik (5 test baru di `auth.service.spec.ts`).
- ~~Hardening (Sprint 11)~~ — **sebagian besar selesai (update ke-11)**:
  - **`helmet`** terpasang di `main.ts` (setelah `cookieParser()`) — header keamanan (`Content-Security-Policy`, `X-Frame-Options`, dst.) terkonfirmasi muncul di response live.
  - **Rate limiting** (`@nestjs/throttler`): default global 600 req/menit **per user (`UserThrottlerGuard`, sejak update ke-15 — sebelumnya per-IP)**, jatuh ke IP untuk request tanpa `request.user` (rute `@Public()` seperti `/auth/login`, yang justru butuh per-IP untuk brute-force protection), `/auth/login` di-override lebih ketat (`@Throttle({ limit: 5, ttl: 60_000 })`) — diverifikasi live, percobaan ke-6 login salah beruntun kena 429. ~~**Catatan jujur**: throttle per-IP, bukan per-user — kantor/NAT bersama dengan banyak user bisa saling memengaruhi kuota~~ — **selesai (update ke-15)**: 610 request beruntun sebagai satu Engineer nyata → 600×`200` lalu 10×`429`; request berikutnya sebagai Coordinator lain dari IP yang sama, langsung setelahnya → `200`, membuktikan kuota benar-benar terpisah per-user.
  - **Global exception filter** (`common/filters/all-exceptions.filter.ts`, `@Catch()` semua): memetakan `Prisma.PrismaClientKnownRequestError` (`P2002`→409, `P2025`→404, `P2003`→400, lainnya→500 generik) dan `HttpException` bawaan Nest apa adanya, selain itu 500 generik ke client + log detail lengkap server-side + `Sentry.captureException()` (no-op kalau `SENTRY_DSN` kosong). Terdaftar via `APP_FILTER`.
  - **Validasi env saat boot** (`apps/api/src/config/env.validation.ts`, Joi): `DATABASE_URL`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` wajib, sisanya punya default. Diverifikasi live: hapus `DATABASE_URL` dari `.env` → boot gagal seketika dengan pesan `Config validation error: "DATABASE_URL" is required`, bukan gagal senyap di query pertama.
  - **Gap akses lampiran** — lihat §5 "Koreksi ProjectMemberGuard" di atas.
  - **Kredensial demo di `login/page.tsx`** — bukan dihapus, tapi dibungkus `process.env.NODE_ENV !== "production"` (bukan env var baru yang bisa lupa di-set — `NODE_ENV` otomatis dari tooling Next sendiri). Diverifikasi: teks "Akun demo" **hilang total dari bundle produksi** (dead-code elimination oleh bundler saat `false && (...)`, dicek langsung di `.next/static/chunks/*.js` hasil `npm run build`, bukan cuma disembunyikan CSS).
  - **Dependency & secret scan di CI**: `npm audit --audit-level=high` di job `api` (0 kerentanan, jadi gate keras) dan job `web` (**non-blocking**, `continue-on-error: true` — ada 2 kerentanan high yang sudah dikenal & belum bisa diperbaiki: `sharp` inherited dari `next`, butuh bump Next di luar range yang dinyatakan; `xlsx`/SheetJS, **tidak ada fix upstream sama sekali**, dan `xlsx` inti dari fitur export PRD — gate keras di sini cuma akan permanen merah tanpa jalan keluar). Job baru `security` menjalankan `gitleaks` CLI (bukan `gitleaks-action` yang butuh lisensi berbayar untuk repo org) lewat `docker run zricethezav/gitleaks`, scan seluruh riwayat git.
  - **Belum**: Prometheus (opsional secara eksplisit di sprint plan, butuh keputusan infra scrape target), deploy ke lingkungan nyata (lihat §13), uptime 99,5% (butuh monitoring produksi riil dari waktu ke waktu, tidak bisa diverifikasi dalam satu sesi coding).
- **Tes otomatis frontend** — Vitest disiapkan (`vitest.config.mts` + `vitest.setup.ts`, jsdom + Testing Library), **5 file/57 test lulus** (update ke-15, naik dari 3 file/36 test): `Badge.test.tsx`, `dashboard-metrics.test.ts`, `lookup.test.ts` (termasuk `allowedStatusTransitions` sejak update ke-15, diekstrak dari `use-master-data.ts`), **`AppShell.test.tsx`** dan **`BulkToolbar.test.tsx`** baru — yang pertama, `vitest.setup.ts` diperbaiki sekalian karena tidak pernah mendaftarkan `afterEach(cleanup)` Testing Library, lihat §1 update ke-15 untuk detail (`csv.test.ts` dihapus di update ke-9 bersama `csv.ts` — konsumen terakhirnya, `import/page.tsx`, sudah tidak memakainya). Kandidat berikutnya: `RegisterView` penuh — sengaja tidak dikerjakan di update ke-15 karena butuh mock seluruh `src/lib/api/` (fetch/sort/filter/pagination server-side), lebih cocok sesi terpisah dengan cakupan sendiri. Backend sekarang **147 test/17 suite** (update ke-15, naik dari 105/13 — termasuk `project-isolation.e2e-spec.ts` yang baru pertama kali *benar-benar* berjalan sesi ini, lihat §1). Jalankan dengan `npm test` (`npm run test:watch` untuk mode watch).
- ~~Sprint 9 (bulk import CSV/XML + template master data)~~ — **selesai (update ke-9)**, lihat §5 "Impor massal" dan §7.
- ~~Dockerfile + CI~~ — **selesai (update ke-10)**. `.github/workflows/ci.yml` (job `web`, `api`, `docker` — build image tanpa push, hanya jalan setelah `web`+`api` lulus), `Dockerfile` root (Next.js, `output: "standalone"`, multi-stage, non-root), `apps/api/Dockerfile` (NestJS, `prisma generate` di stage builder, client Prisma di-copy eksplisit ke stage prod-deps supaya tidak hilang kena `npm ci --omit=dev` yang fresh), `docker-compose.prod.yml` (web+api+postgres+redis, terpisah dari `apps/api/docker-compose.yml` yang tetap dipakai untuk dev). Kedua image sudah dibangun **dan dijalankan** lokal di sesi ini (bukan cuma `docker build` sukses) — web: container boot, `/login` respons 200; api: Nest app boot sampai semua module (`AppModule`, `AuthModule`, dst.) ter-inisialisasi. **Catatan jujur**: workflow CI belum pernah benar-benar dieksekusi di GitHub karena sesi ini tidak melakukan `git push` — perintah di dalamnya divalidasi dengan menjalankan urutan yang sama secara manual (lint, test, build, docker build), bukan lewat `act` (tidak terpasang di sandbox). Push & lihat run pertama adalah langkah pertama sesi berikutnya kalau CI mau benar-benar tervalidasi di GitHub.
- ~~Lint backend tidak pernah benar-benar jalan~~ — **selesai (update ke-10)**. `apps/api/eslint.config.mjs` baru (flat config ESLint 10 + typescript-eslint, `recommendedTypeChecked`); `npm --prefix apps/api run lint` sekarang 0 error (6 warning tersisa, semuanya dari `no-explicit-any`/`no-unsafe-*` pada hasil `fast-xml-parser.parse()` yang memang untyped — didokumentasikan sebagai `warn` yang disengaja di komentar config, bukan diabaikan diam-diam). Rule `unbound-method` dan `no-unnecessary-type-assertion` dimatikan khusus untuk `*.spec.ts` — keduanya false-positive sistematis pada pola Jest `expect(mock.method).toHaveBeenCalledWith(...)`, bukan bug. 5 temuan nyata di kode aplikasi (bukan test) diperbaiki: import mati (`BulkUpdatePatchDto` di `clashes.service.ts`), double-cast berlebih (`import.processor.ts`), floating promise di `bootstrap()` (`main.ts`, sekarang `.catch()` + `process.exit(1)`), `no-base-to-string` di `xml.parser.ts` (helper `stringifyCell()` baru, whitelist tipe primitif eksplisit alih-alih `String(unknown)` mentah), dan `async` tanpa `await` di `MockWhatsAppProvider.send()`. 79 test backend tetap lulus setelah semua perbaikan ini.
- ~~Worktree nyasar~~ — **dihapus (update ke-10)** lewat `git worktree remove` (bukan `rm -rf` manual) setelah dikonfirmasi bersih (`git status` kosong). `git worktree list` sekarang cuma satu baris. `.claude/**` juga ditambahkan ke `globalIgnores` di `eslint.config.mjs` root sebagai sabuk pengaman kalau ada worktree/scratch serupa di masa depan.
- ~~Otorisasi multi-project~~ — **selesai (update ke-12)**, lihat §5 "Otorisasi multi-project", §7, §9.24-27. **Yang masih bisa dikerjakan lebih lanjut, bukan blocker**:
  - UI kelola anggota di `/admin/projects` (`select` "Pilih user…") belum ada search/filter — akan tidak nyaman kalau jumlah user di satu perusahaan jadi ratusan. Cukup untuk skala demo saat ini.
  - `ImportService.getJob()` masih otorisasi berbasis "pembuat job atau Admin" (bukan berbasis membership proyek) — sengaja dipertahankan apa adanya (lebih ketat, bukan lebih longgar) karena di luar scope permintaan; kalau nanti mau diselaraskan supaya Coordinator lain di proyek yang sama juga bisa lihat job, itu perubahan kebijakan produk, bukan perbaikan bug.
  - ~~Belum ada test untuk endpoint membership (`GET/POST/DELETE /projects/:projectId/members`)~~ — **selesai (update ke-15)**: 11 unit test (`projects.service.spec.ts`) + 8 test HTTP (`project-members.e2e-spec.ts` baru), lihat §1.
  - `Status`/`Priority` sengaja **tetap global** lintas proyek (keputusan eksplisit user selama sesi ini, bukan keterbatasan teknis) — kalau produk nanti butuh status/prioritas berbeda per proyek, itu perubahan schema (`projectId` di kedua model) + migrasi data, bukan sekadar ubah guard.
- **Soft-delete clash, kelola lampiran, pratinjau & markup vektor** — **selesai (update ke-16)**, lihat §5 subbab terkait, §6, §7, §8 (16a/16b), §9.28-30. **Yang masih bisa dikerjakan lebih lanjut, bukan blocker**:
  - Belum ada UI "keranjang sampah" untuk clash terhapus di frontend — endpoint `GET /clashes?deleted=1` dan `POST /:id/restore` sudah ada dan sudah diverifikasi lewat backend/manual, tapi Admin harus lewat `fetch()`/API client langsung untuk restore, belum ada halaman.
  - Markup tidak punya resize handle (keputusan sengaja, bukan keterbatasan) — mengubah ukuran/posisi kotak/panah yang sudah dibuat berarti hapus lalu gambar ulang, bukan drag titik sudut. Kalau produk butuh presisi lebih, itu penambahan fitur baru, bukan bug.
  - "Unduh dengan markup" cuma meratakan **halaman PDF yang sedang aktif** ke satu PNG — tidak menyusun ulang PDF multi-halaman beranotasi. Kalau produk butuh itu, perlu `jspdf` (sudah jadi dependency untuk export lain) menyusun tiap halaman yang sudah diratakan jadi satu file PDF baru.
  - `PATCH .../annotations/:id` (endpoint update backend, dites & berfungsi) cuma dipakai UI untuk **mengedit isi teks** lewat klik-ganda — tidak ada jalur UI untuk mengubah warna/`strokeWidth` anotasi yang sudah dibuat (server mendukungnya, frontend belum memanggilnya untuk field itu). Bukan bug, cuma belum ada tombolnya.
  - Markup TEXT belum ada batas panjang di frontend (backend membatasi `text` maks 500 karakter lewat DTO, sudah cukup sebagai penjaga) — kalau mau UX yang lebih baik, tambahkan counter karakter di input inline-nya.
  - Modal pratinjau belum ada thumbnail strip/grid semua lampiran sekaligus — navigasi cuma panah kiri/kanan satu-satu. Cukup untuk jumlah lampiran per clash saat ini (maks 10, lihat validasi upload).

---

## 13. Deploy & rollback (update ke-11)

**Belum pernah dijalankan ke host nyata di sesi mana pun** — bagian ini adalah dokumentasi/kesiapan, bukan laporan deploy yang sudah terjadi. Ditulis supaya sesi berikutnya (atau siapa pun yang punya akses ke VPS/cloud target) tinggal ikuti langkahnya, bukan mendesain ulang dari nol.

### Deploy

Prasyarat: Docker + Docker Compose di host target, DNS/reverse proxy kalau perlu HTTPS (aplikasi sendiri tidak menangani TLS — lihat Sprint 11 asli soal ini, belum dikerjakan, lihat §12).

```bash
git clone <repo-ini> && cd WebApp
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env: WAJIB ganti JWT_ACCESS_SECRET & JWT_REFRESH_SECRET dari placeholder dev
# (lihat SMTP_*/REDIS_*/DATABASE_URL juga kalau tidak pakai default docker-compose.prod.yml)

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Web di `:3000`, API di `:3001/api`. `docker-compose.prod.yml` **tidak** menjalankan migrasi otomatis saat container start — sengaja, supaya migrasi selalu langkah eksplisit yang bisa dipantau, bukan bagian dari `up -d` yang gagal senyap kalau ada masalah.

Verifikasi pasca-deploy: `curl <host>:3001/api/health/ready` (§5/§9 Observability, update ke-11) harus 200 sebelum menganggap deploy sukses — ini cek DB **dan** Redis, bukan cuma proses hidup.

### Rollback

Migrasi Prisma **tidak otomatis reversible** — `prisma migrate deploy` tidak punya lawan `undo` bawaan yang aman untuk migrasi yang sudah mengubah data (cuma migrasi struktur murni yang gampang di-reverse manual). Jadi:

1. **Kalau migrasi baru BELUM dijalankan** (gagal sebelum `prisma migrate deploy`, atau image baru belum di-deploy sama sekali): cukup `docker compose -f docker-compose.prod.yml up -d` dengan image/tag sebelumnya. Aman, tidak ada state DB yang berubah.
2. **Kalau migrasi baru SUDAH dijalankan** dan perlu rollback aplikasi: **jangan** downgrade image ke versi lama tanpa juga menangani skema — kode lama tidak tahu kolom/tabel baru dan mungkin akan error di query yang menyentuhnya (atau lebih buruk, diam-diam salah). Opsi realistis:
   - Tulis migrasi "forward" baru yang membatalkan efeknya (bukan `migrate down`) — pendekatan yang lebih aman dan yang direkomendasikan Prisma sendiri.
   - Atau restore dari backup (`scripts/backup-db.sh`, lihat di bawah) kalau rollback-nya darurat dan kehilangan data sejak backup terakhir bisa diterima.
3. Backup **sebelum** menjalankan migrasi produksi apa pun — bukan opsional. `./apps/api/scripts/backup-db.sh` (default `CONTAINER=clashhub-postgres`; untuk stack produksi set `CONTAINER=clashhub-postgres-prod`, sudah didaftarkan di `docker-compose.prod.yml`). **Di mesin dev Windows ini skrip tersebut menghasilkan dump kosong — baca gotcha 35 sebelum mengandalkannya.**

### Rollback fitur Export Laporan Clash (update ke-17)

Fitur ini dirancang berlapis supaya pembatalan bisa dilakukan di tingkat termurah lebih dulu. Tag `pre-clash-report` menandai commit terakhir sebelum pengerjaannya.

| Lapis | Cara | Kehilangan data? | Waktu |
|---|---|---|---|
| 1 | `CLASH_REPORT_ENABLED=false` di `apps/api/.env`, restart API | tidak | ~10 detik |
| 2 | `git reset --hard pre-clash-report`, rebuild | tidak (kolom DB dibiarkan) | ~5 menit |
| 3 | jalankan `apps/api/prisma/rollback/*_DOWN.sql` | ya — teks resolve + tag peran hilang | ~1 menit |
| 4 | `pg_restore` dari dump pra-migrasi + kembalikan `uploads/` | ya — semua perubahan sejak backup | ~5 menit |

**Lapis 2 hampir selalu cukup, dan ini poin yang penting**: ketiga kolom yang ditambahkan migrasi `20260809131501` bersifat aditif murni (`Attachment.role` NOT NULL dengan DEFAULT, dua kolom `Clash` nullable). Prisma Client meng-generate daftar kolom SELECT/INSERT eksplisit dari schema saat ia di-generate, jadi client versi lama tidak pernah menyebut kolom-kolom ini dan INSERT-nya tetap valid. **Dibuktikan empiris, bukan diasumsikan**: `INSERT INTO "Attachment" (...)` gaya-lama tanpa kolom `role` dijalankan terhadap skema baru dan berhasil, terisi `OTHER` lewat DEFAULT. Artinya kode boleh di-rollback tanpa harus ikut menurunkan skema — kebalikan dari peringatan umum di poin 2 di atas, yang berlaku untuk migrasi yang mengubah data.

Lapis 3 (`prisma/rollback/`) sengaja diletakkan **di luar** `prisma/migrations/` supaya `migrate deploy` tidak pernah mengambilnya. Sudah diuji siklus turun-naik di DB salinan, bukan sekadar ditulis.

### Backup database

`apps/api/scripts/backup-db.sh` — `pg_dump` format custom (`-F c`, terkompresi, bisa direstore sebagian lewat `pg_restore`) lewat `docker exec` ke container Postgres (bukan butuh client Postgres lokal). Retensi default 7 hari (`RETENTION_DAYS`), lokasi default `apps/api/backups/` (di-gitignore). Sudah diverifikasi jalan sungguhan di sesi ini terhadap container dev (`clashhub-postgres`) — dump valid (`PGDMP` magic header terkonfirmasi).

```bash
./apps/api/scripts/backup-db.sh                                    # container dev
CONTAINER=clashhub-postgres-prod ./apps/api/scripts/backup-db.sh   # container produksi

# restore:
docker exec -i <container> pg_restore -U clashuser -d clashhub_db --clean --if-exists < apps/api/backups/clashhub_<timestamp>.dump
```

Jadwalkan lewat cron host (`crontab -e`, contoh ada di komentar skrip) **atau** aktifkan service `backup` yang sudah ada (dikomentari, opt-in) di `docker-compose.prod.yml` — tidak keduanya, pilih satu supaya tidak dobel backup. Skrip ini bukan pengganti snapshot/backup level provider cloud (mis. RDS automated backups) kalau nanti pindah ke managed Postgres — cukup memadai untuk self-hosted `docker-compose.prod.yml`.
