# 🚀 Panduan Deploy Production — CR Monitor

> Target: Windows Server intranet + SQL Server (database HRIS existing).
> Prinsip: **tabel HRIS tidak pernah dimodifikasi** — aplikasi hanya membaca
> lewat VIEW dan menyimpan data di tabel baru ber-prefix `CR_`.

---

## 0. Prasyarat

| Item | Keterangan |
|---|---|
| Node.js LTS ≥ 20 | [nodejs.org](https://nodejs.org) — install di server |
| SQL Server | Instance sudah jalan, TCP/IP port 1433 aktif |
| Akses admin DB | Login `sa` atau setara (untuk buat login `cr_app`) |
| Port bebas | 3000 (atau ganti via `PORT` env) |

---

## 1. Buat Login Aplikasi (sekali saja)

Jalankan di SSMS sebagai `sa`:

```sql
USE [NAMA_DB_HRIS_ANDA];
CREATE LOGIN cr_app WITH PASSWORD = 'PasswordKu4t!2026';
CREATE USER cr_app FOR LOGIN cr_app;
-- Hak baca/tulis semua tabel & view:
ALTER ROLE db_datareader ADD MEMBER cr_app;
ALTER ROLE db_datawriter ADD MEMBER cr_app;
-- Hak membuat tabel/view/view saat seed:
GRANT CREATE TABLE TO cr_app;
GRANT CREATE VIEW TO cr_app;
```

> Setelah seed selesai, `CREATE TABLE/VIEW` boleh dicabut:
> `REVOKE CREATE TABLE FROM cr_app; REVOKE CREATE VIEW FROM cr_app;`

---

## 2. Salin Project ke Server

```powershell
# Dari mesin development:
robocopy .\backend C:\apps\cr-monitor\backend /E /XF node_modules
robocopy .\frontend C:\apps\cr-monitor\frontend /E /XF node_modules dist
```

---

## 3. Konfigurasi `.env`

```bash
cd C:\apps\cr-monitor\backend
copy .env.production .env
notepad .env   # isi: MSSQL_HOST, MSSQL_PASSWORD, MSSQL_DATABASE, JWT_SECRET
```

**Wajib isi:**
- `MSSQL_HOST` → IP/nama server SQL Server
- `MSSQL_PASSWORD` → password `cr_app`
- `MSSQL_DATABASE` → **nama database HRIS existing** (bukan database baru)
- `JWT_SECRET` → random 64 karakter, contoh PowerShell:
  ```powershell
  -join ((1..64) | % { '{0:x}' -f (Get-Random -Max 16) })
  ```

---

## 4. Install Dependencies & Seed

```bash
cd C:\apps\cr-monitor\backend
npm ci
npm run seed
```

**Output yang diharapkan:**
```
Pre-flight OK: hris_employee, mascoscenter ditemukan (tidak akan disentuh).
Collision OK: tidak ada objek CR_* bentrok.
  tabel  + CR_user_credentials
  tabel  + CR_user_roles
  tabel  + CR_ideas
  tabel  + CR_idea_monthly
  tabel  + CR_department_targets
  view   + CR_departments
  view   + CR_users
Bootstrap password (BirthDate): N karyawan aktif.
```

> ⚠️ Jika muncul "Collision GAGAL" → ada objek `CR_*` sudah ada. Jika itu
> sisa percobaan sebelumnya, hapus dulu lalu jalankan ulang.

---

## 5. Set Role MR & FA (manual, sekali)

Semua user default `USER`. Untuk menjadikan seseorang MR atau FA:

```sql
INSERT INTO dbo.CR_user_roles (employee_id, role) VALUES (<Id_Employee>, 'MR');
INSERT INTO dbo.CR_user_roles (employee_id, role) VALUES (<Id_Employee>, 'FA');
```

Cari `Id_Employee`: `SELECT Id_Employee, NIP, Name FROM hris_Employee WHERE Name LIKE '%nama%'`.

---

## 5b. Hardening Permission (WAJIB, setelah set role MR/FA)

Jalankan script `backend/scripts/harden-permissions.sql` di SSMS sebagai `sa`:

- Buat role `cr_app_runtime` → hak SELECT/INSERT/UPDATE/DELETE
- **DENY** langsung ke `hris_Employee` & `MASCOSTCENTER` (hanya via VIEW)
- Cabut `db_datareader`/`db_datawriter` + `CREATE TABLE/VIEW` dari `cr_app`

Setelah script jalan, update `.env` produksi:
```
MSSQL_USER=cr_app        ← ganti dari sa
MSSQL_PASSWORD=<password cr_app>
```

Verifikasi dengan menjalankan bagian akhir script → harusnya 3 test semua ✅.

> **Penting:** Setelah hardening, tabel HRIS tidak bisa dibaca langsung — hanya
> lewat VIEW yang sudah membatasi kolom (NIP, Name, DepartID, role, is_active).
> Data sensitif (Address, Phone, NPWP, BPJS, dll) tersembunyi total.

---

## 6. Build Frontend

```bash
cd C:\apps\cr-monitor\frontend
npm ci
npm run build
# Output: dist/cr-dashboard/browser/
```

---

## 7. Jalankan sebagai Service (PM2)

```bash
cd C:\apps\cr-monitor\backend
npm i -g pm2
pm2 start src/index.js --name cr-monitor
pm2 save

# Agar auto-start saat server reboot:
pm2 startup
# Ikuti instruksi yang ditampilkan (copy-paste command ke PowerShell Admin)
```

Cek: `pm2 list` → status **online**. Log: `pm2 logs cr-monitor`.

---

## 8. Buka Firewall

```powershell
New-NetFirewallRule -DisplayName "CR Monitor" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

Akses dari PC lain: `http://<IP-SERVER>:3000`

---

## 9. Checklist Smoke Test Production

| # | Skenario | Harus |
|---|---|---|
| 1 | Buka dari PC lain | Halaman login tampil |
| 2 | Login MR (NIP + password BirthDate `YYYY-MM-DD`) | Masuk dashboard |
| 3 | Klik Target Tahunan | Data langsung tampil |
| 4 | USER isi data bulan berjalan | Format ribuan `90.000.000`, tersimpan |
| 5 | USER coba isi bulan terkunci | 403 terkunci |
| 6 | MR koreksi bulan terkunci | 200 sukses |
| 7 | Monitoring matrix | Status sel benar |
| 8 | Download Excel/CSV | File valid, header bersih |

---

## 10. Update Password Awal

Password awal = tanggal lahir (`YYYY-MM-DD`). Sarankan karyawan segera ganti.
Untuk reset password seseorang ke BirthDate lagi:

```sql
DELETE FROM dbo.CR_user_credentials WHERE employee_id = <id>;
```
Lalu jalankan ulang bootstrap (bagian seed) atau insert manual hash baru.

---

## Rollback (darurat)

Aplikasi hanya menambah objek `CR_*`. Rollback total:

```sql
DROP VIEW IF EXISTS dbo.CR_users;
DROP VIEW IF EXISTS dbo.CR_departments;
DROP TABLE IF EXISTS dbo.CR_ideas;
DROP TABLE IF EXISTS dbo.CR_idea_monthly;
DROP TABLE IF EXISTS dbo.CR_department_targets;
DROP TABLE IF EXISTS dbo.CR_user_roles;
DROP TABLE IF EXISTS dbo.CR_user_credentials;
```

Tabel HRIS (`hris_employee`, `mascoscenter`) **tidak pernah tersentuh**.
