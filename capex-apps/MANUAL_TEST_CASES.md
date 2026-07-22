# Dokumen Test Case Manual — Capex Pro

Dokumen ini untuk **uji fungsional manual** aplikasi front-end **Capex Pro** (`capexapp`, Next.js). Sesuaikan data contoh (periode budget, kode aset, email) dengan lingkungan Anda.

## 1. Informasi umum

| Item | Keterangan |
|------|------------|
| Nama aplikasi | Capex Pro |
| Basis URL lokal | `http://localhost:3000` (default `npm run dev`) |
| Backend opsional | `NEXT_PUBLIC_CAPEXBE_URL` — jika diset, beberapa fitur memakai API Nest (`capexbe`) + token Supabase |
| Autentikasi | Supabase Auth (email/password); sesi juga bisa dipulihkan dari penyimpanan browser |
| Izin halaman | Per **role** dan **hierarchy** di Configuration; scope **All** / Archetype / HU mempengaruhi filter data |

### 1.1 Peta URL (slug)

| Fitur | Path |
|--------|------|
| Dashboard | `/` |
| Executive Summary | `/executive-summary` |
| Multi-Year Budget | `/multi-year-budget` |
| Budget Period | `/budget-period` |
| Budget Archetype | `/budget-archetype` |
| Budget HU | `/budget-hu` |
| Capex Project List | `/capex-project-list` |
| BDD Construction | `/bdd-construction` |
| My Task | `/my-task` |
| PO Update | `/po-update` |
| GR Update | `/gr-update` |
| FS Update | `/fs-update` |
| Data Migration | `/data-migration` |
| User Monitoring | `/user-monitoring` |
| Configuration | `/configuration` |
| My Profile | `/profile` |
| AI Control Tower | `/ai-analytics` *(tidak ada di sidebar default; akses langsung URL jika role mengizinkan)* |

### 1.2 Prasyarat umum

- [ ] Aplikasi berjalan dan environment (Supabase, `NEXT_PUBLIC_CAPEXBE_URL` jika dipakai) terkonfigurasi.
- [ ] Minimal satu **Budget Period** dan data proyek/aset tersedia (atau mock data terisi otomatis saat pertama kali).
- [ ] Akun uji: **Super Admin / full permission** dan **user dengan scope terbatas** (satu archetype atau beberapa HU).

### 1.3 Cara membaca tabel test

- **ID**: kode unik untuk pelacakan bug.
- **Hasil yang diharapkan**: kriteria lulus uji.
- **Prioritas**: P0 = kritis, P1 = penting, P2 = sekunder.

---

## 2. Autentikasi & sesi

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| AUTH-01 | Login valid | Buka app tanpa sesi valid → isi email & password benar → submit | Masuk ke shell aplikasi (sidebar + header), toast selamat datang jika ada handler login | P0 |
| AUTH-02 | Login invalid | Email/password salah | Pesan error di form, tidak masuk aplikasi | P0 |
| AUTH-03 | Field kosong | Submit tanpa email atau password | Peringatan validasi (mis. "Masukkan email") | P1 |
| AUTH-04 | Lupa password | Buka flow forgot password → isi email → kirim | Pesan sukses generik (email reset jika terdaftar) | P1 |
| AUTH-05 | Set password dari link recovery | Buka URL recovery Supabase (simulasi) | Form set password baru muncul; set password berhasil | P1 |
| AUTH-06 | Refresh halaman saat sudah login | Login → refresh (F5) | Tidak kembali ke login palsu; data dimuat; sesi `sessionStorage` / Supabase konsisten | P0 |
| AUTH-07 | Logout | Klik logout di sidebar | User keluar, kembali ke login, `sessionStorage` bersih | P0 |

---

## 3. Shell UI (sidebar, header, navigasi)

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| UI-01 | Menu sesuai role | Login sebagai user berbeda | Item sidebar hanya halaman yang `canAccessPage` izinkan | P0 |
| UI-02 | Navigasi aktif | Klik tiap menu yang terlihat | Halaman aktif ter-highlight, konten sesuai | P1 |
| UI-03 | Mobile menu | Perkecil viewport → buka/tutup menu hamburger | Overlay dan sidebar toggle benar | P2 |
| UI-04 | Filter periode (halaman dengan filter) | Di Dashboard / Executive Summary / Capex list / dll: ubah **Budget Period** di header | Data ikut periode; tidak error jika periode valid | P0 |
| UI-05 | Filter Archetype & HU | Di halaman yang menampilkan dropdown archetype/HU | Opsi sesuai **scope** user; data terfilter | P0 |
| UI-06 | Akses halaman tanpa izin | Langsung buka URL modul yang role tidak punya (mis. `/configuration`) | Layar "Access Denied" + tombol ke Dashboard | P0 |
| UI-07 | Perubahan belum disimpan | Di halaman edit budget: ubah data → navigasi ke menu lain | Modal unsaved changes; Simpan / Buang / Tutup bekerja | P0 |

---

