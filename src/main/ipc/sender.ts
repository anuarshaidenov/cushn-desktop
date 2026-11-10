/**
 * Which pages may call IPC: only our own renderer, in its top frame. Pure, so
 * it is testable without Electron; `register.ts` feeds it the sender frame.
 */
export interface TrustedRenderer {
  /** `ELECTRON_RENDERER_URL` in development (the Vite dev server). */
  devServerUrl?: string;
  /** `file://` URL of the packaged `index.html`. */
  indexFileUrl: string;
}

export function isTrustedSenderUrl(senderUrl: string, trusted: TrustedRenderer): boolean {
  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    return false;
  }
  if (trusted.devServerUrl && url.origin === new URL(trusted.devServerUrl).origin) return true;
  const index = new URL(trusted.indexFileUrl);
  return url.protocol === "file:" && url.pathname === index.pathname;
}
