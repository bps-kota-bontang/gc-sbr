# Matcha Pro - Ground Check Automation

Tool otomatis untuk melakukan ground check (verifikasi lokasi) direktori usaha dari sistem Matcha Pro menggunakan geocoding Google Maps.

## 📋 Deskripsi

Aplikasi TypeScript ini mengotomasi proses ground check untuk direktori usaha dengan:

- Mengambil data direktori usaha dari API Matcha Pro
- Melakukan geocoding otomatis menggunakan Google Maps (via Puppeteer)
- Menghitung similarity score menggunakan Fuse.js untuk validasi hasil
- Mengirimkan konfirmasi koordinat ke server Matcha Pro
- Retry mechanism untuk data yang gagal

## ✨ Fitur

- ✅ Export data direktori usaha dari API Matcha Pro
- 🌍 Batch geocoding dengan parallel processing
- 🔄 Retry geocoding untuk data gagal menggunakan alamat
- 📊 Similarity matching antara input dan hasil Google Maps
- ✉️ Konfirmasi batch ke server dengan gc_token management
- 🎯 Filter berdasarkan status, provinsi, dan kabupaten

## 🚀 Instalasi

### Prerequisites

- [Bun](https://bun.sh/) runtime (atau Node.js dengan npm/npx)

### Install Dependencies

```bash
bun install
# atau
npm install
```

### Dependencies

- `puppeteer` - Browser automation untuk scraping Google Maps
- `fuse.js` - Fuzzy search untuk similarity matching
- `@types/bun` - Type definitions untuk Bun

## ⚙️ Konfigurasi

### 1. Setup Environment Variables

⚠️ **PENTING**: Cookie dan token akan kadaluarsa secara berkala.

**Langkah Setup:**

1. Copy template environment variables:
```bash
cp .env.example .env
```

2. Edit file `.env` dan isi dengan nilai yang sesuai:
```env
COOKIE=your_cookie_here
TOKEN=your_token_here
INITIAL_GC_TOKEN=your_initial_gc_token_here
ID_PROVINSI=128
ID_KABUPATEN=2526
CITY=Bontang
```

**Cara mendapatkan Cookie dan Token baru:**

1. Buka https://matchapro.web.bps.go.id/dirgc di browser
2. Login ke sistem
3. Buka Developer Tools (F12) → Network tab
4. Lakukan POST request ke endpoint data-gc-card
5. Copy seluruh cookie dari Request Headers → masukkan ke `COOKIE`
6. Copy nilai dari XSRF-TOKEN (sudah di-decode) atau _token dari form data → masukkan ke `TOKEN`
7. Copy nilai `gcSubmitToken` dari halaman atau source code → masukkan ke `INITIAL_GC_TOKEN`

### 2. Konfigurasi Lokasi (Optional)

Sesuaikan nilai di file `.env` sesuai wilayah yang ingin diproses:

```env
ID_PROVINSI=128        # ID Provinsi (default: Kalimantan Timur)
ID_KABUPATEN=2526      # ID Kabupaten/Kota (default: Bontang)
CITY=Bontang           # Nama kota untuk pencarian Google Maps
```

## 📖 Cara Penggunaan

### 1. Export Data dari API

```bash
bun run groundcheck.ts export
# atau
npx tsx groundcheck.ts export
```

Mengambil semua data direktori usaha dari API dan menyimpan ke `direktori_usaha.json`.

### 1.1 Export Data dengan Koordinat (lat,long)

```bash
bun run groundcheck.ts export-latlong
# atau
npx tsx groundcheck.ts export-latlong
```

Output: CSV/JSON berisi kolom: `id`, `nama`, `latitude`, `longitude`. File hasil dapat digunakan untuk analisis spasial atau visualisasi di GIS (mis. QGIS, ArcGIS, atau peta web).

### 2. Lihat Data dari File

```bash
bun run groundcheck.ts view
```

Menampilkan ringkasan data dari file JSON.

### 3. Periksa Data Usaha Spesifik

```bash
bun run groundcheck.ts check <idsbr>
```

Contoh:

```bash
bun run groundcheck.ts check 12345678
```

### 4. Geocode Semua Data (Batch Processing)

```bash
bun run groundcheck.ts geocode-all [concurrency]
```

Contoh:

```bash
bun run groundcheck.ts geocode-all 10
```

- Default concurrency: 5 (parallel requests)
- Rentang: 1-20
- Hasil disimpan ke:
  - `hasil_geocoding_sukses.json` - Data berhasil di-geocode
  - `hasil_geocoding_gagal.json` - Data gagal di-geocode

### 5. Retry Geocode untuk Data Gagal

```bash
bun run groundcheck.ts retry-geocode [concurrency]
```

Contoh:

```bash
bun run groundcheck.ts retry-geocode 3
```

- Membaca `hasil_geocoding_gagal.json`
- Retry menggunakan alamat saja (tanpa nama usaha)
- Hasil disimpan ke:
  - `hasil_retry_sukses.json`
  - `hasil_retry_gagal.json`
  - `hasil_geocoding_sukses.json` (di-update)

### 6. Konfirmasi Batch ke Server

```bash
bun run groundcheck.ts confirm-batch
```

- Mengirim semua data dari `hasil_geocoding_sukses.json` ke server
- Sequential processing dengan gc_token rotation
- Hasil disimpan ke:
  - `hasil_confirm_sukses.json`
  - `hasil_confirm_gagal.json`

### 7. Konfirmasi Manual Single Entry

```bash
bun run groundcheck.ts confirm <idsbr> <latitude> <longitude> <hasilgc>
```

Contoh:

```bash
bun run groundcheck.ts confirm 12345678 -0.123456 117.123456 1
```

**Kode hasilgc:**

- `0` = Tidak ditemukan
- `1` = Ditemukan
- `3` = Tutup
- `4` = Ganda

### 8. Geocode Single Entry (Testing)

```bash
bun run groundcheck.ts geocode <nama_usaha>
```

Contoh:

```bash
bun run groundcheck.ts geocode "Toko ABC Bontang"
```

### 9. Update Sumber Data

```bash
bun run groundcheck.ts update-sumber-data
```

Menambahkan field `sumber_data` dari `direktori_usaha.json` ke file hasil geocoding.

## 📁 Struktur File

```
matcha-pro/
├── groundcheck.ts                 # Script utama
├── .env                           # Environment variables (credentials)
├── .env.example                   # Template environment variables
├── result/                        # Direktori output untuk semua file JSON
│   ├── direktori_usaha.json       # Master data dari API
│   ├── hasil_geocoding_sukses.json   # Hasil geocoding berhasil
│   ├── hasil_geocoding_gagal.json    # Hasil geocoding gagal
│   ├── hasil_retry_sukses.json       # Hasil retry berhasil
│   ├── hasil_retry_gagal.json        # Hasil retry gagal
│   ├── hasil_confirm_sukses.json     # Konfirmasi ke server berhasil
│   └── hasil_confirm_gagal.json      # Konfirmasi ke server gagal
├── package.json
├── tsconfig.json
└── README.md
```

> **Catatan**: Semua file hasil (JSON) sekarang disimpan di direktori `result/` untuk struktur yang lebih rapi. Direktori ini dibuat otomatis saat menjalankan script.

## 🔍 Cara Kerja

### 1. Geocoding Process

1. Membuka Google Maps dengan query: `{nama_usaha} {CITY}`
2. Mengekstrak koordinat dari URL hasil pencarian
3. Scraping nama dan alamat dari halaman detail
4. Menghitung similarity score menggunakan Fuse.js
5. Validasi hasil berdasarkan threshold (70%)

### 2. Similarity Matching

Menggunakan Fuse.js untuk mencocokkan hasil:

- **Nama usaha**: 70% weight
- **Alamat**: 30% weight
- **Threshold**: 70% similarity untuk diterima

### 3. GC Token Management

- Token diambil otomatis dari halaman direktori usaha
- Auto-refresh ketika token expired
- Sequential processing untuk menghindari rate limit

## ⚠️ Troubleshooting

### Error: Environment variables tidak lengkap

Error saat menjalankan script karena file `.env` belum dibuat atau tidak lengkap.

**Solusi:**
1. Pastikan file `.env` sudah dibuat di root project
2. Copy dari `.env.example`: `cp .env.example .env`
3. Isi semua variabel yang diperlukan (COOKIE, TOKEN, INITIAL_GC_TOKEN)

### Error 419: CSRF Token Mismatch

Solusi:

1. Update `COOKIE` dan `TOKEN` di file `.env` dengan nilai terbaru
2. Ikuti langkah di bagian [Konfigurasi](#1-setup-environment-variables)

### Geocoding Gagal

Kemungkinan penyebab:

- Nama usaha tidak ditemukan di Google Maps
- Nama usaha berubah atau tidak akurat
- Banyak hasil pencarian (tidak langsung ke detail)

Solusi:

- Gunakan `retry-geocode` untuk mencoba dengan alamat saja
- Periksa manual hasil yang gagal dengan `check <idsbr>`

### Rate Limiting

Jika terkena rate limit dari Google Maps:

- Kurangi nilai concurrency
- Tambahkan delay antara request

## 📊 Status Codes

### hasilgc (Hasil Ground Check)

| Code | Status          | Deskripsi                              |
| ---- | --------------- | -------------------------------------- |
| `0`  | Tidak ditemukan | Usaha tidak ditemukan di Google Maps   |
| `1`  | Ditemukan       | Usaha ditemukan dengan koordinat valid |
| `3`  | Tutup           | Usaha sudah tutup/tidak beroperasi     |
| `4`  | Ganda           | Terdapat multiple entries              |

## 📅 Update Log

- **2026-01**: Initial version
  - Batch geocoding dengan parallel processing
  - Retry mechanism untuk data gagal
  - Auto gc_token rotation
  - Similarity matching dengan Fuse.js
  - Environment variables untuk credentials (security improvement)

## 🔗 Links

- Matcha Pro: https://matchapro.web.bps.go.id/dirgc

---

**Catatan**: Cookie dan token di file `.env` harus diperbarui secara berkala untuk menjaga akses ke API Matcha Pro. File `.env` tidak akan ter-commit ke Git untuk keamanan.
