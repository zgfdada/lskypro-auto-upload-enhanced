import test = require("node:test");
import assert = require("node:assert/strict");

import { shouldDeleteUploadedSource } from "../src/upload-cleanup.js";

test("failed remote-temp image should be deleted even when deleteSource is disabled", () => {
  const result = shouldDeleteUploadedSource({
    uploadSucceeded: false,
    deleteSource: false,
    cleanupOnFailure: true,
  });

  assert.equal(result, true);
});

test("failed normal local image should not be deleted", () => {
  const result = shouldDeleteUploadedSource({
    uploadSucceeded: false,
    deleteSource: true,
    cleanupOnFailure: false,
  });

  assert.equal(result, false);
});

test("successful upload still follows deleteSource setting", () => {
  assert.equal(
    shouldDeleteUploadedSource({
      uploadSucceeded: true,
      deleteSource: true,
      cleanupOnFailure: true,
    }),
    true,
  );
  assert.equal(
    shouldDeleteUploadedSource({
      uploadSucceeded: true,
      deleteSource: false,
      cleanupOnFailure: true,
    }),
    false,
  );
});
