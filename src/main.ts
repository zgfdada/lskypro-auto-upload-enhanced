import {
  addIcon,
  Editor,
  FileSystemAdapter,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  requestUrl,
  TAbstractFile,
  TFile,
} from "obsidian";
import * as path from "path";
import imageType from "image-type";

import { arrayToObject, getUrlAsset, isAssetTypeAnImage } from "./utils";
import Helper from "./helper";
import { SettingTab, PluginSettings, DEFAULT_SETTINGS } from "./setting";
import { LskyProUploader } from "./uploader";
import { resolveImageFileMetadata } from "./image-file";
import { shouldDeleteUploadedSource } from "./upload-cleanup";
import { getRemoteUploadCandidateKey } from "./upload-policy";

interface ImageLink {
  path: string;
  obspath: string;
  name: string;
  source: string;
  cleanupOnFailure?: boolean;
}

interface DownloadResult {
  ok: boolean;
  msg: any;
  path?: string;
  type?: any;
}

interface ProgressState {
  total: number;
  current: number;
  success: number;
  failed: number;
  currentName?: string;
  lastError?: string;
}

export default class imageAutoUploadPlugin extends Plugin {
  settings: PluginSettings;
  helper: Helper;
  editor: Editor;
  lskyUploader: LskyProUploader;
  uploader: LskyProUploader;

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {}

  async onload() {
    await this.loadSettings();
    this.helper = new Helper(this.app);
    this.lskyUploader = new LskyProUploader(this.settings, this.app);
    this.uploader = this.lskyUploader;

    addIcon(
      "upload",
      `<svg t="1636630783429" class="icon" viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M 71.638 35.336 L 79.408 35.336 C 83.7 35.336 87.178 38.662 87.178 42.765 L 87.178 84.864 C 87.178 88.969 83.7 92.295 79.408 92.295 L 17.249 92.295 C 12.957 92.295 9.479 88.969 9.479 84.864 L 9.479 42.765 C 9.479 38.662 12.957 35.336 17.249 35.336 L 25.019 35.336 L 25.019 42.765 L 17.249 42.765 L 17.249 84.864 L 79.408 84.864 L 79.408 42.765 L 71.638 42.765 L 71.638 35.336 Z M 49.014 10.179 L 67.326 27.688 L 61.835 32.942 L 52.849 24.352 L 52.849 59.731 L 45.078 59.731 L 45.078 24.455 L 36.194 32.947 L 30.702 27.692 L 49.012 10.181 Z" fill="#8a8a8a"></path></svg>`,
    );

    this.addSettingTab(new SettingTab(this.app, this));
    this.registerContextMenus();

    this.addCommand({
      id: "Upload all images",
      name: "Upload all images-All images in the current file",
      checkCallback: (checking: boolean) => {
        const leaf = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!leaf) {
          return false;
        }
        if (!checking) {
          const file = this.app.workspace.getActiveFile();
          this.uploadAllFile(file || undefined);
        }
        return true;
      },
    });

