# Tutorial Penggunaan — Capex Pro

Panduan ini menjelaskan **cara memakai aplikasi Capex Pro** dari sisi pengguna: masuk, navigasi, filter data, dan fungsi utama tiap modul. Nama menu di aplikasi mungkin sedikit berbeda (misalnya *AI Control Tower*); yang penting adalah **peran (role)** Anda menentukan menu mana yang terlihat dan tindakan mana yang diizinkan.

---

## 1. Apa itu Capex Pro?

**Capex Pro** adalah aplikasi perencanaan dan pemantauan **capital expenditure (capex)**: alokasi budget per periode, per archetype, per unit rumah sakit (HU), daftar proyek dan aset, pekerjaan (task), purchase order, goods received, dan ringkasan untuk manajemen.

- Data disimpan lewat **Supabase** (dan opsional **backend** terpisah jika environment Anda mengaktifkannya).  
- **Anda mungkin tidak melihat semua menu** di sidebar — itu normal; administrator mengatur **role** dan **scope** (cakupan archetype / HU / semua data).

---

## 2. Membuka aplikasi & masuk (login)

1. Buka alamat yang diberikan IT, misalnya `http://localhost:3000` (pengembangan) atau URL produksi.  
2. Jika belum tampil area kerja, Anda akan melihat **halaman login**.  
3. Masukkan **email** dan **password** yang sudah terdaftar, lalu kirim.  
4. Jika lupa password, gunakan alur **lupa password** di form (email reset dikirim sesuai pengaturan Supabase).  
5. Setelah sukses, Anda masuk ke tampilan utama: **sidebar** kiri, **header** atas, dan **konten** di tengah.

**Tips:** Setelah login, jangan ragu melakukan **refresh halaman (F5)**. Aplikasi berusaha mengingat sesi sehingga Anda tidak harus login berulang setiap kali (tergantung kebijakan keamanan organisasi Anda).

---

## 3. Struktur layar utama

| Area | Fungsi |
|------|--------|
| **Sidebar (kiri)** | Pintu ke setiap modul: Dashboard, Budget, daftar proyek, task, update PO/GR/FS, dan lainnya. Menu muncul sesuai **hak akses** Anda. |
| **Header (atas)** | Judul konteks, **ikon notifikasi**, dan di beberapa halaman: **filter Budget Period, Archetype, dan Hospital Unit (HU)**. |
| **Konten tengah** | Tabel, grafik, form, dan tombol aksi untuk halaman yang sedang dipilih. |
| **Bawah / footer sidebar** | Informasi user singkat, **My Profile**, dan **Logout** (keluar). |

**Mobile:** Ikon hamburger (tiga garis) membuka sidebar di layar kecil.

---

## 4. Filter global di header (sangat penting)

Beberapa halaman (misalnya **Dashboard**, **Executive Summary**, **Capex Project List**, **FS Update**, dan sebagainya) menampilkan tiga jenis filter di **header** saat tersedia:

1. **Budget period**  
   - Memilih periode anggaran yang ingin dianalisis atau dikerjakan.  
   - Semua angka, grafik, dan daftar proyek pada halaman itu mengikuti **periode** ini.

2. **Archetype**  
   - Mengarahkan fokus ke **kelompok** organisasi/penempatan budget (misalnya tipe fasilitas) dalam periode terpilih.

3. **Hospital Unit (HU)**  
   - Setelah memilih archetype, Anda memilih **unit** tertentu (rumah sakit/departemen) jika tersedia.  
   - Pilihan archetype dan HU hanya memuat data yang **sesuai scope** Anda. User dengan akses penuh melihat lebih banyak opsi.

**Praktik baik:** Setiap kali data “tidak pas”, periksa dulu **periode** dan **Unit** di header sebelum melaporkan error.

---

## 5. Alur kerja per menu (urutan logis)

### 5.1 Dashboard

- Tampilan **ringkas**: total budget, konsumsi, jumlah proyek, sebaran status (on track, at risk, off track), grafik kategori, dan alur dana (Sankey) jika datanya tersedia.  
- **Gunakan untuk** memantau kesehatan portofolio per periode, tanpa detail edit.

### 5.2 Executive Summary

- Fokus pada **ringkasan manajerial** (angka, trend, perbandingan) untuk periode di header.  
- Cocok untuk **presentasi** atau snapshot cepat ke pimpinan.

### 5.3 Multi-Year Budget

- Mengelola **rentang multi-tahun** (planning jangka panjang) terkait struktur periode budget.  
- Biasanya dipakai user **keuangan / perencanaan** dengan **izin edit** pada level ini.

### 5.4 Budget Period → Archetype → Budget HU

Ini **rantai turunan** yang semakin detail:

- **Budget Period:** anggaran pada **satu periode** (nama periode) — struktur dan porsi aggregate.  
- **Budget Archetype:** porsi dan detail di level **archetype** di dalam periode tersebut.  
- **Budget HU:** turun sampai **hospital unit**; di sini seringkali muncul **proyek** dan, jika mekanismenya dipakai, alur **project pipeline** (perencanaan pipeline).

Jika mengubah angka, **simpan** sesuai tombol di halaman. Aplikasi dapat memperingatkan **perubahan belum disimpan** jika Anda pindah halaman — pilih **simpan** atau **buang** agar jelas.

### 5.5 Capex Project List

- **Pusat operasional** untuk melihat aset per proyek, progress, pencarian, filter (HU, prioritas, anggaran, range completion, dsb).  
- Anda dapat membuka **detail aset / timeline pekerjaan**, menambah **minutes of meeting (MoM)**, membuat **task ad-hoc**, membuka **reminder** (jika tersedia), dan mengedit **proyek / aset** bila diberi hak.  
- Beberapa tindakan membuka **modal** — baca isian dengan teliti lalu **simpan**.

