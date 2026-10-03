/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly COMICS_DB_PATH?: string;
  readonly LEGACY_IMAGE_ROOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
