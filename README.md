# Jidan AI Frontend

Frontend chat Jidan AI: Vite + React + TypeScript + Tailwind CSS v4.

## Menjalankan

Pastikan backend (`jidan-ai-backend`) sudah jalan di port 3001.

```bash
npm install
npm run dev
```

Buka http://localhost:3000. Saat dev, request ke `/api/*` otomatis diteruskan ke `http://localhost:3001` lewat proxy Vite (lihat `vite.config.ts`), jadi tidak ada masalah CORS.

## Fitur

- Balasan streaming (teks muncul bertahap) lewat `/api/chat/stream`
- Tombol berhenti saat AI sedang menjawab
- Riwayat chat tersimpan di browser (localStorage)
- Blok kode dengan tombol salin
- Enter untuk kirim, Shift+Enter untuk baris baru

## Build & deploy

```bash
npm run build     # hasil di folder dist/
npm run preview
```

Saat production, frontend dan backend biasanya beda domain. Buat file `.env` berisi:

```
VITE_API_URL=https://api.domainkamu.com
```

Lalu tambahkan domain frontend ke `ALLOWED_ORIGINS` di `.env` backend.

## Struktur

```
src/
  App.tsx                    # state chat + layout
  lib/api.ts                 # panggilan ke backend + parser streaming
  components/MessageBubble.tsx
  components/ChatInput.tsx
  types.ts
```
