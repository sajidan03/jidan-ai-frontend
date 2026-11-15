/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL backend. Kosongkan saat dev (dipakai proxy Vite). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
