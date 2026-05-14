import { extname, parse } from "path";
import imageType from "image-type";

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

export async function detectImageMetadata(bytes: Uint8Array) {
  const detected = await imageType(bytes);
  if (detected) {
    const ext = normalizeDetectedExtension(detected.ext);
    return {
      ext,
      mime: MIME_BY_EXTENSION[ext] || detected.mime,
    };
  }

  if (sniffSvg(bytes)) {
    return {
      ext: "svg",
      mime: MIME_BY_EXTENSION.svg,
    };
  }

  return null;
}

export async function resolveImageFileMetadata(originalName: string, bytes: Uint8Array): Promise<ResolvedImageFileMetadata | null> {
  const detected = await detectImageMetadata(bytes);
  if (!detected) {
    return null;
  }

  const parsed = parse(originalName || "image");
  const originalExtension = extname(parsed.base).replace(/^\./, "").toLowerCase();
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
