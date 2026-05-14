# Obsidian LskyPro Auto Upload Plugin

An Obsidian plugin for uploading images to [Lsky Pro](https://github.com/lsky-org/lsky-pro). This fork keeps the original clipboard and drag/drop workflow, and adds a more maintainable implementation for mixed local/remote image handling.

## What This Fork Adds

- Compatibility with older Lsky Pro deployments that use:
  - `POST /api/upload`
  - `token: <token>` header
  - `image` form field
- Compatibility with newer Lsky Pro deployments that use:
  - `POST /api/v1/upload`
  - `Authorization: Bearer <token>`
  - `file` form field
- Configurable download folder for remote images
  - Leave it empty to follow Obsidian's attachment folder setting
- `Download all images` now replaces remote links with note-relative local links
- File and editor context-menu action:
  - `上传当前文件图片到兰空（自动处理远程图）`
- When uploading the current note:
  - remote images are downloaded first
  - then uploaded to Lsky
  - then links in the note are replaced with Lsky URLs
- Single floating progress notice during current-note upload
  - shows total, current progress, success count, failure count, current file, and last error

## Install

### From source

```bash
npm install
npm run build
```

Copy the generated plugin files into:

```text
<your-vault>/.obsidian/plugins/lskypro-auto-upload
```

Then reload Obsidian.

## Configuration

Open:

```text
Settings -> Community plugins -> Image To Lskypro
```

Important settings:

- `LskyPro 域名`
  - only fill the site base URL
  - example: `https://lsky.example.com`
- `LskyPro Token`
  - for new Lsky Pro: fill API token
  - for old Lsky Pro: fill the 32-character token from the user settings page
- `图片下载目录`
  - leave empty to follow Obsidian attachment folder
  - or set a dedicated folder such as `attachments/clippings`
- `Delete source file after you upload file`
  - deletes local source files after upload succeeds

## Commands

### Upload all images-All images in the current file

Uploads images referenced in the current note.

- Local images are uploaded directly
- Remote images are downloaded first, then uploaded
- Links are replaced with Lsky URLs
- A floating progress notice is shown during processing

### Download all images

Downloads remote images referenced in the current note into the configured download folder, then replaces the note links with local relative links.

### Upload all images - All notes in vault (reuse)

Runs the current-note upload logic across all Markdown notes in the vault.

## Context Menu

This fork adds a context-menu entry for Markdown notes:

```text
上传当前文件图片到兰空（自动处理远程图）
```

It appears in:

- file explorer context menu for `.md` files
- editor context menu for the current Markdown note

## Frontmatter

You can control clipboard auto upload per note:

```yaml
---
image-auto-upload: true
---
```

Set it to `false` to disable auto upload for that note.

## Supported Input

- Clipboard image paste
- Drag and drop image files
- Upload local note images by command
- Download remote note images by command
- Upload current note images from the context menu

## Notes

- After changing plugin code, reload or restart Obsidian.
- If your old Lsky Pro instance returns `管理员关闭了接口`, enable API access in the Lsky Pro admin panel.
- If remote images are protected by cookies or anti-hotlink rules, download may still fail depending on the source site.

## Credits

- Original project: [NekoTarou/lskypro-auto-upload](https://github.com/NekoTarou/lskypro-auto-upload)
- Based on: [renmu123/obsidian-image-auto-upload-plugin](https://github.com/renmu123/obsidian-image-auto-upload-plugin.git)