**Ekspor:** Jika tombol **export** (misalnya ke Excel) ada, gunakan setelah memfilter sehingga file hanya memuat data yang relevan.

### 5.6 BDD Construction

- Tampilan khusus proses **BDD (business/design development) / konstruksi**: umumnya **tampilan kanban atau daftar** dengan filter serupa.  
- Tim **BDD** (atau peran serupa) memetakan progres per aset. Super Admin sering memiliki akses penuh.

### 5.7 My Task

- Semua **task** yang di-assign ke Anda: pencarian, filter archetype/HU, urutan, paginasi, tampilan **list/kanban** (tergantung desain), dan **menyelesaikan task** (complete) lewat alur form/modal.  
- Task dapat mengikuti **periode anggaran** yang sama dengan header, jika backend diset begitu.  
- Gunakan halaman ini sebagai **to-do list harian**.

### 5.8 PO Update, GR Update, FS Update

| Halaman | Arti singkat |
|--------|----------------|
| **PO Update** | Mencatat / memperbarui informasi **Purchase Order** terkait aset. |
| **GR Update** | Mencatat **Goods Received** (penerimaan barang) dan jumlah. |
| **FS Update** | **Financial / FS** yang diikat per **periode** di header (jika memakai filter). |

Hanya role yang diberi izin pada level **PO / GR / FS** yang akan melihat menu ini.

### 5.9 Data Migration

- Untuk **admin / IT / power user** saat unggah data massal, migrasi dari file, atau **backup/restore** sistem.  
- Ada alat **Smart Migration**, **Offline Manager**, dan **Utilities (backup/restore full)**.  
- **Hati-hati** dengan **import full backup** — operasi ini bisa **menimpa** data. Lakukan hanya setelah arahan IT dan di lingkungan yang tepat (misalnya staging).

### 5.10 User Monitoring

- **Laporan aktivitas** user dan, di tab terpisah, metrik per **peran (role)**.  
- Membantu melihat adopsi pengguna, user aktif, dan sejenisnya (isi detail mengikuti implementasi saat ini).

### 5.11 Configuration (konfigurasi)

Biasanya hanya **administrator**:

- **Pengguna & peran** — membuat user, memberi **role** dan **scope** (all, archetype tertentu, HU tertentu).  
- **Master data** — kategori budget, prioritas, tipe aset, dan pengaturan lain.  
- **Tampilan sidebar** (jika tersedia) — menyembunyikan menu yang tidak perlu, dengan tetap menjaga setidaknya **satu** menu navigasi aktif.  

Perubahan di sini langsung mempengaruhi **siapa boleh masuk ke halaman mana** di seluruh organisasi.

### 5.12 AI Control Tower (opsional)

- Fitur analitik/AI. Di banyak deployment, halaman ini diakses lewat alamat: **`/ai-analytics`** (ketik setelah domain dasar) dan hanya tampil jika **peran** Anda memiliki izin.  
- Jika tidak tampil di menu samping, tanyakan ke admin apakah modul ini diaktifkan untuk peran Anda.

### 5.13 My Profile (Profil saya)

- Lihat data akun, peran, dan (jika tersedia) **pengaturan notifikasi desktop** (aktifkan izin notifikasi di browser jika diminta).

---

## 6. Notifikasi (ikon lonceng)

- Ikon notifikasi di **header** menampilkan pemberitahuan (misalnya **task** baru, reminder jatuh tempo).  
- Anda dapat menandai dibaca per item atau “tandai semua” jika tersedia.  
- Aplikasi dapat meminta **izin notifikasi browser** — opsional, untuk peringatan di luar tab.

---

## 7. Keluar (logout)

- Di **sidebar bawah**, klik **logout**.  
- Sesi aplikasi (dan sesi auth yang dilimpahkan ke Supabase) dihentikan; Anda kembali ke tampilan login.  
- Gunakan logout jika mengerjakan dari **perangkat bersama**.

---

## 8. Masalah umum & solusi cepat

| Gejala | Hal yang perlu dicek |
|--------|----------------------|
| Data kosong / tidak update | Pilih **Budget period** (dan archetype/HU) yang benar di header. |
| Menu tidak muncul | Bukan error — **role** atau **visibilitas menu** dibatasi admin. |
| “Access Denied” | Peran tidak punya **View** untuk halaman itu. Hubungi admin untuk penyesuaian **permission** / **scope**. |
| Perubahan belum tersimpan | Simpan dulu, atau pilih buang lalu pindah halaman saat muncul **peringatan perubahan**. |
| Tampilan lama setelah perubahan orang lain | Tunggu beberapa saat; aplikasi dapat menyegarkan saat data di basis berubah, atau **refresh** manual. |

---

## 9. Ringkasan alur “sehari hari”

1. **Login** → cek notifikasi task.  
2. Pilih **periode** (dan bila perlu **archetype/HU**).  
3. Buka **Capex Project List** atau **My Task** tergantung fokus harian.  
4. Lanjut ke **PO / GR / FS** bila perlu memperbarui transaksi.  
5. Cek **Dashboard** atau **Executive Summary** bila butuh big picture.  
6. **Logout** bila selesai di perangkat umum.

---

*Dokumen ini disusun untuk memandu pengguna akhir. Untuk uji coba sistematis fitur, gunakan `MANUAL_TEST_CASES.md` di folder proyek yang sama.*