    this.addCommand({
      id: "Download all images",
      name: "Download all images",
      checkCallback: (checking: boolean) => {
        const leaf = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!leaf) {
          return false;
        }
        if (!checking) {
          void this.downloadAllImageFiles();
        }
        return true;
      },
    });

    this.addCommand({
      id: "Upload all images in all notes (reuse)",
      name: "Upload all images - All notes in vault (reuse)",
      checkCallback: (checking: boolean) => {
        const hasMarkdown = this.app.vault.getFiles().some((f) => f.path.endsWith(".md"));
        if (!hasMarkdown) {
          return false;
        }
        if (!checking) {
          void this.uploadAllNotesByUploadAllFile();
        }
        return true;
      },
    });

    this.setupPasteHandler();
    this.registerSelection();
  }

  registerSelection() {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, _info: MarkdownView | MarkdownFileInfo) => {
        if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
          return;
        }
        const selection = editor.getSelection();
        if (!selection) {
          return;
        }
        const markdownRegex = /!\[.*\]\((.*)\)/g;
        const markdownMatch = markdownRegex.exec(selection);
        if (markdownMatch && markdownMatch.length > 1) {
          const markdownUrl = markdownMatch[1];
          if (this.settings.uploadedImages?.find((item: { imgUrl: string }) => item.imgUrl === markdownUrl)) {
            // keep hook for future selected-image actions
          }
        }
      }),
    );
  }

  normalizeVaultPath(vaultPath: string): string {
    return (vaultPath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  }

  getAttachmentFolderPathForFile(targetFile?: TFile | null): string | null {
    const configuredFolder = (this.settings.downloadFolder || "").trim();
    const vaultConfig = (this.app.vault as any).config || {};
    let assetFolder = configuredFolder || vaultConfig.attachmentFolderPath;
    if (!assetFolder) {
      assetFolder = "/";
    }

    if (!targetFile) {
      return this.normalizeVaultPath(assetFolder);
    }

    const parentPath = this.normalizeVaultPath(targetFile.parent?.path || "");
    if (assetFolder.startsWith("./")) {
      return this.normalizeVaultPath(path.posix.join(parentPath, assetFolder.substring(2)));
    }
    if (assetFolder.startsWith("../")) {
      return this.normalizeVaultPath(path.posix.join(parentPath, assetFolder));
    }
    return this.normalizeVaultPath(assetFolder);
  }

  async ensureFolderExists(folderPath: string) {
    const normalized = this.normalizeVaultPath(folderPath);
    if (!normalized) {
      return;
    }
    const segments = normalized.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  toNoteRelativePath(noteFile: TFile, targetPath: string): string {
    const noteDir = this.normalizeVaultPath(noteFile.parent?.path || "");
    const normalizedTarget = this.normalizeVaultPath(targetPath);
    let relativePath = path.posix.relative(noteDir || "", normalizedTarget);
    if (!relativePath) {
      relativePath = path.posix.basename(normalizedTarget);
    }
    if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
      relativePath = `./${relativePath}`;
    }
    return encodeURI(relativePath.replace(/\\/g, "/"));
  }

  async downloadRemoteImageToVault(url: string, targetFile: TFile): Promise<DownloadResult> {
    const folderPathAbs = this.getAttachmentFolderPathForFile(targetFile);
    if (folderPathAbs == null) {
      return { ok: false, msg: "Get attachment folder path faild." };
    }
    await this.ensureFolderExists(folderPathAbs);

    const asset = getUrlAsset(url);
    let [name, ext] = [
      decodeURI(path.parse(asset).name).replaceAll(/[\\/:*?"<>|]/g, "-"),
      path.parse(asset).ext,
    ];
    const originalFileName = ext ? `${name}${ext}` : name;
    const candidatePath = this.normalizeVaultPath(folderPathAbs ? `${folderPathAbs}/${originalFileName}` : originalFileName);
    if (this.app.vault.getAbstractFileByPath(candidatePath)) {
      name = (Math.random() + 1).toString(36).substring(2, 7);
    }
    return this.download(url, folderPathAbs, name, ext);
  }

  async downloadAllImageFiles() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("没有打开的文件");
      return;
    }

    const content = this.helper.getValue();
    const fileArray = this.helper.getImageLink(content);
    let success = 0;
    let failed = 0;
    let updatedContent = content;

    for (const file of fileArray) {
      if (!file.path.startsWith("http")) {
        continue;
      }
      try {
        const response = await this.downloadRemoteImageToVault(file.path, activeFile);
        if (!response.ok || !response.path) {
          failed++;
          continue;
        }
        success++;
        const localPath = this.toNoteRelativePath(activeFile, response.path);
        const fileName = path.posix.basename(response.path);
        updatedContent = updatedContent.replace(
          file.source,
          `![${fileName}${this.settings.imageSizeSuffix || ""}](${localPath})`,
        );
      } catch {
        failed++;
      }
    }

    this.helper.setValue(updatedContent);
    new Notice(`all: ${success + failed}\nsuccess: ${success}\nfailed: ${failed}`);
  }

  getAttachmentFolderPath() {
    return this.getAttachmentFolderPathForFile(this.app.workspace.getActiveFile());
  }

  async download(url: string, folderPath: string, name: string, ext: string): Promise<DownloadResult> {
    const response = await requestUrl({ url });
    const bytes = new Uint8Array(response.arrayBuffer);
    const type = await imageType(bytes);
    const resolvedMetadata = await resolveImageFileMetadata(`${name}${ext}`, bytes);

    if (response.status !== 200 || !resolvedMetadata) {
      return {
        ok: false,
        msg: `Illegal image data from remote source: ${url}`,
      };
    }

    const buffer = Buffer.from(response.arrayBuffer);

    try {
      const targetPath = `${folderPath}/${resolvedMetadata.fileName}`;
      await (this.app.vault as any).createBinary(targetPath, buffer, {
        ctime: Date.now(),
        mtime: Date.now(),
      });
      return {
        ok: true,
        msg: "ok",
        path: targetPath,
        type: type || { ext: resolvedMetadata.detectedExtension, mime: resolvedMetadata.mime },
      };
    } catch (err) {
      console.error(err);
      return {
        ok: false,
        msg: err,
      };
    }
  }

  getFile(fileName: string, fileMap: Record<string, TFile>) {
    if (!fileMap) {
      fileMap = arrayToObject(this.app.vault.getFiles(), "name");
    }
    return fileMap[fileName];
  }

  resolveLocalImage(matchPath: string, activeFile: TFile, fileMap: Record<string, TFile>, filePathMap: Record<string, TFile>) {
    const decodedPath = decodeURI(matchPath);
    const normalizedPath = this.normalizeVaultPath(decodedPath);
    let file = filePathMap[normalizedPath];
    if (!file && (decodedPath.startsWith("./") || decodedPath.startsWith("../"))) {
      const absolutePath = this.normalizeVaultPath(path.posix.join(path.posix.dirname(activeFile.path), decodedPath));
      file = this.app.vault.getAbstractFileByPath(absolutePath) as TFile | null;
    }
    if (!file) {
      file = this.getFile(path.basename(decodedPath), fileMap);
    }
    return file;
  }

  createProgressNotice() {
    return new Notice("", 0);
  }

  updateProgressNotice(notice: Notice, title: string, state: ProgressState) {
    const lines = [
      title,
      `总数: ${state.total}`,
      `进度: ${state.current}/${state.total}`,
      `成功: ${state.success} 失败: ${state.failed}`,
    ];
    if (state.currentName) {
      lines.push(`当前: ${state.currentName}`);
    }
    if (state.lastError) {
      lines.push(`错误: ${state.lastError}`);
    }
    const message = lines.join("\n");
    const noticeWithSetMessage = notice as Notice & { setMessage?: (message: string) => void; noticeEl?: HTMLElement };
    if (typeof noticeWithSetMessage.setMessage === "function") {
      noticeWithSetMessage.setMessage(message);
      return;
    }
    if (!noticeWithSetMessage.noticeEl) {
      return;
    }
    const contentEl = noticeWithSetMessage.noticeEl.querySelector(".notice-content") || noticeWithSetMessage.noticeEl;
    while (contentEl.firstChild) {
      contentEl.removeChild(contentEl.firstChild);
    }
    message.split("\n").forEach((line, index) => {
      if (index > 0) {
        contentEl.appendChild(document.createElement("br"));
      }
      contentEl.appendChild(document.createTextNode(line));
    });
  }

  closeProgressNotice(notice: Notice) {
    (notice as Notice & { hide?: () => void }).hide?.();
  }

  async uploadSingleImageItem(item: ImageLink) {
    const result = await this.uploader.uploadFilesByPath([item.obspath]);
    if (!result.success || !result.result?.[0]) {
      return {
        success: false,
        message: result.message || "Upload error",
      };
    }
    return {
      success: true,
      url: result.result[0],
      fullResult: result.fullResult || [],
    };
  }

  async uploadAllFile(currentFile?: TFile) {
    const activeFile = currentFile ?? this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("没有打开的文件");
      return;
    }

    const isActive =
      activeFile === this.app.workspace.getActiveFile() &&
      !!this.app.workspace.getActiveViewOfType(MarkdownView);
    let content = isActive ? this.helper.getValue() : await this.app.vault.read(activeFile);

    const basePath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    const fileMap = arrayToObject(this.app.vault.getFiles(), "name");
    const filePathMap = arrayToObject(this.app.vault.getFiles(), "path");
    const imageList: ImageLink[] = [];
    const fileArray = this.helper.getImageLink(content);
    const queuedRemoteImages = new Set<string>();

    for (const match of fileArray) {
      const imageName = match.name;
      const encodedUri = match.path;

      if (encodedUri.startsWith("http")) {
        const remoteCandidateKey = getRemoteUploadCandidateKey(encodedUri, this.settings.uploadServer);
        if (!remoteCandidateKey || queuedRemoteImages.has(remoteCandidateKey)) {
          continue;
        }
        queuedRemoteImages.add(remoteCandidateKey);
        try {
          const downloadResult = await this.downloadRemoteImageToVault(encodedUri, activeFile);
          if (downloadResult.ok && downloadResult.path) {
            const pushObj = {
              path: path.join(basePath, downloadResult.path),
              obspath: downloadResult.path,
              name: path.posix.basename(downloadResult.path) || imageName,
              source: match.source,
              cleanupOnFailure: true,
            };
            if (!imageList.find((item) => item.path === pushObj.path && item.source === pushObj.source)) {
              imageList.push(pushObj);
            }
          }
        } catch {
          // keep going; detailed failures surface during progress upload
        }
        continue;
      }

      const file = this.resolveLocalImage(encodedUri, activeFile, fileMap, filePathMap);
      if (!file) {
        continue;
      }

      const abstractImageFile = path.join(basePath, file.path);
      if (!isAssetTypeAnImage(abstractImageFile)) {
        continue;
      }

      const pushObj = {
        path: abstractImageFile,
        obspath: file.path,
        name: file.name || imageName,
        source: match.source,
        cleanupOnFailure: false,
      };
      if (!imageList.find((item) => item.path === abstractImageFile && item.source === match.source)) {
        imageList.push(pushObj);
      }
    }

    if (imageList.length === 0) {
      new Notice(`${activeFile.path}没有解析到图像文件`);
      return;
    }

    const notice = this.createProgressNotice();
    let successCount = 0;
    let failCount = 0;
    let lastError = "";
    const uploadedImages: any[] = [];
    const filesToDelete = new Set<string>();

    this.updateProgressNotice(notice, "开始上传图片到兰空", {
      total: imageList.length,
      current: 0,
      success: 0,
      failed: 0,
    });

    for (let index = 0; index < imageList.length; index++) {
      const item = imageList[index];
      this.updateProgressNotice(notice, "开始上传图片到兰空", {
        total: imageList.length,
        current: index + 1,
        success: successCount,
        failed: failCount,
        currentName: item.name,
        lastError,
      });

      try {
        const singleResult = await this.uploadSingleImageItem(item);
        if (singleResult.success) {
          successCount++;
          uploadedImages.push(...singleResult.fullResult);
          content = content.replaceAll(
            item.source,
            `![${item.name}${this.settings.imageSizeSuffix || ""}](${singleResult.url})`,
          );
          if (
            shouldDeleteUploadedSource({
              uploadSucceeded: true,
              deleteSource: this.settings.deleteSource,
              cleanupOnFailure: !!item.cleanupOnFailure,
            })
          ) {
            filesToDelete.add(item.obspath);
          }
        } else {
          failCount++;
          lastError = `${item.name}: ${singleResult.message}`;
          if (
            shouldDeleteUploadedSource({
              uploadSucceeded: false,
              deleteSource: this.settings.deleteSource,
              cleanupOnFailure: !!item.cleanupOnFailure,
            })
          ) {
            filesToDelete.add(item.obspath);
          }
          this.updateProgressNotice(notice, "开始上传图片到兰空", {
            total: imageList.length,
            current: index + 1,
            success: successCount,
            failed: failCount,
            currentName: item.name,
            lastError,
          });
        }
      } catch (error: any) {
        failCount++;
        lastError = `${item.name}: ${error?.message || String(error)}`;
        if (
          shouldDeleteUploadedSource({
            uploadSucceeded: false,
            deleteSource: this.settings.deleteSource,
            cleanupOnFailure: !!item.cleanupOnFailure,
          })
        ) {
          filesToDelete.add(item.obspath);
        }
        this.updateProgressNotice(notice, "开始上传图片到兰空", {
          total: imageList.length,
          current: index + 1,
          success: successCount,
          failed: failCount,
          currentName: item.name,
          lastError,
        });
      }
    }

    this.settings.uploadedImages = [
      ...(this.settings.uploadedImages || []),
      ...uploadedImages,
    ];
    await this.saveSettings();

    if (isActive) {
      this.helper.setValue(content);
    } else {
      await this.app.vault.modify(activeFile, content);
    }

    if (filesToDelete.size > 0) {
      for (const obsPath of filesToDelete) {
        const fileDel = this.app.vault.getAbstractFileByPath(obsPath);
        if (fileDel) {
          await this.app.vault.delete(fileDel);
        }
      }
    }

    this.updateProgressNotice(notice, "图片上传完成", {
      total: imageList.length,
      current: imageList.length,
      success: successCount,
      failed: failCount,
      lastError,
    });
    window.setTimeout(() => this.closeProgressNotice(notice), 3000);

    if (failCount > 0) {
      new Notice(`上传完成，成功 ${successCount}，失败 ${failCount}`);
    }
  }

  async uploadAllNotesByUploadAllFile() {
    const mdFiles = this.app.vault.getFiles().filter((f) => f.path.endsWith(".md"));
    for (const md of mdFiles) {
      await this.uploadAllFile(md);
    }
    new Notice(`处理完成，共处理 ${mdFiles.length} 个文件`);
  }

  canUploadMarkdownFile(file: TAbstractFile | null | undefined): file is TFile {
    return !!file && file instanceof TFile && file.path.endsWith(".md");
  }

  addUploadMenuItem(menu: Menu, file: TFile) {
    menu.addItem((item) =>
      item
        .setTitle("上传当前文件图片到兰空（自动处理远程图）")
        .setIcon("upload")
        .onClick(() => void this.uploadAllFile(file)),
    );
  }

  registerContextMenus() {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!this.canUploadMarkdownFile(file)) {
          return;
        }
        this.addUploadMenuItem(menu, file);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, _editor, view) => {
        const file = (view as MarkdownView | undefined)?.file || this.app.workspace.getActiveFile();
        if (!this.canUploadMarkdownFile(file)) {
          return;
        }
        this.addUploadMenuItem(menu, file);
      }),
    );
  }

  setupPasteHandler() {
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt: ClipboardEvent, editor: Editor) => {
        const allowUpload = this.helper.getFrontmatterValue(
          "image-auto-upload",
          this.settings.uploadByClipSwitch,
        );
        if (!allowUpload) {
          return;
        }

        if (this.settings.workOnNetWork) {
          const clipboardValue = evt.clipboardData?.getData("text/plain") || "";
          const imageList = this.helper
            .getImageLink(clipboardValue)
            .filter((image) => image.path.startsWith("http"))
            .filter((image) => !this.helper.hasBlackDomain(image.path, this.settings.newWorkBlackDomains));

          if (imageList.length !== 0) {
            void this.uploader.uploadFilesByPath(imageList.map((item) => item.path)).then((res) => {
              let value = this.helper.getValue();
              if (res.success) {
                const uploadUrlList = [...res.result];
                imageList.forEach((item) => {
                  const uploadImage = uploadUrlList.shift();
                  value = value.replaceAll(
                    item.source,
                    `![${item.name}${this.settings.imageSizeSuffix || ""}](${uploadImage})`,
                  );
                });
                this.helper.setValue(value);
                const uploadUrlFullResultList = res.fullResult || [];
                this.settings.uploadedImages = [
                  ...(this.settings.uploadedImages || []),
                  ...uploadUrlFullResultList,
                ];
                void this.saveSettings();
              } else {
                new Notice(res.message || "Upload error");
              }
            });
          }
        }

        if (this.canUpload(evt.clipboardData!)) {
          void this.uploadFileAndEmbedImgurImage(
            editor,
            async (_editor: Editor, pasteId: string) => {
              const res = await this.uploader.uploadFileByClipboard(evt);
              if (res.code !== 0) {
                this.handleFailedUpload(editor, pasteId, res.msg);
                return;
              }
              const url = res.data;
              const uploadUrlFullResultList = res.fullResult || [];
              this.settings.uploadedImages = [
                ...(this.settings.uploadedImages || []),
                ...uploadUrlFullResultList,
              ];
              await this.saveSettings();
              return url;
            },
            evt.clipboardData!,
          );
          evt.preventDefault();
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("editor-drop", async (evt: DragEvent, editor: Editor) => {
        const allowUpload = this.helper.getFrontmatterValue(
          "image-auto-upload",
          this.settings.uploadByClipSwitch,
        );
        const files = evt.dataTransfer?.files;
        if (!allowUpload || !files || files.length === 0 || !files[0].type.startsWith("image")) {
          return;
        }

        evt.preventDefault();
        const data = await this.uploader.uploadFiles(Array.from(files));
        if (!data.success) {
          new Notice(data.message || "Upload error");
          return;
        }

        const uploadUrlFullResultList = data.fullResult ?? [];
        this.settings.uploadedImages = [
          ...(this.settings.uploadedImages ?? []),
          ...uploadUrlFullResultList,
        ];
        await this.saveSettings();
        data.result.forEach((value: string) => {
          const pasteId = (Math.random() + 1).toString(36).substring(2, 7);
          this.insertTemporaryText(editor, pasteId);
          this.embedMarkDownImage(editor, pasteId, value, files[0].name);
        });
      }),
    );
  }

  canUpload(clipboardData: DataTransfer) {
    const files = clipboardData.files;
    const text = clipboardData.getData("text");
    const hasImageFile = files.length !== 0 && files[0].type.startsWith("image");
    if (!hasImageFile) {
      return false;
    }
    if (text) {
      return this.settings.applyImage;
    }
    return true;
  }

  async uploadFileAndEmbedImgurImage(
    editor: Editor,
    callback: Function,
    clipboardData: DataTransfer,
  ) {
    const pasteId = (Math.random() + 1).toString(36).substring(2, 7);
    this.insertTemporaryText(editor, pasteId);
    const name = clipboardData.files[0].name;
    try {
      const url = await callback(editor, pasteId);
      this.embedMarkDownImage(editor, pasteId, url, name);
    } catch (e) {
      this.handleFailedUpload(editor, pasteId, e);
    }
  }

  insertTemporaryText(editor: Editor, pasteId: string) {
    editor.replaceSelection(imageAutoUploadPlugin.progressTextFor(pasteId) + "\n");
  }

  private static progressTextFor(id: string) {
    return `![Uploading file...${id}]()`;
  }

  embedMarkDownImage(editor: Editor, pasteId: string, imageUrl: string, name = "") {
    const progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
    const imageSizeSuffix = this.settings.imageSizeSuffix || "";
    const markDownImage = `![${name}${imageSizeSuffix}](${imageUrl})`;
    imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, markDownImage);
  }

  handleFailedUpload(editor: Editor, pasteId: string, reason: any) {
    new Notice(String(reason));
    console.error("Failed request: ", reason);
    const progressText = imageAutoUploadPlugin.progressTextFor(pasteId);
    imageAutoUploadPlugin.replaceFirstOccurrence(editor, progressText, "upload failed, check dev console");
  }

  static replaceFirstOccurrence(editor: Editor, target: string, replacement: string) {
    const lines = editor.getValue().split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ch = lines[i].indexOf(target);
      if (ch !== -1) {
        const from = { line: i, ch };
        const to = { line: i, ch: ch + target.length };
        editor.replaceRange(replacement, from, to);
        break;
      }
    }
  }
}
