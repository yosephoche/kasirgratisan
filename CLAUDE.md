# CLAUDE.md — FRONTEND (fork kasirgratisan)

Kontrak perilaku untuk repo client. Dimuat otomatis tiap sesi. Jika ragu,
**tanya — jangan menebak.**

## 0. Awal tiap sesi
1. Buka `PROGRESS.md` → temukan **Fase aktif** & langkah terakhir.
2. Buka `PLAN.md` → baca bagian fase itu (plus §9 & §10 sekali di awal proyek).
3. Lanjutkan dari langkah terakhir. Jangan ulang yang `[x]`.
4. Laporkan: "Fase aktif = …, terakhir = …, berikutnya = …".

## 1. Sumber kebenaran (ANTI-HALUSINASI)
- `PLAN.md` = rencana resmi.
- **Skema data** = `src/lib/db.ts` — baca langsung; jangan tebak tabel/field.
- **Kontrak API** = `src/lib/cloud-api.ts` — baca langsung; jangan karang endpoint.
- **Konvensi UI** = §10 `PLAN.md` + komponen yang sudah ada.
- WAJIB: sebelum menulis kode yang menyebut nama file/tabel/field/komponen/endpoint,
  **BUKA file aslinya & verifikasi dulu.** Dilarang menulis dari ingatan.
- `PLAN.md` bentrok dengan kode nyata → STOP, lapor, tanya.
- Detail tak ada di `PLAN.md` maupun kode → tanya user, jangan mengarang.

## 2. Fokus repo ini (yang dikerjakan di FRONTEND)
- **Fase H** (resep + overhead) — hampir seluruhnya di sini. PRIORITAS, independen,
  tidak butuh backend, bisa diuji lokal.
- **Fase D (sisi client)** — `pullSyncData()` di `src/lib/sync.ts` + merge.
- **Fase E (sisi frontend)** — de-branding (`version-check`, `analytics`,
  `onesignal`, watermark, rebrand, `capacitor.config.ts`, `index.html`, `public/`)
  + deploy Vercel (`vercel.json` SPA rewrite, env, PWA).
- **Config** — `.env`: `VITE_AUTH_API_URL` (arahkan ke backend), `VITE_GOOGLE_CLIENT_ID`.
> Fase A/B/C (server) dikerjakan di repo backend. Untuk menguji fitur cloud
> end-to-end, backend minimal Fase A harus sudah jalan.

## 3. Disiplin per fase
- Satu fase/sub-fase per waktu, sesuai prioritas `PROGRESS.md`. Jangan lompat.
- Tiap fase punya **Acceptance** di `PLAN.md` → wajib dipenuhi & dibuktikan
  (test/demo) sebelum `[x] DONE`.
- Selesai satu bagian → update `PROGRESS.md` → ringkas → **berhenti & tunggu user.**

## 4. Aturan implementasi (frontend)
- Perubahan bersifat **ADITIF**: jangan hapus/ubah tipe tabel/field/route existing.
  Backward compatible.
- Ikuti §10: reuse shadcn/ui (`src/components/ui/*`), `NumberInput`,
  `SearchableSelect`/`ProductPicker`, `useLiveQuery`, `toast` (sonner), token warna
  semantik Tailwind, ikon `lucide-react`. **Sebelum bikin komponen/halaman baru,
  buka 1–2 file sejenis (`ReceiptSettings.tsx`, `StockIn.tsx`, `Products.tsx`) &
  tiru strukturnya.**
- Jangan tambah dependency baru tanpa izin (kecuali disebut di `PLAN.md`).
- i18n: tiap string baru → tambahkan ke `id`, `en`, `ms`. Tidak boleh hardcode.
- Naikkan versi Dexie dengan migrasi yang benar (v14 → v15) — jangan rusak data lama.

## 5. Koordinasi kontrak dengan backend
- Jika mengubah bentuk request/response di `cloud-api.ts` (mis. menambah tabel
  `productRecipes`/`overheadConfig` ke payload sync): catat di **Keputusan**
  `PROGRESS.md`, dan ingatkan user agar menyalin ulang `cloud-api.ts` ke
  `backend/reference/` + menyesuaikan model Pydantic.

## 6. Update PROGRESS.md
Tiap langkah: status `[ ]→[~]→[x]` (`[!]`=blocked), perbarui "Fase aktif",
tambah 1 baris ke **Log** (tanggal + ringkas). Jangan hapus histori.

## 7. Larangan ringkas
- ❌ Menebak nama file/tabel/field/komponen. ✅ Buka & verifikasi.
- ❌ Banyak fase sekaligus. ✅ Satu bagian → berhenti.
- ❌ DONE tanpa Acceptance. ✅ Buktikan.
- ❌ Menyimpang diam-diam / lupa update PROGRESS.md. ✅ Tanya & catat.
