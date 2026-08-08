# Implementation Plan — Self-Host & Aktifkan Fitur Berbayar FreeKasir

> Brief untuk Claude Code. Tujuan: membangun backend cloud sendiri untuk aplikasi
> open-source `jipraks/kasirgratisan` (lisensi MIT), sehingga seluruh fitur
> berbayar (cloud backup, multi-device sync, dashboard web, katalog/market)
> aktif tanpa berlangganan ke server pengembang asli.

---

## 0. Konteks & Prinsip Kunci

Aplikasi client (React + TypeScript + Dexie/IndexedDB) **sudah menyertakan
seluruh integrasi cloud di sisi client**. Tidak ada fitur yang di-hardcode
terkunci. Aplikasi hanya memanggil sebuah REST API lewat satu env var:

```
VITE_AUTH_API_URL=http://localhost:3210   # arahkan ke server kita
```

**Insight paling penting:** gating fitur berbayar di client
(`isSubscribed`, `isSyncSubscribed` di `src/hooks/use-cloud-auth.tsx`) dihitung
murni dari response endpoint `GET /api/user/profile`. Jika server kita
mengembalikan `subscription` dan `syncSubscription` berstatus `ACTIVE`, semua
fitur langsung terbuka. **Tidak perlu memodifikasi logika gating di client.**

Yang perlu dibangun:
1. **Backend** (server di port 3210) yang memenuhi kontrak API — bagian utama.
2. **Client patch kecil**: menambah *pull-sync* (client saat ini hanya *push*).
3. **De-branding + matikan telemetri** ke server asli.
4. (Opsional) **Dashboard web** & **Market** — dua app terpisah, tidak ada di repo.

Stack backend yang disarankan: **FastAPI + SQLAlchemy + PostgreSQL**
(sesuai keahlian tim). Auth: verifikasi **Google ID token (JWT)**.

---

## 1. Kontrak API yang Harus Dipenuhi (sumber: `src/lib/cloud-api.ts`)

Semua endpoint di bawah **wajib sama persis** nama path, method, dan bentuk
JSON response-nya. Field yang tidak dipakai boleh dikembalikan sebagai nilai
default yang masuk akal.

### Auth
- Semua endpoint (kecuali `GET /api/plans`) mengirim header
  `Authorization: Bearer <google_id_token>`.
- Server memverifikasi JWT ke Google (cek `iss`, `aud` = `VITE_GOOGLE_CLIENT_ID`,
  `exp`), lalu upsert user berdasarkan `sub`/`email`.

### Endpoint

| Method | Path | Response (bentuk minimum) |
|---|---|---|
| GET | `/api/plans` | `{ plans: Plan[] }` |
| GET | `/api/user/profile` | `UserProfile` (lihat §2) |
| GET | `/api/backups?page&limit` | `{ backups: CloudBackup[], pagination }` |
| POST | `/api/backups` (multipart: `file`, `storeId?`) | `{ backup: CloudBackup }` |
| GET | `/api/backups/:id/download` | isi JSON backup |
| DELETE | `/api/backups/:id` | `200` |
| POST | `/api/payments/checkout` | `{ message, paymentLink, transaction }` |
| POST | `/api/payments/verify/:txId` | `{ message, transaction }` |
| POST | `/api/payments/google-play/verify` | `{ message, subscription }` |
| GET | `/api/payments/history?page&limit` | `{ history: PaymentTransaction[], pagination }` |
| GET | `/api/stores` | `{ stores: CloudStore[] }` |
| POST | `/api/stores` (`{ name }`) | `{ store: CloudStore }` |
| PUT | `/api/stores/:id` (`CloudStoreUpdateInput`) | `{ store: CloudStore }` |
| DELETE | `/api/stores/:id` | `200` |
| GET | `/api/stores/identifier/check?q=` | `{ available: boolean }` |
| PATCH | `/api/stores/:id/identifier` (`{ identifier }`) | `{ store }` |
| PATCH | `/api/stores/:id/visibility` (`{ isPublic }`) | `{ store }` |
| POST | `/api/stores/:id/logo` (multipart `logo`) | `{ store }` |
| DELETE | `/api/stores/:id/logo` | `{ store }` |
| **POST** | **`/api/stores/:id/sync`** (`SyncPayload`) | `{ message }` — **inti sync** |
| GET | `/api/destinations/provinces` | `{ data: {id,name}[] }` |
| GET | `/api/destinations/cities/:provinceId` | `{ data: {id,name}[] }` |
| GET | `/api/destinations/districts/:cityId` | `{ data: {id,name}[] }` |

> Error response: `{ error: string }` dengan HTTP status non-2xx. Client membaca
> field `error` untuk pesan.

---

## 2. Bentuk Objek Penting (untuk "mengaktifkan" fitur)

### UserProfile — kunci untuk membuka semua fitur
```jsonc
{
  "user": {
    "id": "usr_xxx", "email": "...", "name": "...", "picture": "...",
    "planId": "sync-10", "storageLimitMb": 10240,
    "syncExpiry": "2099-12-31T00:00:00Z", "maxStores": 10,
    "createdAt": "..."
  },
  // >>> Kembalikan keduanya ACTIVE agar backup + sync terbuka <<<
  "subscription":     { "id":"...", "planId":"storage-x", "plan":{...},
                        "startDate":"...", "endDate":"2099-12-31",
                        "status":"ACTIVE", "hasActiveSubscription": true },
  "syncSubscription": { "id":"...", "planId":"sync-10", "plan":{...},
                        "startDate":"...", "endDate":"2099-12-31",
                        "status":"ACTIVE", "hasActiveSubscription": true },
  "storageUsage": { "usedMb": 0, "limitMb": 10240, "remainingMb": 10240 },
  "backups": []
}
```
- `isSubscribed` ← `subscription.hasActiveSubscription`
- `isSyncSubscribed` ← `syncSubscription.hasActiveSubscription`
- `maxStores` mengatur batas jumlah toko (set besar/`null`).

