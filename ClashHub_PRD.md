# Product Requirements Document — ClashHub

**Web Platform Manajemen Clash & Issue Koordinasi BIM**

Versi 1.0 · Draft · 31 Juli 2026

---

## 0. Konteks Dokumen

Dokumen ini menjadi *single source of truth* untuk pengembangan **ClashHub**, sebuah web platform untuk mengelola clash dan issue hasil koordinasi model BIM (Building Information Modeling) pada proyek konstruksi. Alur inti: engineer/koordinator meng-input clash atau issue, data masuk ke Clash Register terpusat, lalu tersedia dashboard ringkasan untuk manajemen serta halaman rincian per item untuk verifikasi dan penyelesaian.

| Atribut | Detail |
|---|---|
| Domain | BIM / Konstruksi (koordinasi antar disiplin ARS / STR / MEP) |
| Tipe produk | Web application (multi-user, berbasis peran) |
| Integrasi | Standalone — input manual; dengan export laporan (Excel/PDF) & notifikasi (Email/WhatsApp) |
| Tech stack | Rekomendasi — belum ditetapkan tim (lihat Bagian 4) |
| Status | Draft untuk direview stakeholder |

---

## 1. Executive Summary

### 1.1 Problem Statement

Clash dan issue hasil koordinasi model BIM saat ini dikelola secara terpisah lewat spreadsheet dan email, sehingga status penyelesaian sulit dilacak, tanggung jawab tidak jelas, dan manajemen tidak punya visibilitas real-time atas risiko yang belum terselesaikan sebelum berdampak ke jadwal dan biaya konstruksi.

### 1.2 Proposed Solution

ClashHub menyediakan satu register clash terpusat: engineer meng-input clash/issue lewat form terstruktur, koordinator meng-assign dan melacak resolusi, dan manajemen memantau kesehatan proyek lewat dashboard KPI — dengan notifikasi otomatis serta export laporan Excel/PDF untuk kebutuhan rapat.

### 1.3 Success Criteria (KPI)

- Waktu rata-rata dari clash terdeteksi hingga ditutup (*mean time to resolution*) turun ≥ 40% dibanding proses spreadsheet dalam 3 bulan pertama.
- ≥ 90% clash aktif memiliki penanggung jawab (assignee) dan due date yang jelas di register.
- Dashboard manajemen memuat data dan siap ditampilkan dalam ≤ 3 detik untuk proyek berisi hingga 10.000 clash.
- ≥ 80% pengguna aktif mingguan (field engineer & koordinator) menggunakan platform sebagai satu-satunya sumber status clash dalam 2 bulan.
- Laporan status untuk rapat manajemen dapat di-export dalam ≤ 10 detik tanpa penyusunan manual.

---

## 2. User Experience & Functionality

### 2.1 User Personas

| Persona | Peran | Kebutuhan Utama |
|---|---|---|
| Field / Design Engineer | Pelapor | Input clash/issue dengan cepat, lampirkan bukti (screenshot/lokasi), pantau item miliknya. |
| BIM Coordinator / Lead | Pengelola | Triase, assign, atur prioritas & due date, verifikasi resolusi, tutup clash. |
| Project / Senior Management | Peninjau | Lihat dashboard KPI tren & risiko lintas disiplin; read-only, tanpa edit. |
| System Administrator | Admin | Kelola user & peran, proyek, master data (disiplin, status, prioritas), pengaturan sistem. |

### 2.2 User Flow Inti

1. **Input** — Engineer/Koordinator membuat clash/issue baru melalui form terstruktur (disiplin, lokasi/zona, prioritas, deskripsi, lampiran).
2. **Register** — Item otomatis masuk ke Clash Register terpusat dengan ID unik dan status awal *Open*.
3. **Assign & Track** — Koordinator men-triase, menetapkan assignee, prioritas, dan due date; status bergerak (Open → In Progress → Resolved → Closed).
4. **Resolve & Verify** — Assignee menandai resolusi dengan catatan/bukti; koordinator memverifikasi lalu menutup.
5. **Monitor** — Manajemen meninjau dashboard KPI; notifikasi otomatis dikirim untuk assignment & item overdue; laporan di-export bila diperlukan.

### 2.3 User Stories & Acceptance Criteria

#### Epik A — Input Clash / Issue

