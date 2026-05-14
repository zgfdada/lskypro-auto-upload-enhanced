import { App } from "obsidian";
import { PluginSettings } from "./setting";

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
    const headers = new Headers();
    headers.append("Accept", "application/json");

    const formdata = new FormData();
    if (this.isLegacyApi) {
      headers.append("token", this.lskyToken);
      formdata.append("image", file);
    } else {
      headers.append("Authorization", this.lskyToken);
      formdata.append("file", file);
      if (this.settings.strategy_id) {
        formdata.append("strategy_id", this.settings.strategy_id);
      }
    }

    return {
      method: "POST",
      headers,
      body: formdata,
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
      const response = await fetch(this.lskyUrl, this.getRequestOptions(file));
      const value = await response.json();
      return this.normalizeResponse(value);
    } catch (error: any) {
      console.log("error", error);
      return {
        code: -1,
        msg: error?.message || String(error),
        data: "",
        fullResult: [],
      };
    }
  }

  async createFileObjectFromPath(filePath: string): Promise<File> {
    if (filePath.startsWith("https://") || filePath.startsWith("http://")) {
      const response = await fetch(filePath);
      const blob = await response.blob();
      return new File([blob], filePath.split("/").pop() || "image");
    }

    const obsFile = this.app.vault.getAbstractFileByPath(filePath);
    // @ts-ignore
    const data = await this.app.vault.readBinary(obsFile);
    const fileName = filePath.split("/").pop() || "image";
    const fileExtension = fileName.split(".").pop() || "png";
    const blob = new Blob([data], { type: "image/" + fileExtension });
    return new File([blob], fileName);
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