### Plan
```jsonc
{ "id":"sync-10", "name":"Self-Host", "storageLimitMb":10240,
  "price":0, "category":"SYNC", "maxStores":10 }
```
`category`: `"STORAGE"` (backup) atau `"SYNC"` (multi-device).

### CloudStore
```jsonc
{ "id":"str_xxx", "userId":"usr_xxx", "name":"Toko Saya",
  "createdAt":"...", "updatedAt":"...", "isPublic":false,
  "identifier":null, "logoUrl":null,
  "_count": { "products":0, "storeTransactions":0, "backups":0 } }
```

### SyncPayload (yang dikirim client ke `/sync`) — sumber `src/lib/sync.ts`
Array *dirty records* per tabel (hanya yang `updatedAt > syncedAt`):
```
categories, products, customers, users, transactions, transactionItems,
expenseCategories, expenses, debts, debtPayments, stockOpnames, stockOpnameItems
```
Setiap record membawa `id` (PK lokal IndexedDB), `updatedAt`, dan field aslinya.
Tombstone penghapusan ada di tabel `deletedRecords` client (belum dikirim di push
saat ini — lihat Fase 4 untuk melengkapinya).

> Jika Fase H dikerjakan, tambahkan `productRecipes` ke `SyncPayload` (interface
> di `src/lib/cloud-api.ts`), ke `pushSyncData`/`pullSyncData`, dan ke model server.

---

## 3. Pemetaan Model Data (Dexie → PostgreSQL)

Sumber lengkap: `src/lib/db.ts` (schema v14). Buat tabel server yang mereplikasi
interface berikut. **Semua tabel data toko wajib punya kolom scoping
`store_id`** + simpan `client_id` (PK asli dari device) untuk idempotent upsert.

Tabel inti yang disinkronkan:
`products, categories, customers, suppliers, units, paymentMethods, users,
transactions, transactionItems, stockIns, stockOuts, hppHistory,
expenseCategories, expenses, debts, debtPayments, stockOpnames, stockOpnameItems`
— **plus `productRecipes` dan `overheadConfig`** jika Fase H (resep/BOM +
overhead) dikerjakan.

Field yang relevan untuk sync di tiap tabel: `updatedAt`, `syncedAt`,
`isDeleted`/`deletedAt` (soft-delete), dan PK lokal.

**Strategi upsert (last-write-wins):**
```
key = (store_id, table_name, client_id)
if not exists: insert
else if incoming.updatedAt >= existing.updatedAt: update
else: skip (server lebih baru)
```
Untuk `deletedRecords`: tandai row target `is_deleted=1` (jangan hard-delete
demi konsistensi antar device).

> Catatan konflik ID: PK IndexedDB bersifat per-device (auto-increment lokal),
> jadi dua device bisa punya `products.id=5` yang berbeda. **Kunci upsert harus
> menyertakan `deviceId`/asal**, atau lakukan remapping ID di server. Rancang
> tabel dengan surrogate key server (`uuid`) + simpan `(device_id, client_id)`
> sebagai secondary unique. Ini penting untuk pull-sync di Fase 4.

---

## 4. Perubahan Sisi Client (Pull-Sync) — WAJIB untuk sync 2 arah

Saat ini `src/lib/sync.ts` **hanya push**. Tanpa pull, device B tidak akan
pernah menerima data device A. Tambahkan:

**Backend:** `GET /api/stores/:id/sync?since=<ISO8601>` →
```jsonc
{ "serverTime":"...", "changes": { "products":[...], "transactions":[...], ... } }
```
Kembalikan semua record dengan `updatedAt > since` (termasuk yang `isDeleted=1`).

**Client (`src/lib/sync.ts`):** tambah `pullSyncData(storeId)`:
1. Baca `lastPulledAt` dari `storeSettings` (tambah field baru).
2. `GET .../sync?since=lastPulledAt`.
3. Untuk tiap record: merge ke Dexie via `db.table(t).put(...)` dengan
   perbandingan `updatedAt` (jangan timpa perubahan lokal yang lebih baru &
   belum ter-push). Terapkan tombstone → set `isDeleted=1`.
4. Simpan `serverTime` sebagai `lastPulledAt`.
5. Panggil `pullSyncData` di: startup app, setelah push sukses, dan via polling
   ringan / OneSignal push trigger.

Tambah test di `src/test/` meniru pola `sync-push.test.ts`.

---

## 5. De-Branding & Matikan Telemetri (WAJIB sebelum dipakai)

| File | Aksi |
|---|---|
| `src/lib/version-check.ts` | Hapus/nonaktifkan fetch ke `api.kasirgratisan.my.id`, atau arahkan ke domain sendiri. |
| `src/lib/analytics.ts` | Kosongkan `VITE_GA_MEASUREMENT_ID` (sudah opt-out bila kosong) atau ganti GA sendiri. |
| `src/lib/onesignal.ts` | Kosongkan `VITE_ONESIGNAL_APP_ID` untuk mematikan push, atau pakai app OneSignal sendiri. |
| Watermark struk | `storeSettings.hideWatermark` + `printLogo`; watermark "FreeKasir.com" muncul saat `cloudStoreId` aktif — cek `src/lib/printer.ts`. Rebrand teksnya. |
| Branding | Ganti nama "FreeKasir"/"KasirGratisan", logo di `public/`, `index.html`, `capacitor.config.ts` (appId/appName), i18n strings di `src/i18n/locales/{id,en,ms}`. |
| `.env` | Set `VITE_AUTH_API_URL`, `VITE_GOOGLE_CLIENT_ID` (Google OAuth Web Client ID milik sendiri). |