**US-A1** — *Sebagai field engineer, saya ingin meng-input clash/issue lewat form terstruktur sehingga setiap laporan konsisten dan lengkap.*

Acceptance Criteria:

- Form wajib memuat: judul, disiplin (ARS/STR/MEP/lainnya), lokasi/zona/level, prioritas, deskripsi.
- Field wajib divalidasi sebelum submit; pesan error jelas per field.
- Mendukung lampiran (gambar/PDF, ≥ 5 file, maks 10 MB per file).
- Setelah submit, item langsung tampil di register dengan ID unik dan timestamp.

**US-A2** — *Sebagai engineer, saya ingin melihat daftar clash yang saya laporkan atau yang di-assign ke saya sehingga saya bisa fokus pada tanggung jawab saya.*

Acceptance Criteria:

- Tersedia filter cepat "Reported by me" dan "Assigned to me".
- Daftar menampilkan status, prioritas, dan due date tiap item.

#### Epik B — Clash Register

**US-B1** — *Sebagai koordinator, saya ingin melihat seluruh clash dalam satu register yang bisa difilter dan disortir sehingga saya dapat men-triase secara efisien.*

Acceptance Criteria:

- Register mendukung filter berdasarkan disiplin, status, prioritas, assignee, zona, dan rentang tanggal.
- Mendukung sortir per kolom dan pencarian teks bebas.
- Mendukung pagination/virtual scroll agar tetap responsif hingga 10.000 baris.
- Setiap baris menautkan ke halaman rincian item.

**US-B2** — *Sebagai koordinator, saya ingin meng-assign clash serta menetapkan prioritas dan due date sehingga tanggung jawab dan target waktu jelas.*

Acceptance Criteria:

- Bisa menetapkan assignee dari daftar user proyek.
- Perubahan status, assignee, dan due date tercatat di audit trail (siapa, kapan).
- Notifikasi dikirim otomatis ke assignee saat item di-assign.

**US-B3** — *Sebagai koordinator, saya ingin update massal (bulk) untuk beberapa clash sekaligus sehingga penanganan batch lebih cepat.*

Acceptance Criteria:

- Bisa memilih beberapa item dan mengubah status/assignee/prioritas sekaligus.
- Konfirmasi ditampilkan sebelum perubahan diterapkan.

#### Epik C — Rincian Item

**US-C1** — *Sebagai pengguna, saya ingin membuka halaman rincian tiap clash/issue sehingga saya melihat konteks lengkap dan riwayatnya.*

Acceptance Criteria:

- Menampilkan seluruh field, lampiran, komentar/diskusi, dan audit trail kronologis.
- Pengguna berwenang bisa menambah komentar dan mengubah status.
- Perubahan status memicu notifikasi ke pihak terkait.

#### Epik D — Dashboard Manajemen

**US-D1** — *Sebagai manajemen, saya ingin dashboard ringkasan level tinggi sehingga saya bisa menilai kesehatan proyek sekilas.*

Acceptance Criteria:

- Menampilkan KPI: total clash, open vs closed, overdue, dan mean time to resolution.
- Menampilkan tren penyelesaian dari waktu ke waktu (grafik garis/burndown).
- Menampilkan sebaran per disiplin, prioritas, dan zona (grafik).
- Dashboard read-only dan termuat dalam ≤ 3 detik untuk 10.000 clash.

**US-D2** — *Sebagai manajemen, saya ingin drill-down dari elemen dashboard ke daftar clash terkait sehingga saya bisa menyelidiki isu spesifik.*

Acceptance Criteria:

- Klik segmen grafik memfilter register sesuai konteks (mis. hanya "MEP overdue").
- Filter dashboard bisa disetel per proyek dan rentang tanggal.

#### Epik E — Notifikasi & Laporan

**US-E1** — *Sebagai pengguna, saya ingin menerima notifikasi Email/WhatsApp sehingga saya tidak melewatkan assignment atau item overdue.*

Acceptance Criteria:

- Notifikasi terkirim saat: item di-assign, status berubah, dan item melewati due date.
- Pengguna bisa mengatur preferensi kanal (email dan/atau WhatsApp).
- Isi notifikasi memuat ID clash, ringkasan, dan tautan langsung ke item.

