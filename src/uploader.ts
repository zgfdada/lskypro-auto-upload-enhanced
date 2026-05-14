import { App, requestUrl } from "obsidian";
import { PluginSettings } from "./setting";
import { resolveImageFileMetadata } from "./image-file";
import { getUploadConversionPlan } from "./upload-policy";

export interface UploadResult {
  code: number;
  msg: string;
  data: string;
  fullResult: any[];
}

export interface UploadBatchResult {
  result: string[];
  success: boolean;
  fullResult?: any[];
  message?: string;
}

export class LskyProUploader {
  settings: PluginSettings;
  lskyUrl: string;
  lskyToken: string;
  app: App;
  isLegacyApi: boolean;

  constructor(settings: PluginSettings, app: App) {
    this.settings = settings;
    this.isLegacyApi = /^[0-9a-f]{32}$/i.test((this.settings.token || "").trim());
    this.lskyUrl = this.settings.uploadServer.endsWith("/")
      ? this.settings.uploadServer + (this.isLegacyApi ? "api/upload" : "api/v1/upload")
      : this.settings.uploadServer + (this.isLegacyApi ? "/api/upload" : "/api/v1/upload");
    this.lskyToken = this.isLegacyApi
      ? (this.settings.token || "").trim()
      : "Bearer " + this.settings.token;
    this.app = app;
  }

  getRequestOptions(file: File) {
    return this.getMultipartRequestOptions(file);
  }

  async getMultipartRequestOptions(file: File) {
    const boundary = `----obsidian-lsky-${Date.now().toString(36)}`;
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();
    const appendText = (value: string) => parts.push(encoder.encode(value));
    const appendField = (name: string, value: string) => {
      appendText(`--${boundary}\r\n`);
      appendText(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
      appendText(`${value}\r\n`);
    };
    const appendFile = async (name: string) => {
      appendText(`--${boundary}\r\n`);
      appendText(`Content-Disposition: form-data; name="${name}"; filename="${file.name}"\r\n`);
      appendText(`Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`);
      parts.push(new Uint8Array(await file.arrayBuffer()));
      appendText("\r\n");
    };

    if (this.isLegacyApi) {
      await appendFile("image");
    } else {
      await appendFile("file");
      if (this.settings.strategy_id) {
        appendField("strategy_id", this.settings.strategy_id);
      }
    }
    appendText(`--${boundary}--\r\n`);

    const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const body = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    };
    if (this.isLegacyApi) {
      headers.token = this.lskyToken;
    } else {
      headers.Authorization = this.lskyToken;
    }

    return {
      url: this.lskyUrl,
      method: "POST" as const,
      headers,
      body: body.buffer,
    };
  }

  normalizeResponse(value: any): UploadResult {
    if (this.isLegacyApi) {
      if (Number(value?.code) !== 200) {
        return {
          code: -1,
          msg: value?.msg || "Upload error",
          data: "",
          fullResult: [],
        };
      }

      return {
        code: 0,
        msg: "success",
        data: value?.data?.url || "",
        fullResult: [value?.data].filter(Boolean),
      };
    }

    if (!value?.status) {
      return {
        code: -1,
        msg: value?.message || "Upload error",
        data: "",
        fullResult: [],
      };
    }

    return {
      code: 0,
      msg: "success",
      data: value?.data?.links?.url || "",
      fullResult: [value?.data].filter(Boolean),
    };
  }

  async promiseRequest(file: File): Promise<UploadResult> {
    try {
      const response = await requestUrl(await this.getMultipartRequestOptions(file));
      const value = response.json;
      const normalized = this.normalizeResponse(value);
      if (normalized.code !== 0) {
        normalized.msg = `${normalized.msg} [file=${file.name}, type=${file.type || "unknown"}, size=${file.size}]`;
      }
      return normalized;
    } catch (error: any) {
      return {
        code: -1,
        msg: error?.message || String(error),
        data: "",
        fullResult: [],
      };
    }
  }

