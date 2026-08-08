# PROMPTS — FRONTEND (fork kasirgratisan)

## Setup (sekali)
Taruh `PLAN.md`, `CLAUDE.md`, `PROGRESS.md`, `PROMPTS.md` di root repo frontend.

## Sesi PERTAMA (bootstrap — jangan langsung ngoding)
```
Ini repo fork kasirgratisan (frontend). Di root ada PLAN.md, CLAUDE.md, PROGRESS.md.
Baca ketiganya. JANGAN menulis kode dulu.

Konfirmasi dulu:
1. Fase prioritas pertama di PROGRESS.md + tujuannya (1-2 kalimat).
2. Dari §9 PLAN.md: file EXISTING yang akan kamu modifikasi & file BARU yang dibuat
   untuk fase itu.
3. Buka src/lib/db.ts dan konfirmasi tabel/field yang akan kamu pakai/tambah.
4. Acceptance yang harus dipenuhi untuk fase itu.

Lalu berhenti dan tunggu persetujuan saya.
```

## Tiap sesi BERIKUTNYA
```
Baca CLAUDE.md dan PROGRESS.md. Beri tahu: fase aktif, langkah terakhir, langkah
berikutnya. Lalu lanjutkan HANYA sub-fase prioritas berikutnya sesuai PLAN.md —
satu bagian saja, ikuti §10 (konsistensi UI), i18n id/en/ms, penuhi Acceptance,
jalankan test bila ada, update PROGRESS.md, lalu berhenti & lapor. Jangan menebak
nama tabel/field/komponen — buka file aslinya dulu.
```

## Pindah fase
```
Fase ini sudah lolos Acceptance & PROGRESS.md sudah diupdate? Kalau ya, lanjut ke
fase prioritas berikutnya di PROGRESS.md dengan alur sama (satu bagian → Acceptance
→ update PROGRESS.md → berhenti & lapor).
```

## Saat mengubah kontrak API (mis. tambah tabel ke payload sync)
```
Kamu baru mengubah bentuk payload di src/lib/cloud-api.ts. Catat perubahan ini di
bagian Keputusan PROGRESS.md, dan ingatkan saya untuk menyalin ulang cloud-api.ts
ke backend/reference/ serta menyesuaikan model Pydantic di repo backend.
```

## Tips
- Mulai dari **Fase H** — tidak butuh backend, bisa diuji lokal (`npm run dev`).
- Minta bukti Acceptance (demo/test) sebelum menandai DONE.
- Kalau mulai mengarang: "verifikasi ke file asli dulu sesuai CLAUDE.md §1".