> Legal: kode MIT bebas dipakai/dimodifikasi/dijual. Nama merek, logo, dan aset
> branding **bukan** bagian dari lisensi kode — wajib rebrand jika komersial.

---

## 6. Fase Pengerjaan (urutan untuk Claude Code)

### Fase A — Backend skeleton + Auth (est. ~1 hari)
- Setup FastAPI + SQLAlchemy + Postgres + Alembic. Docker Compose.
- Middleware verifikasi Google ID token → dependency `get_current_user`.
- `GET /api/plans` (seed 1 plan STORAGE + 1 plan SYNC, `price:0`).
- `GET /api/user/profile` → **selalu** kembalikan `subscription` &
  `syncSubscription` `ACTIVE` (endDate jauh di masa depan).
- **Acceptance:** login Google di app berhasil, Settings → Cloud menampilkan
  status "berlangganan aktif".

### Fase B — Stores + Cloud Backup (est. ~1–2 hari)
- CRUD `/api/stores` (+ identifier/visibility/logo, boleh minimal).
- `/api/backups`: POST simpan file JSON (disk lokal atau S3/MinIO), GET list,
  download, delete. Hitung `storageUsage`.
- **Acceptance:** dari app, buat store → `cloudStoreId` ter-set; backup manual &
  auto-backup (`use-cloud-auto-backup.ts`) berhasil upload + restore.

### Fase C — Push Sync (est. ~2–3 hari)
- `POST /api/stores/:id/sync`: terima `SyncPayload`, upsert semua tabel dengan
  aturan §3, simpan asal `device_id`.
- **Acceptance:** ubah produk/transaksi di device A → row muncul benar di DB
  server; `sync-push.test.ts` hijau.

### Fase D — Pull Sync (client + server) (est. ~2–3 hari)
- Implement `GET /sync?since=` + `pullSyncData` (§4) + merge/konflik.
- **Acceptance:** transaksi dibuat di device A muncul di device B < beberapa
  detik; hapus di A → hilang di B; edit bersamaan tidak menghasilkan duplikat.

### Fase E — De-branding & Deploy (est. ~1 hari)
- Terapkan §5. Build PWA (`npm run build`) + APK (`npx cap sync android`).
- **Deploy dua target (lihat §11):** backend (repo terpisah) → VPS + Docker +
  HTTPS; frontend (fork client) → Vercel. Set CORS, env, dan origin Google OAuth.
- **Acceptance:** app produksi tidak mengirim request ke domain pihak asli
  (verifikasi via Network tab / logs); login → store → sync → backup jalan
  end-to-end lintas domain (Vercel ↔ VPS).

### Fase F — Dashboard Web (opsional, est. ~3–5 hari)
- App read-only terpisah (boleh FastAPI + React/HTMX) di atas DB server:
  laporan penjualan realtime, filter per store. Reuse tabel dari Fase C/D.

### Fase G — Market / Katalog Digital (opsional, est. ~3–5 hari)
- Halaman publik per `store.identifier` (`isPublic`, `logoUrl`, produk).
  Endpoint publik read-only + halaman katalog.

### Fase H — Resep / BOM: pengurangan stok bahan otomatis (est. ~2–4 hari)
> **Independen dari cloud** — boleh dikerjakan kapan saja, tidak bergantung
> Fase A–E. Hanya menyentuh client (Dexie + `Cashier.tsx`) plus 1 tabel yang
> ikut di-sync. Kondisi saat ini: pengurangan stok masih **flat 1:1** — jual
> produk X mengurangi stok X sendiri; **tidak ada** konsep bahan/komposisi.

**Tujuan:** jual produk jadi (mis. "Kopi Aren") → stok bahan baku (gula aren,
biji kopi, gelas, susu) berkurang otomatis sesuai takaran resep.

**H.1 — Skema data (Dexie, naikkan versi DB ke v15 di `src/lib/db.ts`)**
Tambah tabel baru `productRecipes`:
```ts
export interface ProductRecipe {
  id?: number;
  productId: number;         // FK -> products (produk JADI yang dijual)
  ingredientProductId: number; // FK -> products (BAHAN baku)
  quantity: number;          // takaran bahan per 1 unit produk jadi
  unit: string;              // snapshot satuan bahan (mis. 'gram', 'ml')
  createdAt: Date;
  isDeleted: number;         // 0/1 soft delete
  deletedAt: Date | null;
  updatedAt?: Date;
  syncedAt?: Date | null;    // WAJIB agar ikut sync (pola sama seperti tabel lain)
}
```
Index Dexie: `'++id, productId, ingredientProductId, isDeleted, updatedAt, syncedAt'`.
Daftarkan tabel ke `setupSyncHooks()` (array `syncTables`) supaya dirty-tracking
& tombstone otomatis berjalan.

**Overhead — dua lapis: default global + override per produk.**

*(a) Override per produk (opsional).* Tambah 2 field opsional pada interface
`Product` yang sudah ada. Bila diisi, nilai ini menimpa default global untuk
produk tsb:
```ts
// tambahan di interface Product (OPSIONAL — override; kosong = pakai default global)
overheadCost?: number;              // Rp per porsi (mode fixed) / persen (mode percent)
overheadMode?: 'fixed' | 'percent'; // default 'fixed'
```

