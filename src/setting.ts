import { App, PluginSettingTab, Setting } from "obsidian";
import imageAutoUploadPlugin from "./main";
import { t } from "./lang/helpers";

export interface PluginSettings {
  uploadByClipSwitch: boolean;
  uploadServer: string;
  token: string;
  strategy_id: string;
  downloadFolder: string;
  imageSizeSuffix: string;
  uploader: string;
  workOnNetWork: boolean;
  newWorkBlackDomains: string;
  fixPath: boolean;
  applyImage: boolean;
  deleteSource: boolean;
  [propName: string]: any;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  uploadByClipSwitch: true,
  uploader: "LskyPro",
  token: "",
  strategy_id: "",
  downloadFolder: "",
  uploadServer: "https://lsky.xxxx",
  imageSizeSuffix: "",
  workOnNetWork: false,
  fixPath: false,
  applyImage: true,
  newWorkBlackDomains: "",
  deleteSource: false,
};

export class SettingTab extends PluginSettingTab {
  plugin: imageAutoUploadPlugin;

  constructor(app: App, plugin: imageAutoUploadPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName(t("Plugin Settings")).setHeading();

    new Setting(containerEl)
      .setName(t("Auto pasted upload"))
      .setDesc("启用后，粘贴图片时会自动上传到 Lsky")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.uploadByClipSwitch)
          .onChange(async (value) => {
            this.plugin.settings.uploadByClipSwitch = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Default uploader"))
      .setDesc(t("Default uploader"))
      .addDropdown((cb) =>
        cb
          .addOption("LskyPro", "LskyPro")
          .setValue(this.plugin.settings.uploader)
          .onChange(async (value) => {
            this.plugin.settings.uploader = value;
            this.display();
            await this.plugin.saveSettings();
          }),
      );

    if (this.plugin.settings.uploader === "LskyPro") {
      new Setting(containerEl)
        .setName("LskyPro 域名")
        .setDesc("只填写站点地址，不要填写完整 API 路径")
        .addText((text) =>
          text
            .setPlaceholder("https://lsky.example.com")
            .setValue(this.plugin.settings.uploadServer)
            .onChange(async (key) => {
              this.plugin.settings.uploadServer = key.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("LskyPro Token")
        .setDesc("新版本填写 API Token；旧版 Lsky 可直接填写 32 位 token")
        .addText((text) =>
          text
            .setPlaceholder("请输入 Lsky Token")
            .setValue(this.plugin.settings.token)
            .onChange(async (key) => {
              this.plugin.settings.token = key.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("图片下载目录")
        .setDesc("留空时跟随 Obsidian 附件目录；也可单独指定插件下载目录")
        .addText((text) =>
          text
            .setPlaceholder("例如 attachments/clippings")
            .setValue(this.plugin.settings.downloadFolder || "")
            .onChange(async (key) => {
              this.plugin.settings.downloadFolder = key.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("LskyPro Strategy id")
        .setDesc("存储策略 ID，可留空")
        .addText((text) =>
          text
            .setPlaceholder("请输入策略 ID")
            .setValue(this.plugin.settings.strategy_id)
            .onChange(async (key) => {
              this.plugin.settings.strategy_id = key.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName(t("Image size suffix"))
      .setDesc(t("Image size suffix Description"))
      .addText((text) =>
        text
          .setPlaceholder(t("Please input image size suffix"))
          .setValue(this.plugin.settings.imageSizeSuffix)
          .onChange(async (key) => {
            this.plugin.settings.imageSizeSuffix = key;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Work on network"))
      .setDesc(t("Work on network Description"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.workOnNetWork)
          .onChange(async (value) => {
            this.plugin.settings.workOnNetWork = value;
            this.display();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Network Domain Black List"))
      .setDesc(t("Network Domain Black List Description"))
      .addTextArea((textArea) =>
        textArea
          .setValue(this.plugin.settings.newWorkBlackDomains)
          .onChange(async (value) => {
            this.plugin.settings.newWorkBlackDomains = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Upload when clipboard has image and text together"))
      .setDesc(
        t(
          "When you copy, some application like Excel will image and text to clipboard, you can upload or not.",
        ),
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.applyImage)
          .onChange(async (value) => {
            this.plugin.settings.applyImage = value;
            this.display();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("Delete source file after you upload file"))
      .setDesc(t("Delete source file in ob assets after you upload file."))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteSource)
          .onChange(async (value) => {
            this.plugin.settings.deleteSource = value;
            this.display();
            await this.plugin.saveSettings();
          }),
      );
  }
}
