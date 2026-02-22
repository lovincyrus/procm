---
name: release
description: Release a new version of procm with prebuilt binaries and Homebrew formula update
user_invocable: true
---

# Release procm

Release a new version of procm. Accepts an optional version argument (e.g., `/release 0.0.3`). If no version is provided, ask the user what version to release.

## Steps

### 1. Bump version

- Update `version` in `package.json`
- Update the version string in the `--version` flag handler at the top of `index.ts`

### 2. Commit and tag

- Commit the version bump using the `/commit` skill
- Create a git tag `v<version>` and push both the commit and tag to origin:
  ```sh
  git tag v<version> && git push origin main v<version>
  ```

### 3. Wait for CI

- Watch the GitHub Actions release workflow until it completes:
  ```sh
  gh run list --repo lovincyrus/procm --limit 1 --json databaseId,status
  gh run watch <run_id> --repo lovincyrus/procm
  ```
- If the workflow fails, investigate and fix before continuing.

### 4. Update Homebrew formula

- Download the release tarballs and compute sha256 checksums:
  ```sh
  gh release download v<version> --repo lovincyrus/procm --dir /tmp/procm-release --clobber
  shasum -a 256 /tmp/procm-release/*.tar.gz
  ```
- Update `/Users/pebble/projects/homebrew-tap/Formula/procm.rb`:
  - Set `version` to the new version
  - Update both `url` fields to point to `v<version>`
  - Update both `sha256` fields with the new checksums
- Commit and push the formula:
  ```sh
  cd /Users/pebble/projects/homebrew-tap
  git add Formula/procm.rb
  git commit -m "Update procm to v<version>"
  git push origin main
  ```

### 5. Verify

- Confirm the release exists: `gh release view v<version> --repo lovincyrus/procm`
- Tell the user they can test with: `brew upgrade lovincyrus/tap/procm`
