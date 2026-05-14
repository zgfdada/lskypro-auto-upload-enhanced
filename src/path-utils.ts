export interface ParsedVaultPath {
  base: string;
  name: string;
  ext: string;
}

export function normalizeVaultPath(value: string) {
  return (value || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function joinVaultPath(...parts: string[]) {
  const joined = parts
    .filter((part) => part !== "")
    .join("/")
    .replace(/\/+/g, "/");
  const segments: string[] = [];
  for (const segment of joined.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

export function getBaseName(value: string) {
  const normalized = normalizeVaultPath(value);
  return normalized.split("/").pop() || "";
}

export function getDirName(value: string) {
  const normalized = normalizeVaultPath(value);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.substring(0, index);
}

export function parseVaultPath(value: string): ParsedVaultPath {
  const base = getBaseName(value);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return { base, name: base, ext: "" };
  }
  return {
    base,
    name: base.substring(0, dot),
    ext: base.substring(dot),
  };
}

export function getExtension(value: string) {
  return parseVaultPath(value).ext;
}

export function getFileNameWithoutExtension(value: string) {
  return parseVaultPath(value).name;
}

export function getRelativeVaultPath(fromDir: string, toPath: string) {
  const fromSegments = normalizeVaultPath(fromDir).split("/").filter(Boolean);
  const toSegments = normalizeVaultPath(toPath).split("/").filter(Boolean);
  let common = 0;
  while (common < fromSegments.length && common < toSegments.length && fromSegments[common] === toSegments[common]) {
    common++;
  }
  const up = fromSegments.slice(common).map(() => "..");
  const down = toSegments.slice(common);
  return [...up, ...down].join("/") || getBaseName(toPath);
}
