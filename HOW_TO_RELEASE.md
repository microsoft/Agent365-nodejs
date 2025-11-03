# How to Create an Official Release

This guide describes the process for creating an official release of the Agent365 SDK for Node.js using our semantic versioning system powered by Nerdbank.GitVersioning.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Release Types](#release-types)
- [Release Process](#release-process)
- [Post-Release Tasks](#post-release-tasks)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before creating a release, ensure you have:

- ✅ Write access to the repository
- ✅ All features/fixes for the release merged to `main`
- ✅ All CI/CD checks passing on `main`
- ✅ Release notes prepared
- ✅ Git configured with your credentials
- ✅ NPM publishing credentials (if publishing to NPM)

---

## Release Types

### 🔴 Major Release (Breaking Changes)
**Example**: `1.0.0` → `2.0.0`

Use when:
- Breaking API changes
- Removing deprecated features
- Major architecture changes
- Incompatible with previous versions

### 🟡 Minor Release (New Features)
**Example**: `1.0.0` → `1.1.0`

Use when:
- Adding new features (backwards compatible)
- Deprecating features (but not removing)
- Significant enhancements
- New capabilities

### 🟢 Patch Release (Bug Fixes)
**Example**: `1.0.0` → `1.0.1`

Use when:
- Bug fixes
- Security patches
- Documentation updates
- Performance improvements (minor)

---

## Release Process

### Step 1: Update Version Configuration

**For Major Release (e.g., 1.x.x → 2.0.0):**
```bash
# Edit version.json
# Change: "version": "1.x.x-preview.{height}"
# To:     "version": "2.0.0-preview.{height}"
```

**For Minor Release (e.g., 1.0.x → 1.1.0):**
```bash
# Edit version.json
# Change: "version": "1.0.x-preview.{height}"
# To:     "version": "1.1.0-preview.{height}"
```

**For Patch Release (e.g., 1.0.0 → 1.0.1):**
```bash
# Edit version.json
# Change: "version": "1.0.0-preview.{height}"
# To:     "version": "1.0.1-preview.{height}"
```

**Example `version.json` for version 1.1.0:**
```json
{
  "$schema": "https://raw.githubusercontent.com/dotnet/Nerdbank.GitVersioning/main/src/NerdBank.GitVersioning/version.schema.json",
  "version": "1.1.0-preview.{height}",
  "publicReleaseRefSpec": [
    "^refs/heads/main$",
    "^refs/heads/master$",
    "^refs/heads/release/v\\d+\\.\\d+",
    "^refs/tags/v\\d+\\.\\d+"
  ],
  "cloudBuild": {
    "buildNumber": {
      "enabled": true
    }
  }
}
```

### Step 2: Commit Version Bump

```bash
# Commit the version.json change
git add version.json
git commit -m "Bump version to 1.1.0 for release"
git push origin main
```

### Step 3: Create Release Branch

```bash
# Create a release branch following the naming convention
git checkout -b release/v1.1

# Push the release branch
git push origin release/v1.1
```

**Branch Naming Convention:**
- Use format: `release/v{MAJOR}.{MINOR}`
- Examples: `release/v1.0`, `release/v1.1`, `release/v2.0`
- Do NOT include patch version in branch name

### Step 4: Create Release Tag

```bash
# Create an annotated tag with the full version
git tag -a v1.1.0 -m "Release version 1.1.0"

# Push the tag
git push origin v1.1.0
```

**Tag Naming Convention:**
- Use format: `v{MAJOR}.{MINOR}.{PATCH}`
- Examples: `v1.0.0`, `v1.1.0`, `v2.0.0`
- Always include the `v` prefix

### Step 5: Verify Version Generation

The version will automatically be calculated as a stable release (without `-preview` suffix) because:
1. The branch matches `release/v*` pattern
2. The tag matches `v*` pattern

```bash
# Clone fresh to test
git clone https://github.com/microsoft/Agent365.git test-release
cd test-release/nodejs
git checkout v1.1.0

# Install and run version script
npm install
node setVersion.js

# Expected output:
# Setting package version to: 1.1.0
```

### Step 6: Build and Test Release

```bash
# On the release branch/tag
npm ci
npm run lint
npm run build
npm test

# Verify all packages have correct version
grep -r "\"version\"" packages/*/package.json
# Should show: "version": "1.1.0" for all packages
```

### Step 7: Create GitHub Release

1. Go to: https://github.com/microsoft/Agent365/releases/new
2. Choose the tag: `v1.1.0`
3. Set release title: `Agent365 SDK for Node.js v1.1.0`
4. Add release notes (see template below)
5. Attach build artifacts (if any)
6. Check "Set as the latest release" (if applicable)
7. Click "Publish release"

**Release Notes Template:**
```markdown
# Agent365 SDK for Node.js v1.1.0

## 🎉 What's New

- Feature 1: Description
- Feature 2: Description

## 🐛 Bug Fixes

- Fix 1: Description
- Fix 2: Description

## 💥 Breaking Changes

_None_ (or list breaking changes)

## 📦 Packages

All packages in this release:
- @microsoft/agents-a365-notifications@1.1.0
- @microsoft/agents-a365-runtime@1.1.0
- @microsoft/agents-a365-tooling@1.1.0
- @microsoft/agents-a365-observability@1.1.0
- @microsoft/agents-a365-tooling-extensions-claude@1.1.0
- @microsoft/agents-a365-tooling-extensions-langchain@1.1.0
- @microsoft/agents-a365-tooling-extensions-openai@1.1.0

## 📚 Documentation

- [Getting Started](../README.md)
- [Changelog](../CHANGELOG.md)
- [Migration Guide](../VERSIONING_MIGRATION.md)

## Installation

```bash
npm install @microsoft/agents-a365-runtime@1.1.0
```

**Full Changelog**: https://github.com/microsoft/Agent365/compare/v1.0.0...v1.1.0
```

### Step 8: Publish to NPM (Optional)

If publishing to NPM registry:

```bash
# Ensure you're logged in
npm login

# Publish all packages (from release branch/tag)
npm publish --workspaces --access public

# Or publish individually
cd packages/agents-a365-runtime
npm publish --access public
```

**Note**: Update the CI workflow to enable automatic NPM publishing:
```yaml
- name: Publish to NPM
  if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
  run: npm publish --workspaces --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Post-Release Tasks

### 1. Update CHANGELOG.md

```bash
# Switch back to main
git checkout main

# Update CHANGELOG.md with release notes
git add CHANGELOG.md
git commit -m "Update CHANGELOG for v1.1.0 release"
git push origin main
```

### 2. Announce the Release

- Post announcement in team channels
- Update documentation sites
- Notify dependent projects
- Social media announcements (if applicable)

### 3. Monitor Release

- Check NPM download stats
- Monitor GitHub issues for bugs
- Watch CI/CD pipelines
- Review user feedback

### 4. Prepare for Next Release

```bash
# Update version.json for next development cycle
# For example, if you just released 1.1.0, prepare for 1.2.0:
```

Edit `version.json`:
```json
{
  "version": "1.2.0-preview.{height}"
}
```

```bash
git add version.json
git commit -m "Prepare for v1.2.0 development"
git push origin main
```

---

## Release Checklist

Use this checklist for each release:

- [ ] All PRs merged to `main`
- [ ] All CI checks passing
- [ ] Release notes drafted
- [ ] `version.json` updated with new base version
- [ ] Version bump committed to `main`
- [ ] Release branch created (`release/v{MAJOR}.{MINOR}`)
- [ ] Release tag created (`v{MAJOR}.{MINOR}.{PATCH}`)
- [ ] Tag pushed to GitHub
- [ ] Build successful on release branch
- [ ] All packages have correct version number
- [ ] GitHub release created with notes
- [ ] Packages published to NPM (if applicable)
- [ ] CHANGELOG.md updated
- [ ] Release announced to team
- [ ] `version.json` prepared for next version
- [ ] Documentation updated

---

## Troubleshooting

### Issue: Tag doesn't trigger stable version

**Symptoms**: Version shows `1.1.0-preview.X` instead of `1.1.0`

**Solution**: 
- Verify tag name matches pattern: `v{MAJOR}.{MINOR}.{PATCH}`
- Check `publicReleaseRefSpec` in `version.json`
- Ensure checkout includes tags: `git fetch --tags`

### Issue: Packages have different versions

**Symptoms**: Each package has a different version number

**Solution**:
```bash
# Run version script to synchronize
node setVersion.js

# Verify all packages match
find packages -name package.json -exec grep '"version"' {} \;
```

### Issue: Internal dependencies not updated

**Symptoms**: Package dependencies show old versions

**Solution**: Check that `setVersion.js` is updating dependencies:
```javascript
if (dep.startsWith('@microsoft/agents-a365')) {
  packageJson.dependencies[dep] = version
}
```

### Issue: NPM publish fails

**Symptoms**: "You cannot publish over the previously published versions"

**Solution**:
- Verify you're not trying to republish an existing version
- Check NPM for existing package: `npm view @microsoft/agents-a365-runtime versions`
- Ensure version was properly incremented

### Issue: Git push rejected

**Symptoms**: "Updates were rejected because the remote contains work"

**Solution**:
```bash
git fetch origin
git rebase origin/main
git push origin main
```

---

## Version Examples

### Example 1: Major Release (1.5.2 → 2.0.0)

```bash
# 1. Update version.json
# Change: "version": "1.5.2-preview.{height}"
# To:     "version": "2.0.0-preview.{height}"

git add version.json
git commit -m "Bump to v2.0.0 for major release"
git push origin main

# 2. Create release branch and tag
git checkout -b release/v2.0
git push origin release/v2.0

git tag -a v2.0.0 -m "Release version 2.0.0"
git push origin v2.0.0

# 3. Build and verify
npm ci && npm run build && npm test
node setVersion.js  # Should output: 2.0.0
```

### Example 2: Minor Release (1.1.0 → 1.2.0)

```bash
# 1. Update version.json
# Change: "version": "1.1.0-preview.{height}"
# To:     "version": "1.2.0-preview.{height}"

git add version.json
git commit -m "Bump to v1.2.0 for minor release"
git push origin main

# 2. Create release branch and tag
git checkout -b release/v1.2
git push origin release/v1.2

git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0
```

### Example 3: Patch Release (1.1.0 → 1.1.1)

```bash
# 1. Checkout release branch
git checkout release/v1.1

# 2. Cherry-pick bug fixes
git cherry-pick <commit-hash>

# 3. Update version.json if needed
# Change: "version": "1.1.0-preview.{height}"
# To:     "version": "1.1.1-preview.{height}"

git add version.json
git commit -m "Bump to v1.1.1 for patch release"
git push origin release/v1.1

# 4. Create tag
git tag -a v1.1.1 -m "Release version 1.1.1 - Bug fixes"
git push origin v1.1.1

# 5. Merge back to main
git checkout main
git merge release/v1.1
git push origin main
```

---

## Best Practices

### ✅ Do's

- Always test the release branch before tagging
- Write clear, detailed release notes
- Follow semantic versioning strictly
- Keep release branches for long-term support
- Document breaking changes prominently
- Coordinate with dependent teams
- Plan releases in advance

### ❌ Don'ts

- Don't skip version numbers
- Don't create releases from feature branches
- Don't forget to update CHANGELOG
- Don't publish without thorough testing
- Don't reuse deleted tags
- Don't modify published releases (create patch instead)

---

## Emergency Hotfix Process

If you need to release an urgent fix:

```bash
# 1. Create hotfix branch from release tag
git checkout -b hotfix/v1.1.1 v1.1.0

# 2. Apply the fix
# ... make changes ...

# 3. Update version.json to 1.1.1
git add version.json
git commit -m "Hotfix: Critical bug fix"

# 4. Tag and push
git tag -a v1.1.1 -m "Hotfix version 1.1.1"
git push origin hotfix/v1.1.1 --tags

# 5. Merge back to release branch and main
git checkout release/v1.1
git merge hotfix/v1.1.1
git push origin release/v1.1

git checkout main
git merge hotfix/v1.1.1
git push origin main
```

---

## Support and Questions

- **Versioning Issues**: See `VERSIONING_MIGRATION.md`
- **Quick Reference**: See `VERSIONING_QUICKREF.md`
- **Build Issues**: Contact DevOps team
- **NPM Publishing**: Contact package maintainers

---

**Document Version**: 1.0  
**Last Updated**: November 2, 2025  
**Maintained By**: DevOps Team
