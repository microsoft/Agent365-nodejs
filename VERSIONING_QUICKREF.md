# Semantic Versioning Quick Reference

## 🎯 What You Need to Know

### Version Format
```
1.0.0-preview.127
│ │ │         │
│ │ │         └── Commit count (auto-incremented)
│ │ └────────────── PATCH version
│ └──────────────── MINOR version
└────────────────── MAJOR version
```

### ✅ What's Automated
- ✨ Version calculation based on git commits
- ✨ All package.json files updated automatically
- ✨ Internal dependencies synchronized
- ✨ Pre-release tagging

### 🚫 What's Manual
- Updating MAJOR/MINOR/PATCH in `version.json`
- Creating release branches
- Creating version tags

---

## 📝 Common Tasks

### Check Current Version
```bash
node setVersion.js
# Look for output: "Setting package version to: X.X.X-preview.XXX"
```

### Bump Major Version (Breaking Changes)
Edit `version.json`:
```json
{
  "version": "2.0.0-preview.{height}"
}
```

### Bump Minor Version (New Features)
Edit `version.json`:
```json
{
  "version": "1.1.0-preview.{height}"
}
```

### Bump Patch Version (Bug Fixes)
Edit `version.json`:
```json
{
  "version": "1.0.1-preview.{height}"
}
```

### Create a Stable Release
```bash
# 1. Create release branch
git checkout -b release/v1.0

# 2. Tag the release
git tag v1.0.0

# 3. Push branch and tag
git push origin release/v1.0 --tags

# Version will be: 1.0.0 (no -preview suffix)
```

---

## 🔍 Understanding the Files

### `version.json`
- **Location**: Root of repository
- **Purpose**: Configures base version and release branches
- **Edit When**: You want to change MAJOR/MINOR/PATCH

### `setVersion.js`
- **Location**: Root of repository
- **Purpose**: Calculates and applies versions
- **Edit When**: Rarely (only if logic needs changes)

### `package.json` (root)
- **Updated By**: `setVersion.js` automatically
- **Contains**: `nerdbank-gitversioning` dependency

### `packages/*/package.json`
- **Updated By**: `setVersion.js` automatically
- **Version**: Always matches root version
- **Dependencies**: Internal `@microsoft/agents-a365-*` deps auto-synced

---

## 🔄 CI/CD Pipeline Flow

```
┌─────────────────────────────────────────────────┐
│ 1. Checkout (with full git history)            │
│    fetch-depth: 0                               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 2. Install dependencies                         │
│    npm ci                                       │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 3. Lint & Build                                 │
│    npm run lint && npm run build                │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 4. Set Version (NEW!)                           │
│    node setVersion.js                           │
│    • Reads git history                          │
│    • Calculates version                         │
│    • Updates all package.json files             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ 5. Test & Package                               │
│    pnpm test && pnpm run pack                   │
└─────────────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Problem: "Cannot find module 'nerdbank-gitversioning'"
**Solution**: 
```bash
npm install
```

### Problem: Version shows as "0.0.0" in CI
**Solution**: Ensure checkout has `fetch-depth: 0`
```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # ← This is required!
```

### Problem: Packages have different versions
**Solution**: Run `node setVersion.js` - it will synchronize all packages

### Problem: Internal dependencies not updated
**Solution**: Verify package names in dependencies start with `@microsoft/agents-a365`

---

## 📊 Version Comparison

| Scenario | Old Version | New Version |
|----------|-------------|-------------|
| First commit | 2025.11.02-preview.1 | 1.0.0-preview.1 |
| After 100 commits | 2025.11.03-preview.1 | 1.0.0-preview.100 |
| Release branch | 2025.11.03-preview.5 | 1.0.0 |
| After release | 2025.11.04-preview.1 | 1.0.1-preview.101 |

---

## 🎓 Learn More

- **Semantic Versioning**: https://semver.org/
- **Nerdbank.GitVersioning**: https://github.com/dotnet/Nerdbank.GitVersioning
- **Our Implementation**: See `VERSIONING_MIGRATION.md`

---

## 💡 Pro Tips

1. **Commit messages matter**: Each commit increases the version height
2. **Clean history**: Squash unnecessary commits to keep version numbers meaningful
3. **Release branches**: Use `release/v*` pattern for stable releases
4. **Pre-release testing**: `-preview` suffix indicates development versions
5. **Monorepo benefit**: All packages stay in sync automatically

---

**Last Updated**: November 2, 2025  
**Questions?** Contact the DevOps team or check `VERSIONING_MIGRATION.md`
