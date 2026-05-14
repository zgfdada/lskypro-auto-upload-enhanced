# Obsidian LskyPro Auto Upload Enhanced

这是一个把图片上传到 [Lsky Pro](https://github.com/lsky-org/lsky-pro) 的 Obsidian 插件。本 fork 在原项目基础上保留了剪贴板上传和拖拽上传，同时把“本地图片 + 远程图片 + 右键菜单 + 进度提示”这一整条链路整理成了更可维护的实现。

## 这个 Fork 新增了什么

- 兼容旧版 Lsky Pro：
  - `POST /api/upload`
  - `token: <token>` 请求头
  - `image` 表单字段
- 兼容新版 Lsky Pro：
  - `POST /api/v1/upload`
  - `Authorization: Bearer <token>`
  - `file` 表单字段
- 新增“图片下载目录”配置
  - 留空时跟随 Obsidian 附件目录
- `Download all images` 现在会把远程图片下载到本地后，替换成对当前笔记可用的相对链接
- 新增文件树和编辑器右键菜单
- 上传当前笔记图片时：
  - 遇到远程图片会先下载到本地
  - 再逐张上传到兰空
  - 最后把笔记中的链接替换成兰空链接
  - 整个过程通过单个浮动通知显示进度和错误

## 安装

### 从源码构建

```bash
npm install
npm run build
```

把生成的插件文件放到：

```text
<你的 vault>/.obsidian/plugins/lskypro-auto-upload-enhanced
```

然后重载或重启 Obsidian。

## 配置

打开：

```text
设置 -> 第三方插件 -> Image To Lskypro Enhanced
```

重点配置项：

- `LskyPro 域名`
  - 只填站点根地址
  - 例如：`https://lsky.example.com`
- `LskyPro Token`
  - 新版 Lsky Pro：填写 API Token
  - 旧版 Lsky Pro：填写用户设置页里显示的 32 位 token
- `图片下载目录`
  - 留空时跟随 Obsidian 附件目录
  - 也可以单独指定，例如 `attachments/clippings`
- `Delete source file after you upload file`
  - 上传成功后删除本地源文件

## 命令

### `Upload all images-All images in the current file`

上传当前笔记中引用的图片。

- 本地图片直接上传
- 远程图片先下载再上传
- 笔记中的图片链接会被替换成兰空链接
- 处理过程中会显示浮动进度通知

### `Download all images`

把当前笔记中的远程图片下载到配置的目录，并替换成当前笔记可用的本地相对链接。

### `Upload all images - All notes in vault (reuse)`

把“当前笔记上传”这套逻辑复用到整个 vault 的所有 Markdown 笔记。

## 右键菜单

本 fork 为 Markdown 笔记新增了右键菜单：

```text
Upload current note images to Lsky (auto-handle remote images)
```

会出现在：

- 文件树中 `.md` 文件的右键菜单
- 编辑器中的当前 Markdown 笔记右键菜单

## Frontmatter

可以用 frontmatter 控制单篇笔记是否启用剪贴板自动上传：

```yaml
---
image-auto-upload: true
---
```

设为 `false` 时，这篇笔记不会自动上传剪贴板图片。

## 支持的输入方式

- 剪贴板图片粘贴
- 拖拽图片文件
- 命令上传当前笔记中的本地图片
- 命令下载当前笔记中的远程图片
- 右键上传当前笔记中的图片

## 说明

- 修改插件代码后，需要重载或重启 Obsidian。
- 如果旧版 Lsky Pro 返回“管理员关闭了接口”，请到兰空后台开启 API。
- 如果远程图片站点有防盗链、Cookie 验证或其他限制，下载仍然可能失败。

## 致谢

- 上游项目：[NekoTarou/lskypro-auto-upload](https://github.com/NekoTarou/lskypro-auto-upload)
- 参考项目：[renmu123/obsidian-image-auto-upload-plugin](https://github.com/renmu123/obsidian-image-auto-upload-plugin.git)