## 4. Dashboard

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| DASH-01 | Muat data | Buka `/` dengan periode terpilih | Ringkasan anggaran, status proyek, chart (donut/bar), Sankey tampil atau state kosong yang jelas | P0 |
| DASH-02 | Backend snapshot | Dengan `NEXT_PUBLIC_CAPEXBE_URL` + token valid | Preferensi data dari backend snapshot bila tersedia | P1 |
| DASH-03 | Fallback klien | Tanpa backend / snapshot gagal | Fallback ke agregasi dari `budgetService` tanpa crash | P1 |
| DASH-04 | Ganti periode | Ubah periode di header | Metrik berubah mengikuti periode | P0 |

---

## 5. Executive Summary

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| ES-01 | Render halaman | Buka `/executive-summary` | Konten ringkasan eksekutif untuk periode terpilih tampil | P1 |
| ES-02 | Sinkron periode | Ganti periode di header | Data mengikuti periode | P1 |

---

## 6. Budget (Multi-Year, Period, Archetype, HU)

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| BUD-01 | Multi-Year — lihat daftar | `/multi-year-budget` | Daftar multi-year budget tampil | P0 |
| BUD-02 | Multi-Year — CRUD sesuai izin | Tambah/edit/hapus (jika UI menyediakan) | Sesuai level permission (View Only vs Edit) | P0 |
| BUD-03 | Budget Period | `/budget-period` — edit struktur periode | Simpan berhasil; pohon periode di shell ter-update | P0 |
| BUD-04 | Budget Archetype | `/budget-archetype` — pilih archetype dari header | Anggaran per kategori/archetype konsisten | P0 |
| BUD-05 | Budget HU | `/budget-hu` | Grid/tabel HU; edit sesuai permission | P0 |
| BUD-06 | Project Pipeline (di dalam HU) | Pada HU dengan tipe pipeline: buka bagian pipeline | `ProjectPipelinePage` berfungsi: tambah/edit stage pipeline sesuai UI | P1 |
| BUD-07 | Validasi & toast | Simpan dengan sukses / gagal | Toast sukses/error sesuai | P1 |

---

## 7. Capex Project List

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| CPL-01 | Muat daftar aset | `/capex-project-list` | Tabel/kartu aset terisi; loading state hilang | P0 |
| CPL-02 | Pencarian | Ketik di search (nama aset, kode, proyek, HU, archetype, task) | Hasil terfilter | P0 |
| CPL-03 | Filter HU / prioritas / budget / completion / meeting | Gunakan panel filter | Kombinasi filter bekerja | P1 |
| CPL-04 | Export (XLSX) | Jika ada tombol export | File terunduh dan berisi data yang terlihat | P1 |
| CPL-05 | Detail aset / timeline | Buka timeline / modal detail | Data task dan timeline konsisten | P0 |
| CPL-06 | Tambah MoM | Buka modal MoM → isi → simpan | Tersimpan; daftar ter-refresh | P1 |
| CPL-07 | Ad-hoc task | Buka modal adhoc task → buat | Task muncul di alur yang benar | P1 |
| CPL-08 | WhatsApp reminder | Buka reminder WA untuk task | Modal/generate link sesuai implementasi | P2 |
| CPL-09 | AI Analysis / summary | Buka modal analisis proyek | Respon atau placeholder tanpa error fatal | P2 |
| CPL-10 | Edit Project / Asset | Buka editor proyek atau aset | Simpan memperbarui data; permission respected | P0 |
| CPL-11 | Cache / backend bundle | Dengan BE aktif | Prefetch/cache project list mengurangi delay (observasi subjektif) | P2 |

---

## 8. BDD Construction

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| BDD-01 | Akses role | Login sebagai user **BDD** / **BDD_*** / Super Admin | Halaman tidak memblokir secara tidak semestinya | P0 |
| BDD-02 | Kanban vs list | Toggle view kanban / list | Kedua mode menampilkan data konsisten | P1 |
| BDD-03 | Filter & search | Sama seperti list proyek | Filter bekerja | P1 |
| BDD-04 | MoM / Adhoc / Timeline | Uji modal serupa Capex list | Simpan dan refresh OK | P1 |

---

## 9. My Task

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| MT-01 | Daftar task | `/my-task` | Task user tampil (dari BE atau fallback `taskService`) | P0 |
| MT-02 | Filter archetype/HU | Pilih filter | Hanya task dalam scope | P0 |
| MT-03 | Toggle completed | Tampilkan/sembunyikan selesai | Daftar berubah | P1 |
| MT-04 | Sort | Ubah opsi sort | Urutan sesuai opsi | P1 |
| MT-05 | Pagination | Ubah halaman / ukuran halaman | Data terpotong benar | P2 |
| MT-06 | Kanban | Drag atau pindah status (jika didukung) | Status ter-update | P1 |
| MT-07 | Complete task | Buka modal complete → isi → submit | Task selesai; notifikasi/toast | P0 |
| MT-08 | Align periode | Ganti budget period di header | Task mengikuti `periodName` jika BE memakai parameter itu | P1 |

