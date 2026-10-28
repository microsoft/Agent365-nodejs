# How to Build Microsoft Agent 365 Node.js SDK

Use Node.js >=18 and **pnpm 10.20.0** (declared by `packageManager`). TypeScript is a workspace dependency; no global installation is needed.

## Install and develop

Run from the repository root:

```shell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

`pnpm build` builds CJS and ESM output for six maintained packages:

- `@microsoft/agents-a365-runtime`
- `@microsoft/agents-a365-notifications`
- `@microsoft/agents-a365-tooling`
- `@microsoft/agents-a365-tooling-extensions-claude`
- `@microsoft/agents-a365-tooling-extensions-langchain`
- `@microsoft/agents-a365-tooling-extensions-openai`

Observability implementations, dedicated tests, and package builds are retired. Application telemetry belongs to the [Microsoft OpenTelemetry distro](docs/observability-migration.md); it is not installed into the remaining SDK packages.

For targeted development:

```shell
pnpm --filter @microsoft/agents-a365-runtime build
pnpm build:watch
pnpm test:watch
pnpm test:coverage
pnpm lint:fix
pnpm clean
```

`pnpm clean` removes workspace build output, not dependencies. Tests live centrally in `tests`; see [running tests](tests/RUNNING_TESTS.md). Dependency versions are maintained in pnpm catalogs, and `pnpm-lock.yaml` is the lockfile. Do not generate npm lockfiles.

## Pack verified artifacts

Use the **root script**, not the built-in `pnpm pack` command or wildcard workspace packing:

```shell
pnpm run pack
```

This creates a fresh `artifacts/packages-<unique-id>` directory, cleans and rebuilds maintained packages, copies license/changelog files, packs all six explicit workspaces, inspects their archives, and writes a SHA-256 `packages.json` receipt. It rejects retired directories/dependencies/code, duplicate or missing packages, and missing entry points.

For a named output and independent inspection:

```shell
pnpm run pack artifacts/release-candidate
node packPackages.js --verify artifacts/release-candidate
```

On Windows, use `artifacts\release-candidate`. The destination must not already exist. Reviewed stale generated output under retired package directories must be removed first. Never collect old `packages/*.tgz` or reuse cached tarballs as a release.

Samples are maintained in [Agent365-Samples](https://github.com/microsoft/Agent365-Samples), not this workspace. Install the exact verified tarball(s) needed by your sample; published workspace dependencies may also need corresponding local overrides in that application.

## Troubleshooting and releasing

For missing dependencies, restore with `pnpm install --frozen-lockfile`; for stale compilation output, run `pnpm clean` then `pnpm build`. Check Node and pnpm versions before changing configuration. Do not clear shared caches as a routine repair.

See [release instructions](HOW_TO_RELEASE.md) and the [owner-operated retirement checklist](docs/observability-migration.md#owner-operated-npm-retirement-checklist). Only authorized owners publish receipt-listed artifacts. Repository checks cannot stop external pipelines or old branches from releasing retired packages.

## Resources

- [README](README.md)
- [Architecture](docs/design.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
