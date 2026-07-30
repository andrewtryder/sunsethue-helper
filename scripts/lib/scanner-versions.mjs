/**
 * Pinned secret-scanner versions for the public-release audit.
 *
 * Local CLIs must match `version`. CI pins the same release via the image
 * digest so Dependabot and reviewers can see the intended tag in the comment.
 */
export const SCANNERS = {
  gitleaks: {
    version: "8.30.1",
    image:
      "ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f", // v8.30.1
  },
  trufflehog: {
    version: "3.96.0",
    image:
      "ghcr.io/trufflesecurity/trufflehog@sha256:aa821cf4ace8861c7d096d83818cdf7bb9719028a52d37a52eaad44086a52577", // 3.96.0
  },
};