**US-E2** — *Sebagai manajemen/koordinator, saya ingin export laporan ke Excel dan PDF sehingga siap dipakai untuk rapat.*

Acceptance Criteria:

- Export menghormati filter yang sedang aktif di register.
- Excel berisi kolom terstruktur; PDF berisi ringkasan KPI + tabel.
- Export selesai dalam ≤ 10 detik untuk 10.000 baris.

#### Epik F — Administrasi & Akses

**US-F1** — *Sebagai admin, saya ingin mengelola user, peran, dan proyek sehingga akses terkendali sesuai tanggung jawab.*

Acceptance Criteria:

- Admin bisa membuat/menonaktifkan user dan menetapkan peran (Engineer, Coordinator, Management, Admin).
- Role-based access control (RBAC): Management read-only; Engineer input & item miliknya; Coordinator kelola penuh dalam proyek.
- Admin bisa mengelola master data: daftar disiplin, status, prioritas, dan zona.

### 2.4 Non-Goals (Di luar cakupan)

- **Deteksi clash otomatis dari model 3D** — ClashHub tidak menjalankan clash detection; input berasal dari hasil deteksi tool lain (mis. Navisworks/Solibri) yang dimasukkan manual.
- **Import otomatis / integrasi langsung dengan tool BIM** (Navisworks, Revit, BIM 360) — tidak termasuk MVP; input manual saja.
- **Viewer model 3D interaktif** di dalam platform.
- **Manajemen jadwal proyek** (scheduling/Gantt) dan modul biaya/estimasi.
- **Aplikasi mobile native** — MVP fokus web responsif; app native dipertimbangkan di masa depan.

---

## 3. Kebutuhan Sistem AI

Tidak berlaku untuk MVP. ClashHub v1 adalah sistem manajemen data terstruktur tanpa komponen AI inti. Kandidat AI opsional untuk roadmap masa depan (v2.0) dicatat sebagai peluang, bukan kebutuhan:

- Auto-kategorisasi/prioritisasi clash dari teks deskripsi.
- Deteksi duplikat clash saat input.
- Ringkasan naratif otomatis untuk laporan manajemen.

*Bila fitur AI diadopsi, wajib disertai strategi evaluasi: benchmark berlabel, target akurasi minimum, dan mekanisme human-in-the-loop sebelum dirilis.*

---

## 4. Technical Specifications

### 4.1 Architecture Overview

Arsitektur web tiga lapis standar: frontend SPA, backend API, dan database relasional. Alur data mengikuti user flow di Bagian 2.2 — form input menulis ke API, API menyimpan ke database dan memicu notifikasi async; dashboard membaca data teragregasi lewat endpoint read yang teroptimasi.

- **Frontend**: Single Page Application responsif; halaman utama Register (tabel), Detail Item, dan Dashboard (chart).
- **Backend**: REST API dengan RBAC; layanan terpisah/worker untuk notifikasi async dan generasi export.
- **Database**: relasional dengan indeks pada kolom filter utama (disiplin, status, prioritas, assignee, zona, tanggal) untuk memenuhi target performa.
- **Penyimpanan file**: object storage untuk lampiran (gambar/PDF).

### 4.2 Rekomendasi Tech Stack

Tech stack belum ditetapkan tim. Berikut rekomendasi (bukan keputusan final):

| Lapisan | Rekomendasi | Alasan Singkat |
|---|---|---|
| Frontend | Next.js / React + TypeScript | Ekosistem matang, komponen tabel & chart melimpah, SSR untuk performa. |
| UI & Chart | Tailwind CSS + komponen tabel (mis. TanStack Table) + Recharts/Chart.js | Tabel besar responsif & grafik dashboard. |
| Backend | Node.js (NestJS) atau alternatif tim | Satu bahasa dengan frontend; RBAC & modularitas. |
| Database | PostgreSQL | Relasional, query agregasi & indeks kuat untuk register besar. |
| Auth | Auth berbasis JWT + RBAC (mis. Auth.js/Keycloak) | Kontrol akses per peran. |
| Notifikasi | Email (SMTP/penyedia) + WhatsApp Business API | Kanal sesuai kebutuhan. |
| Export | Library Excel (mis. ExcelJS) + PDF (mis. Puppeteer/pdfmake) | Export terstruktur & cepat. |
| Hosting | Cloud (containerized) + object storage | Skalabilitas & penyimpanan lampiran. |

