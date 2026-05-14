import test from "node:test";
import assert from "node:assert/strict";

import { resolveImageFileMetadata } from "../src/image-file.js";

test("mismatched jpg file name is normalized to webp when content is webp", async () => {
  const webpHeader = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x44, 0x88, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);

  const metadata = await resolveImageFileMetadata("broken-name.jpg", webpHeader);

  assert.ok(metadata);
  assert.equal(metadata.detectedExtension, "webp");
  assert.equal(metadata.mime, "image/webp");
  assert.equal(metadata.fileName, "broken-name.webp");
  assert.equal(metadata.extensionChanged, true);
});

test("svg content without extension is normalized to svg", async () => {
  const svgBytes = new TextEncoder().encode(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`);

  const metadata = await resolveImageFileMetadata("clipped-image", svgBytes);

  assert.ok(metadata);
  assert.equal(metadata.detectedExtension, "svg");
  assert.equal(metadata.mime, "image/svg+xml");
  assert.equal(metadata.fileName, "clipped-image.svg");
});
