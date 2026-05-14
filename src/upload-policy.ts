export interface UploadConversionPlanInput {
  isLegacyApi: boolean;
  detectedExtension: string;
  mime: string;
}

export interface UploadConversionPlan {
  convert: boolean;
  targetExtension: string;
  targetMime: string;
}

const LEGACY_DIRECT_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "bmp"]);

export function shouldSkipRemoteUpload(url: string, uploadServer: string) {
  try {
    const targetUrl = new URL(url);
    const currentServer = new URL(uploadServer);
    return targetUrl.origin === currentServer.origin;
  } catch {
    return false;
  }
}

export function getRemoteUploadCandidateKey(url: string, uploadServer: string) {
  if (shouldSkipRemoteUpload(url, uploadServer)) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return url;
  }
}

export function getUploadConversionPlan(input: UploadConversionPlanInput): UploadConversionPlan {
  const detectedExtension = input.detectedExtension.toLowerCase();
  if (!input.isLegacyApi) {
    return {
      convert: false,
      targetExtension: detectedExtension,
      targetMime: input.mime,
    };
  }

  if (LEGACY_DIRECT_EXTENSIONS.has(detectedExtension)) {
    return {
      convert: false,
      targetExtension: detectedExtension,
      targetMime: input.mime,
    };
  }

  return {
    convert: true,
    targetExtension: "png",
    targetMime: "image/png",
  };
}
