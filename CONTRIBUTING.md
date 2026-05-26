# Contributing

Issues and pull requests are welcome.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

`npm test` runs the build automatically via the `pretest` script. Use
`npm run build:watch` while developing if you want incremental TypeScript
compilation.

## Code style

- ESLint and Prettier are enforced in CI. Run `npm run lint` and
  `npm run format:check` (or `npm run format` to auto-fix) before pushing.
- **Do not use `eslint-disable` comments.** If a rule is firing on legitimate
  code, fix the rule or the code structure — don't suppress it.

## Releasing

This package is published to npm via two GitHub Actions workflows.
Authentication uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
(OIDC), so there is no `NPM_TOKEN` secret to manage.

### Release flow

To cut a release:

1. Go to the [**Release** workflow](../../actions/workflows/release.yml) in
   GitHub Actions and click **Run workflow**.
2. Pick the semver bump (`patch`, `minor`, or `major`) and run.
3. The workflow opens a PR titled `chore(release): vX.Y.Z` containing the
   version bump to `package.json` and `package-lock.json`.
4. Review and merge the PR.
5. On merge, the **Publish** workflow fires automatically. It detects that the
   version in `package.json` is new (not yet on the npm registry), runs
   `npm publish`, and pushes a `vX.Y.Z` git tag as a record of the release.

That's it. No manual `npm version`, no manual `npm publish`, no tokens to
rotate.

### How publish-on-merge knows when to publish

The `Publish` workflow runs on every push to `main`, but only actually publishes
when the version in `package.json` does not yet exist on the npm registry. It
checks via:

```bash
npm view "$PKG@$VERSION" version
```

If that returns a value, the version is already published and the workflow
exits without doing anything. If empty, it proceeds to publish. This makes the
workflow idempotent — re-running it on the same commit is a no-op.

### One-time setup

These steps only need to be done once per repository / package and are
documented here for posterity.

#### 1. Configure the npm Trusted Publisher

On npmjs.com, go to the package settings for
`@synapsestudios/eslint-plugin-data-boundaries` → **Trusted Publishers** →
**Add**:

- **Publisher**: GitHub Actions
- **Organization or user**: `synapsestudios`
- **Repository**: `eslint-plugin-data-boundaries`
- **Workflow filename**: `publish.yml`
- **Environment**: leave blank
- **Allowed actions**: check **Allow `npm publish`**

#### 2. Allow GitHub Actions to open PRs

In the GitHub repository: **Settings** → **Actions** → **General** →
**Workflow permissions** → check **"Allow GitHub Actions to create and approve
pull requests"**. Without this the Release workflow cannot open its PR.

### Troubleshooting

**Publish workflow ran but didn't publish.** Check the "Check if version is
already published" step in the workflow logs. If the local `package.json`
version is already on npm, the workflow correctly skips. To force a publish,
bump the version (open a new release PR).

**`npm publish` fails with an authentication error.** The Trusted Publisher
configuration on npmjs.com does not match the repository, workflow filename,
or environment exactly. Re-check the values in the one-time setup section
above.

**Release workflow fails when opening the PR.** The repository setting "Allow
GitHub Actions to create and approve pull requests" is not enabled (see
one-time setup).

**I need to release a version manually.** Bump the version in `package.json`
on a branch, open a PR, and merge it. The publish workflow will pick up the
version change just like a release PR. The Release workflow is convenience,
not a requirement.
