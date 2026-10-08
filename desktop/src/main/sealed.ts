// Data kept on this Mac encrypted with the macOS Keychain (Electron safeStorage):
// the voice sample, audio made from it, and meeting transcripts.
import { safeStorage } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function seal(data: Buffer): Buffer {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("macOS Keychain isn't available, so this can't be stored safely.");
  return safeStorage.encryptString(data.toString("base64"));
}

export const unseal = (data: Buffer) => Buffer.from(safeStorage.decryptString(data), "base64");

/** Encrypts and writes atomically, so a crash never leaves half a file. */
export function writeSealed(file: string, data: Buffer | string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, seal(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  renameSync(`${file}.tmp`, file);
}

export const readSealed = (file: string) => unseal(readFileSync(file));
