# Releasing

Releases are one button: **Actions → release → Run workflow**. Each run takes the highest `vMAJOR.MINOR` tag, bumps the minor (or the major, resetting the minor, when **Bump Major Version** is checked), tests, builds one VSIX per platform with its own CLI, publishes to the VS Code Marketplace, then tags `vX.Y` and creates the GitHub release. The first run is `v0.1`.

The version lives in tags only. `vscode/package.json` and `Cargo.toml` are stamped with `X.Y.0` at build time and never committed. The Marketplace changelog is generated from commit subjects between tags.

Publishing signs in with Microsoft Entra ID through GitHub's OIDC token. No secret is stored.

## One-time setup

### 1. Marketplace publisher

The publisher ID must equal `publisher` in `vscode/package.json` (`pmghartman`). Manage it at <https://marketplace.visualstudio.com/manage>.

### 2. Entra app registration

1. Sign in at <https://portal.azure.com> with the same Microsoft account as the publisher. If it says you have no directory, sign up for a free Azure account first. It creates one. No subscription or paid resource is used.
2. **Microsoft Entra ID → App registrations → New registration.** Name it `hesperus-release`, keep **Single tenant**, leave the redirect URI empty, **Register**.
3. On its overview, copy the **Application (client) ID** and **Directory (tenant) ID**.
4. **Certificates & secrets → Federated credentials → Add credential.**
   - Scenario: **GitHub Actions deploying Azure resources**
   - Organization: `pmghartman`, Repository: `hesperus`
   - Entity type: **Environment**, name: `marketplace`
   - Credential name: `github-marketplace`

### 3. GitHub repository

1. **Settings → Environments → New environment** named `marketplace`. Optionally add yourself as a required reviewer, or restrict it to `main`.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   - `AZURE_CLIENT_ID`: the application (client) ID
   - `AZURE_TENANT_ID`: the directory (tenant) ID

### 4. Add the identity to the publisher

1. With `.github/workflows/release.yml` on `main`, run **Actions → release → Run workflow** with **Setup only** checked. It releases nothing and prints an ID in the run summary.
2. At <https://marketplace.visualstudio.com/manage>, open the publisher, **Members → Add**, paste the ID, role **Contributor**.

### 5. Release

**Actions → release → Run workflow.** Check **Bump Major Version** for a major release.

## When it fails

- **Publish fails, nothing tagged.** The next run reuses the same version.
- **`AADSTS700213` / no matching federated identity.** The credential's environment must be exactly `marketplace`, and the repository `pmghartman/hesperus`.
- **401 from the Marketplace.** The identity is not a member of the publisher, or not a Contributor.