---

## 10. PO Update, GR Update, FS Update

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| PO-01 | Buka halaman | `/po-update` | Daftar/form PO sesuai desain | P0 |
| PO-02 | Edit & simpan | Ubah nilai yang diizinkan | Simpan sukses; refresh budget/config jika di-hook | P0 |
| GR-01 | Buka halaman | `/gr-update` | GR goods received sesuai data | P0 |
| GR-02 | Sinkron qty | Ubah received qty | Konsisten dengan aset | P0 |
| FS-01 | Buka halaman | `/fs-update` (periode dari header) | FS update terikat periode | P0 |

---

## 11. Data Migration

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| DM-01 | Tab Smart Migration | Pilih "Smart Migration" | Wizard tampil; selesaikan langkah (dengan file uji kecil) | P0 |
| DM-02 | Offline Manager | Tab "Offline Manager" | Upload/proses dataset offline sesuai UI | P1 |
| DM-03 | Export full backup | Tab Utilities → Export | JSON terunduh | P1 |
| DM-04 | Import full backup | Pilih file backup → konfirmasi | Data ter-restore; reload (hati-hati di lingkungan non-prod) | P0 |
| DM-05 | Download template | Download template transaksi | File valid | P2 |

---

## 12. User Monitoring

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| UM-01 | Tab Users | `/user-monitoring` → Users | Statistik dan tabel aktivitas user | P1 |
| UM-02 | Tab Roles | Switch ke Roles | Metrik per role | P1 |
| UM-03 | Search | Cari nama user | Filter tabel | P2 |
| UM-04 | Refresh | Tombol refresh | Data di-fetch ulang | P2 |

---

## 13. Configuration

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| CFG-01 | Master data | Kelola kategori budget, prioritas, tag, dll. (sesuai tab) | CRUD sesuai permission | P0 |
| CFG-02 | Users & assignments | Tambah/edit user, role, scope (All / ARCH-* / HU-*) | User login melihat scope benar di filter | P0 |
| CFG-03 | Role & permissions | Edit matrix permission hierarchy | Halaman tersembunyi/readonly sesuai level | P0 |
| CFG-04 | Sidebar visibility | Nonaktifkan satu menu → simpan | Menu hilang dari sidebar; minimal satu menu utama tetap aktif (validasi) | P1 |
| CFG-05 | Archetype / HU config | Edit struktur organisasi budget | Muncul di dropdown header dan halaman budget | P1 |

---

## 14. My Profile

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| PROF-01 | Informasi user | `/profile` | Data profil dan role tampil | P1 |
| PROF-02 | Desktop notification toggle | Nyalakan/matikan | Preferensi tersimpan di `localStorage` per user | P2 |
| PROF-03 | Minta izin browser | Klik minta izin notifikasi | Browser prompt; toast sukses/gagal sesuai hasil | P2 |

---

## 15. Notifikasi (bell header)

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| NOTIF-01 | Daftar notifikasi | Buka bell | Daftar task/reminder tampil | P1 |
| NOTIF-02 | Tandai dibaca | Klik satu item | `isRead` true | P1 |
| NOTIF-03 | Tandai semua dibaca | Gunakan aksi "mark all" | Semua terbaca | P2 |
| NOTIF-04 | Polling task (opsional) | Tunggu / buat task baru atau due date besok | Notifikasi in-app/desktop sesuai pengaturan | P2 |

---

## 16. AI Control Tower

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| AI-01 | Akses langsung | Buka `/ai-analytics` dengan user berizin | Halaman AI analytics load | P1 |
| AI-02 | Tanpa izin | User tanpa hierarchy "AI Control Tower" | Access Denied | P1 |

---

## 17. Realtime & integrasi

| ID | Judul | Langkah | Hasil yang diharapkan | P |
|----|--------|---------|------------------------|---|
| RT-01 | Perubahan data di Supabase | Ubah row di DB dari klien lain / SQL | Setelah debounce, budget/users/notifications refresh (kecuali halaman Data Migration sedang aktif) | P2 |
| RT-02 | Keluar dari Data Migration | Selesai migrasi → navigasi ke Dashboard | Satu kali refresh sinkron pasca-migrasi | P2 |

---

## 18. Regression singkat (smoke — ±15 menit)

1. Login → Dashboard → ganti periode.  
2. Capex Project List → search + buka satu aset.  
3. My Task → buka satu task.  
4. Configuration → hanya baca satu tab (atau skip jika non-admin).  
5. Logout → login lagi.

---

## 19. Lampiran: checklist per sprint

Gunakan kolom: `Pass / Fail / Blocked / N/A` + nomor bug.

| ID | Tanggal uji | Tester | Status | Catatan |
|----|-------------|--------|--------|---------|
| AUTH-01 | | | | |
| … | | | | |

---

*Dokumen ini disusun dari struktur routing `src/lib/pageRoutes.ts`, menu `src/constants.tsx`, dan screen utama di `src/App.tsx`. Perbarui jika penamaan menu atau URL berubah.*
