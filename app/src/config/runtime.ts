export interface RuntimeConfig {
  databasePath: string;
  legacyImageRoot?: string;
  coverUploadRoot: string;
}

export function runtimeConfig(): RuntimeConfig {
  return {
    databasePath:
      import.meta.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite',
    legacyImageRoot: import.meta.env.LEGACY_IMAGE_ROOT,
    coverUploadRoot: import.meta.env.COVER_UPLOAD_ROOT ?? '../output/covers',
  };
}
