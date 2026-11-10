export const APP_NAME = "Cushn";

export const APP_ID = "kz.cushn.desktop";

/** Window title for a page, e.g. `windowTitle("Settings")` → "Settings · Cushn". */
export function windowTitle(page?: string): string {
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}