*(b) Default global — tabel baru `overheadConfig` (singleton per toko, IKUT sync).*
Ini sumber angka Rp/porsi ala kalkulator di §H.6. Disimpan di tabel sendiri
(BUKAN `storeSettings`, karena `storeSettings` tidak ikut sync — lihat temuan
di §H.9) supaya konsisten di semua kasir:
```ts
export interface OverheadConfig {
  id?: number;                       // singleton: selalu 1 baris per toko
  monthlyTargetUnits: number;        // target penjualan per bulan (pcs)
  rentPerYear: number;               // sewa tempat (per TAHUN) -> /12 saat hitung
  utilitiesPerMonth: number;         // listrik, air, internet
  marketingPerMonth: number;
  insurancePerMonth: number;
  salariesPerMonth: number;          // total gaji karyawan
  equipmentMaintenancePerMonth: number;
  depreciationPerMonth: number;      // penyusutan
  otherPerMonth?: number;
  updatedAt?: Date;
  isDeleted: number;
  deletedAt: Date | null;
  syncedAt?: Date | null;
}
```
Index Dexie: `'++id, isDeleted, updatedAt, syncedAt'`. Daftarkan ke `syncTables`
(di `db.ts` ~baris 853) DAN ke `setupSyncHooks()`.

Migrasi: hanya menambah field/tabel opsional → produk lama (`overheadCost`
undefined) otomatis pakai default global; bila `overheadConfig` belum diisi,
overhead = 0 (perilaku lama, backward compatible).

**H.2 — Konvensi produk**
- Bahan baku = produk biasa dengan `trackStock: true` (stok dilacak).
- Produk jadi ber-resep = set `trackStock: false` (stok sendiri diabaikan;
  ketersediaan ditentukan bahan — lihat H.5).
- Produk tanpa resep tetap berperilaku lama (flat 1:1) — **backward compatible**.

**H.3 — UI kelola resep** (di form produk, `src/pages/` terkait Products)
- Section "Resep / Komposisi": tambah baris bahan (pilih produk bahan + qty + unit).
- Simpan/hapus baris → tulis ke `productRecipes` (soft-delete saat hapus).
- Input **Overhead per porsi (opsional, override)**: field nominal + toggle mode
  `fixed`/`percent`. Kosongkan untuk memakai **default global** dari Overhead
  Workspace (§H.6). Tampilkan preview HPP total real-time (`biayaBahan +
  overhead` per rumus §H.7) supaya user langsung lihat HPP & margin.

**H.4 — Patch logika checkout (INTI) — `src/pages/Cashier.tsx`**
Saat ini (baris ~368): `stock = stock − qty` untuk produk yang dijual.
Ubah menjadi, untuk tiap item terjual:
```
recipes = productRecipes.where(productId == item.id, isDeleted==0)
if recipes kosong:
    // perilaku lama
    product.stock -= item.qty
else:
    for r in recipes:
        bahan = products[r.ingredientProductId]
        if isStockManaged(bahan):
            bahan.stock -= item.qty * r.quantity   // + updatedAt=now
```
Terapkan pola yang **sama & dibalik** di semua jalur refund/pembatalan/void
(`Cashier.tsx` ~313/422/538, dan `TransactionHistory.tsx` ~167): kembalikan
stok bahan, bukan stok produk jadi. Bungkus semua dalam satu `db.transaction('rw', ...)`.

**H.5 — Ketersediaan & tampilan stok**
- Untuk produk ber-resep, "stok tersedia" = `min( floor(stok_bahan_i / takaran_i) )`
  atas seluruh bahan. Pakai nilai ini untuk badge stok & blokir jual saat 0
  (ganti pengecekan `p.stock` di `Cashier.tsx` ~133/627/644 dengan helper baru
  `getAvailableQty(product)`).

**H.6 — Overhead Workspace (kalkulator biaya overhead)**
Halaman setelan yang meniru pola kalkulator standar: user memasukkan semua
*fix cost* bulanan + target penjualan, sistem menurunkan **overhead per unit
(blended)** yang jadi default global. Metode ini = *predetermined overhead rate*
dengan basis unit (absorption costing) — valid & lazim di F&B.
- Input → simpan ke `overheadConfig` (§H.1b).
- Rumus turunan (hitung on-the-fly, tak wajib disimpan):
```
totalOverheadBulanan =
    rentPerYear/12 + utilitiesPerMonth + marketingPerMonth + insurancePerMonth
  + salariesPerMonth + equipmentMaintenancePerMonth + depreciationPerMonth
  + (otherPerMonth ?? 0)
overheadPerUnit = monthlyTargetUnits > 0
    ? totalOverheadBulanan / monthlyTargetUnits : 0
```
  (Contoh gambar acuan: 500.000 + 150.000 + 38.475 = 688.475 ÷ 1.000 = **688/unit**.)