### 4.3 Model Data Inti (ringkas)

| Entitas | Field Kunci |
|---|---|
| Clash/Issue | id, judul, deskripsi, disiplin, zona/level, prioritas, status, reporter, assignee, due_date, created_at, closed_at, project_id |
| Lampiran | id, clash_id, nama_file, url, tipe, ukuran, uploaded_by |
| Komentar | id, clash_id, author, isi, created_at |
| Audit Log | id, clash_id, actor, aksi, nilai_lama, nilai_baru, timestamp |
| User | id, nama, email, peran, status_aktif |
| Project | id, nama, kode, daftar_disiplin, daftar_zona |

### 4.4 Integration Points

- Layanan email (SMTP atau penyedia transaksional) untuk notifikasi.
- WhatsApp Business API untuk notifikasi WhatsApp.
- Object storage (mis. S3-compatible) untuk lampiran.
- Endpoint export Excel/PDF (internal service).

### 4.5 Security & Privacy

- RBAC ketat: Management read-only; hak edit hanya untuk Coordinator/Engineer sesuai kepemilikan; Admin untuk manajemen sistem.
- Autentikasi wajib untuk semua endpoint; enkripsi transport (HTTPS/TLS).
- Audit trail tak-terhapus untuk setiap perubahan status/assignment.
- Kontrol akses lampiran (URL bertanda tangan/temporer, bukan publik).
- Backup database terjadwal dan kebijakan retensi data proyek.

### 4.6 Kebutuhan Non-Fungsional

| Aspek | Target |
|---|---|
| Performa dashboard | Muat & tampil ≤ 3 detik untuk proyek ≤ 10.000 clash. |
| Performa register | Filter/sortir responsif (≤ 1 detik) via indeks & pagination. |
| Export | ≤ 10 detik untuk 10.000 baris (Excel & PDF). |
| Ketersediaan | Uptime target ≥ 99,5%. |
| Responsif | Layout usable pada layar tablet & desktop. |
| Skalabilitas | Mendukung multi-proyek dan multi-user konkuren. |

---

## 5. Risks & Roadmap

### 5.1 Phased Rollout

| Fase | Cakupan | Nilai Utama |
|---|---|---|
| MVP | Input clash/issue, Clash Register (filter/sortir/search), Halaman Rincian, RBAC dasar, notifikasi email. | Satu register terpusat menggantikan spreadsheet. |
| v1.1 | Dashboard manajemen (KPI + tren + drill-down), notifikasi WhatsApp, export Excel/PDF, bulk update. | Visibilitas manajemen & pelaporan otomatis. |
| v2.0 | Master data lanjutan, bulk import CSV/XML dari tool BIM, opsi fitur AI (kategorisasi/deteksi duplikat), pertimbangan mobile. | Efisiensi input & wawasan lebih dalam. |

### 5.2 Technical & Product Risks

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Performa dashboard pada register besar | Dashboard lambat, adopsi manajemen turun | Pra-agregasi/materialized view, indeks, caching, pagination. |
| Deliverabilitas & biaya WhatsApp API | Notifikasi gagal/mahal | Mulai dari email; WhatsApp opsional dengan penyedia resmi & fallback email. |
| Adopsi rendah vs kebiasaan spreadsheet | Data tidak lengkap, KPI tidak akurat | Form cepat, import awal, pelatihan singkat, jadikan sumber tunggal status. |
| Konsistensi data input manual | Duplikat/klasifikasi tidak seragam | Field terstruktur & master data terkontrol; deteksi duplikat (roadmap). |
| Scope creep ke fitur BIM viewer/detection | Timeline melar | Non-Goals ditegakkan; fitur besar masuk v2.0. |

### 5.3 Pertanyaan Terbuka (TBD)

- Konfirmasi final tech stack oleh tim engineering.
- Volume proyek & jumlah user konkuren untuk sizing infrastruktur.
- Penyedia WhatsApp Business API dan anggaran per pesan.
- Kebijakan retensi & residency data (khususnya untuk proyek klien).
- Perlukah SSO (mis. Google/Microsoft) untuk login perusahaan?

---

*Akhir dokumen — ClashHub PRD v1.0 (Draft). Mohon review per bagian dan beri masukan.*
