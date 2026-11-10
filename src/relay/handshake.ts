/**
 * The handshake that opens every connection to the app's MCP socket, before any MCP bytes. The
 * app writes a fresh random secret to `<userData>/mcp/secret` (user-only) on every start. The relay
 * sends `cushn-relay/1 <nonce>\n`; the app answers `<proof>\n`, the HMAC-SHA256 of the nonce keyed
 * with the secret; nonce, secret and proof are lowercase hex. The app writes nothing before a
 * valid hello, and the relay forwards nothing before a valid proof, so a program that took the
 * socket's address first (a Windows pipe name can be guessed) learns nothing and gets nothing.
 * Shared by the relay and `src/main/mcp/socket.ts`: `node:` builtins only.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Readable } from "node:stream";

const HELLO = "cushn-relay/1 ";
const HEX_32_BYTES = /^[0-9a-f]{64}$/;

/** Longer than either handshake line: a peer that sends more without a newline is cut off. */
const MAX_LINE_BYTES = 256;

/** 32 random bytes in hex: a secret or a nonce. */
export function randomHex(): string {
  return randomBytes(32).toString("hex");
}

export function helloLine(nonce: string): string {
  return `${HELLO}${nonce}\n`;
}

/** The nonce in a hello line (without its newline), or null when it isn't one. */
export function parseHello(line: string): string | null {
  if (!line.startsWith(HELLO)) return null;
  const nonce = line.slice(HELLO.length);
  return HEX_32_BYTES.test(nonce) ? nonce : null;
}

export function proofLine(secret: string, nonce: string): string {
  return `${proof(secret, nonce)}\n`;
}

/** Whether `line` (without its newline) proves knowing `secret`, in constant time. */
export function isProof(line: string, secret: string, nonce: string): boolean {
  const expected = Buffer.from(proof(secret, nonce));
  const actual = Buffer.from(line);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function proof(secret: string, nonce: string): string {
  return createHmac("sha256", secret).update(nonce).digest("hex");
}

/**
 * Reads the next line from `stream`, without its newline. Rejects when it runs over 256 bytes,
 * the stream ends, errors or closes first, or after `timeoutMs`. On success the stream is left
 * paused with any bytes after the line put back, for the next reader to `resume()` (`pipe` does).
 */
export function readLine(stream: Readable, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\n");
      if ((end === -1 ? buffered.length : end) > MAX_LINE_BYTES) {
        settle(new Error("The handshake line is too long"));
        return;
      }
      if (end === -1) return;
      settle();
      stream.pause();
      const rest = buffered.subarray(end + 1);
      if (rest.length > 0) stream.unshift(rest);
      resolve(buffered.subarray(0, end).toString("utf8"));
    };
    const onEnd = () => settle(new Error("The connection closed during the handshake"));
    const timer = setTimeout(() => settle(new Error("The handshake timed out")), timeoutMs);

    function settle(error?: Error) {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("close", onEnd);
      stream.off("error", settle);
      if (error) reject(error);
    }

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("close", onEnd);
    stream.once("error", settle);
    stream.resume();
  });
}
