import { describe, expect, it } from "vitest";
import { isTrustedSenderUrl } from "./sender";

const packaged = { indexFileUrl: "file:///Applications/Cushn.app/Contents/Resources/app.asar/out/renderer/index.html" };
const dev = { ...packaged, devServerUrl: "http://localhost:5173/" };

describe("isTrustedSenderUrl", () => {
  it("trusts the packaged index.html, whatever the hash route", () => {
    expect(isTrustedSenderUrl(`${packaged.indexFileUrl}#/settings/labels`, packaged)).toBe(true);
  });

  it("trusts the dev server origin only when one is configured", () => {
    expect(isTrustedSenderUrl("http://localhost:5173/#/dashboard", dev)).toBe(true);
    expect(isTrustedSenderUrl("http://localhost:5173/#/dashboard", packaged)).toBe(false);
  });

  it("rejects other files, origins and garbage", () => {
    expect(isTrustedSenderUrl("file:///tmp/evil.html", dev)).toBe(false);
    expect(isTrustedSenderUrl("http://localhost:5174/", dev)).toBe(false);
    expect(isTrustedSenderUrl("https://example.com/", dev)).toBe(false);
    expect(isTrustedSenderUrl("about:blank", dev)).toBe(false);
    expect(isTrustedSenderUrl("", dev)).toBe(false);
  });
});
