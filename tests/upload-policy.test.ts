import test = require("node:test");
import assert = require("node:assert/strict");

import {
  getRemoteUploadCandidateKey,
  getUploadConversionPlan,
  shouldSkipRemoteUpload,
} from "../src/upload-policy.js";

test("remote image already on current lsky host should be skipped", () => {
  const result = shouldSkipRemoteUpload(
    "https://lskypro.700117.xyz:16666/2026/05/14/e155e90645d7a.jpg",
    "https://lskypro.700117.xyz:16666",
  );

  assert.equal(result, true);
});

test("remote image from other host should not be skipped", () => {
  const result = shouldSkipRemoteUpload(
    "https://am.zdmimg.com/202506/20/6854c3046052f1969.jpg_e1080.jpg",
    "https://lskypro.700117.xyz:16666",
  );

  assert.equal(result, false);
});

test("legacy api should convert webp to png before upload", () => {
  const plan = getUploadConversionPlan({
    isLegacyApi: true,
    detectedExtension: "webp",
    mime: "image/webp",
  });

  assert.equal(plan.convert, true);
  assert.equal(plan.targetExtension, "png");
  assert.equal(plan.targetMime, "image/png");
});

test("legacy api should keep jpeg as-is", () => {
  const plan = getUploadConversionPlan({
    isLegacyApi: true,
    detectedExtension: "jpg",
    mime: "image/jpeg",
  });

  assert.equal(plan.convert, false);
  assert.equal(plan.targetExtension, "jpg");
  assert.equal(plan.targetMime, "image/jpeg");
});

test("article planning should only include one unique external source", () => {
  const uploadServer = "https://lskypro.700117.xyz:16666";
  const urls = [
    "https://am.zdmimg.com/202506/20/6854c3046052f1969.jpg_e1080.jpg",
    "https://am.zdmimg.com/202506/20/6854c3046052f1969.jpg_e1080.jpg",
    "https://lskypro.700117.xyz:16666/2026/05/14/e155e90645d7a.jpg",
    "https://lskypro.700117.xyz:16666/2026/05/14/59182d95c00c9.jpg",
    "https://lskypro.700117.xyz:16666/2026/05/14/d2fcdfc19d5cc.jpg",
    "https://lskypro.700117.xyz:16666/2026/05/14/b9a1f081dfd7b.jpg",
    "https://lskypro.700117.xyz:16666/2026/05/14/61e50dbcd8582.jpg",
  ];

  const candidates = new Set(
    urls
      .map((url) => getRemoteUploadCandidateKey(url, uploadServer))
      .filter((value): value is string => !!value),
  );

  assert.deepEqual([...candidates], [
    "https://am.zdmimg.com/202506/20/6854c3046052f1969.jpg_e1080.jpg",
  ]);
});
