# CR Monitor — Dashboard Cost Reduction

Dashboard monitoring Cost Reduction (CR) terpusat untuk menggantikan proses manual via Excel.
Actual CR **dihitung otomatis oleh sistem** (`Budget − Actual Biaya`), status input tiap
departemen tampil real-time, dan laporan dapat diunduh kapan saja.

## Stack

| Layer    | Teknologi |
|----------|-----------|
| Frontend | Angular 22 (standalone + signals) + Tailwind CSS v4 + Chart.js |
| Backend  | Node.js + Express 5, **tanpa ORM** (raw SQL, parameterized query) |
| Database | MySQL (dev lokal) / SQL Server (produksi) — switch via env `DB_CLIENT` |
| Auth     | JWT httpOnly cookie + bcrypt, 3 role |

## Role & Akses

| Role | Akses |
|------|-------|
| **USER** (departemen) | Input idea + data bulanan departemennya, isi target tahunan, lihat dashboard/detail dept sendiri |
| **FA** | Monitoring read-only seluruh departemen (dashboard, monitoring, detail) |
| **MR** | Semua akses + edit/koreksi data terkunci + download laporan Excel/CSV |

## Aturan Bisnis

1. **Actual CR tidak pernah disimpan** — selalu `budget − actual_cost`, dihitung di query.
   Tidak ada lagi risiko rumus Excel terhapus/berubah.
2. **Batas waktu (dienforcement di server):**
   - Target tahunan: bisa diisi s/d **18 Februari** tahun berjalan
   - Data bulanan bulan M: dapat diisi **tanggal 18 bulan M sampai 18 bulan M+1**
     (satu jendela per bulan, berurutan — tidak ada dua bulan terbuka sekaligus)
   - Di luar jendela terkunci untuk USER; hanya **MR** yang dapat mengoreksi,
     dan penghapusan idea juga khusus MR
3. **Status kelengkapan** per departemen per bulan = semua idea non-CANCEL sudah punya
   data bulanan tsb → MR/FA tinggal buka halaman *Monitoring Status*.

## Struktur Proyek

```
costReduction/
├─ frontend/                 # Angular (src/app/features: login, dashboard, input,
│                            #   targets, monitoring, detail, laporan)
└─ backend/
   ├─ src/
   │  ├─ db/index.js         # adapter ganda mysql2 / mssql (placeholder ? seragam)
   │  ├─ middlewares/auth.js # requireAuth, requireRole, scope departemen, period lock
   │  ├─ routes/             # auth, meta, ideas(+monthly), targets, dashboard, report
   │  └─ utils/period.js     # aturan tanggal 18
   └─ scripts/
      ├─ seed.js             # buat DB+tabel+akun awal (idempotent, MySQL & MSSQL)
      └─ seed-sample.js      # data demo (khusus MySQL)
```

## Setup Dev Lokal (MySQL)

Prasyarat: Node 20+, MySQL berjalan (mis. Laragon/XAMPP).

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # sesuaikan MYSQL_USER/MYSQL_PASSWORD bila perlu
npm run seed                  # buat database cr_dashboard + tabel + akun
npm run seed:sample           # (opsional) data demo tahun berjalan
npm run dev                   # API di http://localhost:3000

# 2. Frontend (terminal baru)
cd frontend
npm install
npm start                     # ng serve + proxy /api -> :3000
# buka http://localhost:4200
```

### Akun awal (password semua: `cr123456`)

| Username     | Role | Keterangan        |
|--------------|------|-------------------|
| `mr`         | MR   | kelola & download |
| `fa`         | FA   | monitoring        |
| `produksi`   | USER | Dept Produksi     |
| `maintenance`| USER | Dept Maintenance  |
| `engineering`| USER | Dept Engineering  |

> Ganti password produksi dengan meng-update hash di tabel `users`
> (hash bcrypt), atau tambahkan akun baru langsung lewat SQL.

## Deploy Intranet (SQL Server + HRIS Integration)

> 📖 **Panduan lengkap langkah-demi-langkah ada di [`DEPLOY.md`](DEPLOY.md).**

Ringkasan:
1. Salin `.env.production` → `.env`, isi koneksi SQL Server & `JWT_SECRET`
2. `npm run seed` — membuat 5 tabel `CR_*` + 2 VIEW (translasi `hris_employee`/`mascoscenter`)
   + bootstrap password bcrypt(BirthDate) untuk semua karyawan aktif
3. Set role MR/FA manual: `INSERT INTO dbo.CR_user_roles VALUES (<Id_Employee>, 'MR');`
4. Build frontend, jalankan backend dengan PM2

**Prinsip keamanan:** tabel HRIS (`hris_employee`, `mascoscenter`) **tidak pernah
dimodifikasi** — aplikasi hanya membaca lewat VIEW. Semua data CR disimpan di tabel
baru ber-prefix `CR_` di database yang sama.

## Endpoint Utama

```
POST /api/auth/login|logout        GET /api/auth/me
GET  /api/meta                     GET  /api/departments
GET/POST /api/ideas                PUT/DELETE /api/ideas/:id
GET/PUT  /api/ideas/:id/monthly
GET/PUT  /api/targets?year&dept    PUT /api/targets/:year/:deptId
GET  /api/dashboard/summary|trend|completeness
GET  /api/report/detail            GET /api/report/export/excel|csv
```

## Catatan Desain

- Font memakai system stack (tanpa CDN eksternal) — aman untuk jaringan intranet tertutup.
- Semua query memakai placeholder `?` dan diterjemahkan adapter ke `@pN` saat MSSQL.
- Angka uang bertipe `DECIMAL(18,2)`; Actual CR negatif (overbudget) ditampilkan merah.
- Data historis tetap tersimpan per tahun; pilih tahun pada selector di tiap halaman.