  async createNormalizedFile(bytes: Uint8Array, originalName: string): Promise<File> {
    const metadata = await resolveImageFileMetadata(originalName, bytes);
    if (!metadata) {
      const fileHeader = Array.from(bytes.subarray(0, 16))
        .map((item) => item.toString(16).padStart(2, "0"))
        .join(" ");
      throw new Error(`Illegal image data: ${originalName} [header=${fileHeader}]`);
    }
    const plan = getUploadConversionPlan({
      isLegacyApi: this.isLegacyApi,
      detectedExtension: metadata.detectedExtension,
      mime: metadata.mime,
    });

    if (!plan.convert) {
      const fileBytes = bytes.slice().buffer as ArrayBuffer;
      return new File([fileBytes], metadata.fileName, { type: metadata.mime });
    }

    const convertedBytes = await this.convertImageBytes(bytes, metadata.mime, plan.targetMime);
    const convertedFileName = metadata.fileName.replace(/\.[^.]+$/, `.${plan.targetExtension}`);
    return new File([convertedBytes.buffer as ArrayBuffer], convertedFileName, { type: plan.targetMime });
  }

  async convertImageBytes(bytes: Uint8Array, inputMime: string, targetMime: string): Promise<Uint8Array> {
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: inputMime });
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Unsupported image conversion: ${inputMime}`));
        img.src = objectUrl;
      });

      const canvas = activeDocument.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas context unavailable");
      }
      context.drawImage(image, 0, 0);
      const convertedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value: Blob | null) => {
          if (value) {
            resolve(value);
            return;
          }
          reject(new Error(`Failed to convert image to ${targetMime}`));
        }, targetMime);
      });
      return new Uint8Array(await convertedBlob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async createFileObjectFromPath(filePath: string): Promise<File> {
    if (filePath.startsWith("https://") || filePath.startsWith("http://")) {
      const response = await requestUrl({ url: filePath });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Failed to download remote image: ${response.status}`);
      }
      const bytes = new Uint8Array(response.arrayBuffer);
      const originalName = decodeURI(filePath.split("/").pop()?.split("?")[0].split("#")[0] || "image");
      return this.createNormalizedFile(bytes, originalName);
    }

    const obsFile = this.app.vault.getAbstractFileByPath(filePath);
    if (!obsFile) {
      throw new Error(`Local image not found: ${filePath}`);
    }
    // @ts-ignore
    const data = await this.app.vault.readBinary(obsFile);
    const fileName = filePath.split("/").pop() || "image";
    return this.createNormalizedFile(new Uint8Array(data), fileName);
  }

  async uploadFilePath(filePath: string): Promise<UploadResult> {
    const file = await this.createFileObjectFromPath(filePath);
    return this.promiseRequest(file);
  }

  async uploadFilesByPath(fileList: string[]): Promise<UploadBatchResult> {
    const results = await Promise.all(fileList.map((filepath) => this.uploadFilePath(filepath)));
    const failItem = results.find((item) => item.code === -1);
    if (failItem) {
      return {
        result: results.filter((item) => item.code === 0).map((item) => item.data),
        success: false,
        fullResult: results.flatMap((item) => item.fullResult || []),
        message: failItem.msg,
      };
    }

    return {
      result: results.map((item) => item.data),
      success: true,
      fullResult: results.flatMap((item) => item.fullResult || []),
    };
  }

  async uploadFiles(fileList: Array<File>): Promise<UploadBatchResult> {
    const results = await Promise.all(fileList.map((file) => this.promiseRequest(file)));
    const failItem = results.find((item) => item.code === -1);
    if (failItem) {
      return {
        result: results.filter((item) => item.code === 0).map((item) => item.data),
        success: false,
        fullResult: results.flatMap((item) => item.fullResult || []),
        message: failItem.msg,
      };
    }

    return {
      result: results.map((item) => item.data),
      success: true,
      fullResult: results.flatMap((item) => item.fullResult || []),
    };
  }

  async uploadFileByClipboard(evt: ClipboardEvent): Promise<UploadResult> {
    const files = evt.clipboardData?.files;
    const file = files?.[0];
    if (!file) {
      return {
        code: -1,
        msg: "No clipboard image",
        data: "",
        fullResult: [],
      };
    }
    return this.promiseRequest(file);
  }
}