- Tampilkan rincian komponen + hasil `overheadPerUnit` (transparansi "overhead ini
  isinya apa saja").
- *(Opsional lanjutan)* `equipmentMaintenancePerMonth` & `depreciationPerMonth`
  bisa dibuat auto dari register aset (nilai aset ÷ masa manfaat). Untuk MVP,
  cukup input manual dua angka ini agar tidak menambah scope.

**H.7 — HPP / profit dengan overhead (INTI untuk laba akurat)**
Kondisi awal: HPP aplikasi saat ini **hanya harga beli barang** (weighted average
`buyPrice` di `StockIn.tsx`) — **tidak memuat overhead**. Untuk tiap item terjual,
hitung HPP penuh on-the-fly saat checkout:
```
biayaBahan = Σ ( HPP_bahan_i × takaran_i )     // produk ber-resep; else products.hpp

// tentukan overhead: override per produk bila ada, else default global
if product.overheadCost != null:
    overhead = product.overheadMode === 'percent'
                 ? biayaBahan × (product.overheadCost / 100)
                 : product.overheadCost                 // fixed Rp/porsi
else:
    overhead = overheadConfig.overheadPerUnit           // default global (§H.6)

HPP_final = biayaBahan + overhead
```
- Pakai `HPP_final × qty` untuk `transaction.profit` & isi HPP di `transactionItems`.
- **Snapshot wajib:** simpan `HPP_final` (dan komponen overhead) ke `transactionItems`
  **saat transaksi terjadi**. Jangan hitung ulang retroaktif — kalau tarif overhead
  atau harga bahan berubah nanti, laporan laba historis tetap stabil.
- Produk tanpa resep & tanpa override tetap kompatibel: `HPP_final = products.hpp +
  overheadPerUnit` (atau tanpa overhead bila `overheadConfig` kosong).

**H.8 — Rekonsiliasi overhead (absorbed vs actual)**
Karena `overheadPerUnit` memakai angka **target**, realisasi jarang sama persis.
Tambahkan laporan bulanan di halaman Reports:
```
overheadTerabsorb = overheadPerUnit × unitTerjualBulanIni
selisih = totalOverheadBulananAktual − overheadTerabsorb
  selisih > 0  -> under-absorbed (laba tercatat terlalu optimis)
  selisih < 0  -> over-absorbed
```
Tampilkan selisih + saran "hitung ulang target/tarif". Ini menjaga estimasi tetap
dekat kenyataan tanpa mengubah data transaksi lama.

**H.9 — Sync**
- **Temuan:** `storeSettings` TIDAK ada di `syncTables` (device-local). Karena itu
  konfigurasi overhead diletakkan di tabel `overheadConfig` tersendiri.
- Tambah `productRecipes` DAN `overheadConfig` ke `syncTables` (`db.ts` ~853),
  ke `pushSyncData`/`pullSyncData` (§4), ke `SyncPayload` (`src/lib/cloud-api.ts`),
  dan ke model server (§3).
- Field `overheadCost`/`overheadMode` di `products` ikut sync otomatis (bagian dari
  tabel `products` yang sudah tersinkron).

**Acceptance:**
- Buat "Kopi Aren" (`trackStock:false`) dengan resep: gula aren 20g, kopi 15g,
  gelas 1 pcs. Jual 3 → stok gula −60g, kopi −45g, gelas −3 pcs.
- Batalkan transaksi itu → stok ketiga bahan kembali persis.
- Produk lama tanpa resep tetap berkurang 1:1.
- Badge stok "Kopi Aren" = min ketersediaan bahan; jadi "habis" saat salah satu
  bahan tak cukup.
- **Workspace:** isi listrik 500.000 + peralatan 150.000 + penyusutan 38.475,
  target 1.000 → `overheadPerUnit` = 688. Angka ini jadi default semua produk.
- **Default global:** "Kopi Aren" tanpa override → HPP = biayaBahan + 688.
- **Override fixed:** set overhead "Kopi Aren" = 500 → HPP = biayaBahan + 500
  (menimpa default 688).
- **Override percent:** mode `percent` 20%, biaya bahan 3.000 → HPP = 3.000 + 600.
- **Snapshot:** ubah Workspace jadi 800 → transaksi LAMA tetap tercatat pakai HPP
  saat itu (688), transaksi BARU pakai 800.
- **Rekonsiliasi:** laporan bulanan menampilkan selisih absorbed vs actual.
- `productRecipes` & `overheadConfig` ikut ter-sync antar device.

---

## 6b. Revisi Fase H (2026-08-07) — Master Data Material (Bahan Baku & Packaging)

> **Status: SUPERSEDES konvensi H.2/H.4/H.5/H.7/H.9 di atas.** Teks H.1–H.9
> di atas TIDAK dihapus (histori tetap terbaca), tapi bagian yang menyebut
> "bahan baku = produk dengan `trackStock:true`" dan `ingredientProductId`
> **sudah tidak berlaku** — diganti desain di bawah ini.

**Alasan:** produk (barang yang **dijual**) dan bahan/material (barang yang
**dipakai untuk membuat/mengemas** produk lain, termasuk packaging) adalah
entitas berbeda. Memakai `products` sebagai bahan resep (desain H.1–H.9 awal)
salah secara model data — RecipeEditor akhirnya menampilkan seluruh daftar
produk jual sebagai pilihan bahan, padahal semestinya daftar terpisah.

**Skema baru — tabel `materials` (Dexie v16):**
```ts
export interface Material {
  id?: number;
  name: string;
  type: 'ingredient' | 'packaging';
  unit: string;
  stock: number;
  costPerUnit: number;   // HPP per satuan, diperbarui via Stock In (weighted average) atau manual
  barcode?: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  isDeleted: number;
  deletedAt: Date | null;
  createdBy?: number;
  updatedBy?: number;
  syncedAt?: Date | null;
}
```

**Perubahan field existing (longgarkan required→optional, non-breaking):**
- `StockIn.productId: number` → `productId?: number` + `materialId?: number` baru.
  Tepat salah satu terisi per baris. `StockIn.tsx` sekarang punya toggle
  "Jenis: Produk / Material" — reuse formula weighted-average yang sama persis
  untuk kedua jenis.
- `HppHistory.productId: number` → `productId?: number` + `materialId?: number` baru.
- `ProductRecipe.ingredientProductId` → **di-rename** jadi `ingredientMaterialId`
  (FK ke `materials`, bukan `products`). **Clean cutover** — baris resep lama
  (kalau ada dari testing lokal) di-soft-delete otomatis saat migrasi v16 (bukan
  dimigrasikan), sesuai keputusan eksplisit pemilik produk karena fitur ini belum
  dipakai data riil/belum sync ke backend manapun. Ini deliberate exception
  terhadap aturan "aditif" — bukan pola default untuk revisi berikutnya.

**File baru:** `src/pages/Materials.tsx` (CRUD master data, pola sama
`Supplier.tsx`, filter tipe ingredient/packaging), `src/components/MaterialPicker.tsx`
(mirror `ProductPicker.tsx`, sumber `db.materials`).

**File diubah:** `src/lib/recipe.ts` (`RecipeCalcContext` — dulu
`AvailableQtyContext` — dengan `materialsById`; `getAvailableQty`/
`computeBiayaBahan`/`applyRecipeAwareStockDelta` semua baca dari `materials`,
bukan `products`, untuk sisi bahan resep), `RecipeEditor.tsx` (pakai
`MaterialPicker`), `Cashier.tsx`/`TransactionHistory.tsx` (tambah `db.materials`
ke context builder & semua `db.transaction('rw', ...)` terkait resep),
`StockIn.tsx`, `sync.ts`/`cloud-api.ts` (`materials` masuk `SyncPayload`).

**Yang TIDAK berubah:** produk tanpa resep tetap flat 1:1 pada stok produk
sendiri (`db.products`) — resep hanya berlaku untuk produk JADI yang
mengonsumsi material, bukan pengganti mekanisme stok produk biasa.
`computeHppFinal`/`resolveOverhead` (§H.7) tidak berubah — hanya sumber
`computeBiayaBahan` pindah dari `products.hpp` ke `materials.costPerUnit`.

**Acceptance tambahan:**
- RecipeEditor hanya menampilkan `materials` (bukan `products`) sebagai
  pilihan bahan.
- Stock In bisa target Produk ATAU Material, cost dihitung weighted-average
  benar untuk keduanya.
- Materials.tsx: CRUD + filter tipe (ingredient/packaging) berfungsi.
- Seluruh acceptance H.9 di atas tetap berlaku, dengan "bahan" dibaca sebagai
  `Material` bukan `Product`.

---

## 7. Checklist Verifikasi Akhir
- [ ] Login Google → profil menampilkan langganan aktif (backup + sync).
- [ ] Buat & pilih store; `cloudStoreId` tersimpan di device.
- [ ] Backup manual + auto-backup upload/restore OK; kuota terhitung.
- [ ] Edit data di device A ter-push ke server.
- [ ] Pull-sync: device B menerima create/update/delete dari A.
- [ ] Multi-device (>1) sesuai `maxStores`/plan.
- [ ] Watermark & branding sudah diganti; struk benar.
- [ ] Tidak ada telemetri ke `*.kasirgratisan.my.id` / GA / OneSignal asli.
- [ ] Backend live di VPS (HTTPS); frontend live di Vercel; `vercel.json` SPA rewrite aktif.
- [ ] CORS backend mengizinkan domain Vercel; origin Vercel terdaftar di Google OAuth.
- [ ] Login → store → sync → backup jalan end-to-end lintas domain (Vercel ↔ VPS).
- [ ] (Opsional) Dashboard web & Market tampil dari data yang sama.
- [ ] (Fase H) Jual produk ber-resep → stok bahan berkurang sesuai takaran × qty.
- [ ] (Fase H) Batal/refund produk ber-resep → stok bahan kembali persis.
- [ ] (Fase H) Produk tanpa resep tetap berkurang 1:1 (backward compatible).
- [ ] (Fase H) `productRecipes` & `overheadConfig` ikut ter-sync antar device.
- [ ] (Fase H) Overhead Workspace menghitung `overheadPerUnit` = total ÷ target.
- [ ] (Fase H) Default global dipakai; override per produk (fixed & percent) menimpa.
- [ ] (Fase H) HPP di-snapshot ke `transactionItems`; laporan lama tak berubah retroaktif.
- [ ] (Fase H) Laporan rekonsiliasi overhead (absorbed vs actual) tampil.

---

## 8. Referensi File Penting di Repo
- `src/lib/cloud-api.ts` — **kontrak API lengkap** (copy tipe dari sini).
- `src/lib/sync.ts` — logika push; tempat menambah pull.
- `src/lib/cloud-auth.ts` — penyimpanan & validasi JWT.
- `src/hooks/use-cloud-auth.tsx` — sumber gating `isSubscribed`/`isSyncSubscribed`.
- `src/lib/db.ts` — schema Dexie v14 (model data untuk direplikasi di server).
- `src/lib/backup.ts` — bentuk `BackupData` (`version`, `exportedAt`, tabel).
- `src/pages/settings/CloudStoreSettings.tsx` — alur binding `cloudStoreId`.
- `src/lib/version-check.ts`, `analytics.ts`, `onesignal.ts` — telemetri.
- `.env.example` — daftar env var.
- `src/pages/Cashier.tsx` — logika pengurangan/pengembalian stok (patch Fase H).
- `src/pages/TransactionHistory.tsx` — pengembalian stok saat hapus transaksi (Fase H).

---

## 9. Perubahan pada Repo yang Sudah Ada (inventaris untuk Claude Code)

Stack repo: **React 18 + TypeScript + Vite, Tailwind + shadcn/ui (Radix),
lucide-react, sonner, react-hook-form + zod, dexie + dexie-react-hooks,
react-router-dom v6, i18next (locale id/en/ms)**. Semua perubahan harus mengikuti
konvensi ini (lihat §10).

### 9a. File EXISTING yang DIMODIFIKASI
| File | Perubahan |
|---|---|
| `src/lib/db.ts` | Naikkan versi Dexie **v14 → v15**; tambah interface `ProductRecipe` & `OverheadConfig`; tambah field opsional `overheadCost`/`overheadMode` di `Product`; tambah kolom `syncedAt` pada tabel baru; daftarkan `productRecipes` & `overheadConfig` ke array `syncTables` (~baris 853) + registrasi tabel di versi baru. |
| `src/lib/sync.ts` | Tambah `productRecipes` & `overheadConfig` ke push; implement `pullSyncData()` (Fase D). |
| `src/lib/cloud-api.ts` | Extend `SyncPayload` + tipe agar mencakup tabel baru (bila backend self-host dikerjakan). |
| `src/pages/Cashier.tsx` | Patch pengurangan stok jadi **resep-aware** (§H.4); helper `getAvailableQty` untuk ketersediaan (§H.5); hitung `HPP_final` + snapshot ke `transactionItems` (§H.7). Balik semua di jalur refund/void. |
| `src/pages/TransactionHistory.tsx` | Pengembalian stok saat hapus transaksi jadi resep-aware (§H.4). |
| `src/pages/Products.tsx` | Tambah section **Resep/Komposisi** + input **override overhead** di form produk (§H.3). |
| `src/pages/Reports.tsx` | Tambah laporan **rekonsiliasi overhead** (§H.8) + (opsional) laporan pemakaian bahan. |
| `src/pages/Settings.tsx` | Tambah entri menu menuju halaman **Overhead Workspace** (ikuti pola kartu menu yang ada). |
| `src/App.tsx` | Daftarkan route baru `/settings/overhead` di dalam `<Route element={<AppLayout/>}>`. |
| `src/lib/version-check.ts` | Matikan/arahkan ulang telemetri `api.kasirgratisan.my.id` (Fase E). |
| `src/lib/analytics.ts`, `src/lib/onesignal.ts` | Kosongkan/ganti ID (Fase E). |
| `src/lib/printer.ts` (+ `src/components/Receipt.tsx`, `KitchenTicket.tsx`) | Rebrand teks watermark (Fase E). |
| `src/i18n/locales/{id,en,ms}/*.json` | Tambah string baru: `products.json` (resep/override), `settings.json` (overhead workspace), `reports.json` (rekonsiliasi). **Ketiga bahasa wajib diisi.** |
| `.env` / `.env.example` | Set `VITE_AUTH_API_URL`, `VITE_GOOGLE_CLIENT_ID`; kosongkan GA/OneSignal. |
| `capacitor.config.ts`, `index.html`, `public/` | Rebrand `appId`/`appName`/logo/favicon (Fase E). |

### 9b. File BARU yang DIBUAT
| File | Isi |
|---|---|
| `src/pages/settings/OverheadSettings.tsx` | Halaman **Overhead Workspace** (§H.6) — tiru struktur file lain di `src/pages/settings/` (mis. `ReceiptSettings.tsx`). |
| `src/components/RecipeEditor.tsx` | Sub-komponen editor resep (dipakai di `Products.tsx`). |
| `src/lib/overhead.ts` | Helper: `computeOverheadPerUnit(config)` & `resolveOverhead(product, biayaBahan, config)` — pusatkan logika agar tak tersebar. |
| `src/lib/recipe.ts` | Helper: `computeBiayaBahan(productId)`, `getAvailableQty(product)`, `computeHppFinal(...)`. |
| `src/test/recipe.test.ts`, `overhead.test.ts`, `sync-pull.test.ts` | Unit test (pola sama seperti `sync-push.test.ts`). |
| `server/` **(repo TERPISAH)** | Proyek **FastAPI** backend (Fase A–E) di repo sendiri (mis. `freekasir-server`), deploy ke VPS. Lihat §11. |

> Prinsip: **semua fitur baru = tabel/field opsional + patch aditif.** Tidak ada
> tabel/field existing yang dihapus atau diubah tipenya → data & perilaku lama
> aman (backward compatible), dan merge dari upstream tetap mudah.

---

## 10. Konsistensi Desain Frontend (WAJIB diikuti)

Semua UI baru harus terasa menyatu dengan aplikasi yang ada. Aturan konkret:

- **Komponen:** pakai ulang shadcn/ui di `src/components/ui/*` (`Card`, `Dialog`,
  `Select`, `Switch`, `Tabs`, `Table`, `Button`, `Label`, `Input`, `Badge`).
  JANGAN pasang UI library lain atau bikin primitif baru.
- **Input angka & rupiah:** gunakan komponen **`NumberInput`** yang sudah ada
  (bukan `<input type="number">`) — sudah handle locale. Untuk memilih produk
  bahan, pakai **`SearchableSelect`** / **`ProductPicker`** yang sudah ada.
- **Data reaktif:** pakai **`useLiveQuery`** (dexie-react-hooks) seperti
  `Dashboard.tsx`/`Products.tsx`, bukan fetch manual/state duplikat.
- **Notifikasi:** `toast.success/error` dari **sonner**, teksnya via `t()`.
- **Warna & tema:** HANYA token semantik Tailwind yang sudah ada
  (`text-muted-foreground`, `bg-warning/15`, `text-success`, `text-destructive`,
  `bg-primary`, `text-primary`). **Jangan hardcode hex.** Tema warna dinamis
  (hue HSL) sudah aktif — jangan langgar.
- **Pola kartu/list:** ikuti pola `Settings.tsx` — iconWrap `w-11 h-11 rounded-xl`,
  judul `text-sm font-semibold`, deskripsi `text-[10px] text-muted-foreground`.
- **Ikon:** hanya **lucide-react**.
- **i18n:** SEMUA teks lewat `t()` dan ditambahkan ke **ketiga** locale
  (id/en/ms) pada namespace yang tepat. Tidak boleh ada string hardcoded.
- **Routing & navigasi:** daftarkan halaman baru di `App.tsx` mengikuti pola
  `/settings/*`, dan tambah entri di `Settings.tsx`. Halaman settings baru meniru
  header/back-button/layout file di `src/pages/settings/`.
- **Format angka:** `toLocaleString(numberLocale)` seperti kode existing.
- **Mobile-first:** app berjalan sebagai PWA/Capacitor — jaga responsif & target
  tap besar (tinggi kontrol `h-11`, dsb). Uji tampilan lebar layar ponsel.

> Aturan emas: sebelum membuat komponen/halaman baru, **buka 1–2 file sejenis
> yang sudah ada** (mis. `ReceiptSettings.tsx`, `StockIn.tsx`, `Products.tsx`)
> dan tiru strukturnya. Konsistensi > kreativitas untuk fitur ini.

---

## 11. Arsitektur Deployment

**Dua repo, dua target deploy:**
- **Backend** → repo terpisah (mis. `freekasir-server`), deploy ke **VPS**.
- **Frontend** → repo fork client (`kasirgratisan`), deploy ke **Vercel**.

Konsekuensi arsitektur: frontend & backend beda domain → **CORS** dan
**origin Google OAuth** wajib dikonfigurasi (sering jadi sumbatan pertama).

### 11a. Backend di VPS
- Stack: FastAPI (uvicorn/gunicorn) + PostgreSQL, dibungkus **Docker Compose**
  (service `api` + `db` + volume data).
- Reverse proxy **Caddy/nginx** + **HTTPS** (Let's Encrypt). Domain mis.
  `api.tokoanda.com`.
- **CORS wajib:** set `CORSMiddleware` `allow_origins` = domain Vercel
  (production + preview). Tanpa ini browser memblokir semua request frontend.
- **Penyimpanan file backup:** volume disk VPS, atau bucket S3/MinIO.
- Env server: `DATABASE_URL`, `GOOGLE_CLIENT_ID` (untuk verifikasi `aud` token),
  `CORS_ORIGINS`, `BACKUP_STORAGE_PATH` / kredensial S3.

### 11b. Frontend di Vercel
- Vercel auto-detect Vite → build `npm run build`, output `dist/`.
- **Env di Vercel Project Settings** (build-time, prefix `VITE_`):
  `VITE_AUTH_API_URL=https://api.tokoanda.com`, `VITE_GOOGLE_CLIENT_ID=...`
  (GA/OneSignal dikosongkan). Ingat: env `VITE_` di-*bake* saat build, jadi
  ganti domain = perlu redeploy.
- **SPA rewrite wajib** (react-router v6) — tambah `vercel.json` di root:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
  Tanpa ini, refresh di route dalam (mis. `/settings/overhead`) akan 404.
- Pastikan konfigurasi **PWA/service worker** tetap valid di domain Vercel
  (scope & `manifest`). Custom domain mis. `kasir.tokoanda.com`.

### 11c. Google OAuth (lintas domain)
- Google Cloud Console → OAuth **Web Client**: tambahkan **Authorized JavaScript
  origins** = domain Vercel (`https://kasir.tokoanda.com`) + `http://localhost:5173`
  (dev).
- `GOOGLE_CLIENT_ID` yang sama dipakai di frontend (login) & backend (verifikasi `aud`).

### 11d. APK Android (Capacitor) — bila dipakai
- `VITE_AUTH_API_URL` di-*bake* saat build; build dengan env production **sebelum**
  `npx cap sync android`. Ganti bila domain berubah.
- OAuth Android perlu konfigurasi tambahan (SHA-1 + client type Android) — di luar
  scope MVP web.

### 11e. Urutan deploy
1. Deploy backend ke VPS + HTTPS, isi env, uji `GET /api/plans`.
2. Set `CORS_ORIGINS` ke domain Vercel (boleh wildcard sementara saat uji,
   perketat setelah domain final).
3. Set env di Vercel → deploy frontend → dapatkan domain.
4. Tambahkan domain Vercel ke Authorized JS origins di Google OAuth.
5. Uji end-to-end: login → buat store → sync antar device → backup/restore.

> Catatan repo: karena backend repo terpisah, `src/lib/cloud-api.ts` di repo
> client tetap jadi **satu-satunya sumber kebenaran kontrak API** — jaga agar
> tipe Pydantic di server selalu sinkron dengannya. Simpan `docker-compose.yml`,
> `Dockerfile`, dan konfig reverse proxy di repo server.

---

> **Cara pakai untuk Claude Code — urutan build yang disarankan:**
> 1. Baca §9 & §10 dulu (peta perubahan + aturan konsistensi frontend).
> 2. **Jalur cloud (Fase A→E):** mulai dari `src/lib/cloud-api.ts` sebagai
>    spesifikasi tipe backend (buat Pydantic models match 1:1), lalu kerjakan
>    Fase A→E berurutan. Fase F & G opsional.
> 3. **Jalur resep+overhead (Fase H):** independen dari cloud, boleh paralel.
>    Mulai dari `src/lib/db.ts` (v15 + tabel baru), buat helper `src/lib/recipe.ts`
>    & `src/lib/overhead.ts`, halaman `OverheadSettings.tsx`, `RecipeEditor.tsx`,
>    lalu patch `Cashier.tsx`. Selaraskan dengan sync (tambah tabel baru ke payload)
>    bila Fase C/D juga dikerjakan.
> 4. Kerjakan per fase, verifikasi tiap **Acceptance** sebelum lanjut.
> 5. **Deploy (§11):** backend (repo terpisah) → VPS; frontend (fork) → Vercel.
>    Perhatikan CORS, `vercel.json`, dan origin Google OAuth lintas domain.
>
> Plan ini sudah lengkap untuk mulai membangun. Semua perubahan bersifat aditif
> (tabel/field/route baru + patch) sehingga aman terhadap data lama dan mudah
> di-merge dari upstream.
