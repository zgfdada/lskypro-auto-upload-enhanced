export interface UploadCleanupRuleInput {
  uploadSucceeded: boolean;
  deleteSource: boolean;
  cleanupOnFailure: boolean;
}

export function shouldDeleteUploadedSource(input: UploadCleanupRuleInput) {
  if (input.uploadSucceeded) {
    return input.deleteSource;
  }
  return input.cleanupOnFailure;
}
