import { getExtension, parseVaultPath } from "./path-utils.js";

export interface ResolvedImageFileMetadata {
  originalName: string;
  originalExtension: string;
  detectedExtension: string;
  mime: string;
  fileName: string;
  extensionChanged: boolean;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function normalizeDetectedExtension(ext: string) {
  return ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase();
}

function sniffSvg(bytes: Uint8Array) {
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512));
  const normalized = sample.replace(/^\uFEFF/, "").trimStart().toLowerCase();
  return normalized.startsWith("<svg") || normalized.startsWith("<?xml") && normalized.includes("<svg");
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectImageMetadata(bytes: Uint8Array) {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", mime: MIME_BY_EXTENSION.jpg };
  }
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: "png", mime: MIME_BY_EXTENSION.png };
  }
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { ext: "gif", mime: MIME_BY_EXTENSION.gif };
  }
  if (startsWithBytes(bytes, [0x42, 0x4d])) {
    return { ext: "bmp", mime: MIME_BY_EXTENSION.bmp };
  }
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: "webp", mime: MIME_BY_EXTENSION.webp };
  }
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x61 &&
    bytes[9] === 0x76 &&
    bytes[10] === 0x69 &&
    bytes[11] === 0x66
  ) {
    return { ext: "avif", mime: MIME_BY_EXTENSION.avif };
  }

  if (sniffSvg(bytes)) {
    return {
      ext: "svg",
      mime: MIME_BY_EXTENSION.svg,
    };
  }

  return null;
}

export function resolveImageFileMetadata(originalName: string, bytes: Uint8Array): ResolvedImageFileMetadata | null {
  const detected = detectImageMetadata(bytes);
  if (!detected) {
    return null;
  }

  const parsed = parseVaultPath(originalName || "image");
  const originalExtension = getExtension(parsed.base).replace(/^\./, "").toLowerCase();
  const nextExtension = detected.ext;
  const baseName = parsed.name || parsed.base || "image";
  const extensionChanged =
    normalizeDetectedExtension(originalExtension || "") !== normalizeDetectedExtension(nextExtension);

  return {
    originalName: originalName || "image",
    originalExtension,
    detectedExtension: nextExtension,
    mime: detected.mime,
    fileName: extensionChanged ? `${baseName}.${nextExtension}` : parsed.base,
    extensionChanged,
  };
}
