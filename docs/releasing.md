# Releasing

Releases are one button: **Actions → release → Run workflow**. Each run takes the highest `vMAJOR.MINOR` tag, bumps the minor (or the major, resetting the minor, when **Bump Major Version** is checked), tests, builds one VSIX per platform with its own CLI, publishes to the VS Code Marketplace, then tags `vX.Y` and creates the GitHub release. The first run is `v0.1`.

The version lives in tags only. `vscode/package.json` and `Cargo.toml` are stamped with `X.Y.0` at build time and never committed. The Marketplace changelog is generated from commit subjects between tags.

Publishing signs in with Microsoft Entra ID through GitHub's OIDC token. No secret is stored.

## One-time setup

### 1. Marketplace publisher

The publisher ID must equal `publisher` in `vscode/package.json` (`pmghartman`). Manage it at <https://marketplace.visualstudio.com/manage>.

### 2. User-assigned managed identity

Microsoft's guide uses a user-assigned managed identity; this follows it. The setup run reads the identity's ID from Azure DevOps' `connectionData`, because an identity signed in from GitHub has no Azure DevOps profile for Microsoft's `profiles/me` lookup (`VSS011031`).

1. Sign in at <https://portal.azure.com> with the same Microsoft account as the publisher. A managed identity lives in a subscription. Without one, create a free Azure subscription. The identity itself costs nothing. If the free trial ends, upgrade it to pay-as-you-go to keep the identity; nothing here is billed.
2. **Managed Identities → Create.**
   - Subscription: yours. Resource group: new, `hesperus-release`. Region: any.
   - Name: `hesperus-release`. **Review + create → Create.**
3. Open the identity. From **Overview**, copy the **Client ID**. Copy the **Tenant ID** from **Microsoft Entra ID → Overview**.
4. **Settings → Federated credentials → Add credential.**
   - Scenario: **GitHub Actions deploying Azure resources**
   - Organization: `pmghartman`, Repository: `hesperus`
   - Entity: **Environment**, name: `marketplace`
   - Credential name: `github-marketplace`
5. Microsoft's guide also gives the identity **Reader**. On the `hesperus-release` resource group: **Access control (IAM) → Add role assignment → Reader →** members: **Managed identity →** `hesperus-release`.

An app registration from an earlier attempt is no longer used and can be deleted.

### 3. GitHub repository

1. **Settings → Environments → New environment** named `marketplace`. Optionally add yourself as a required reviewer, or restrict it to `main`.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable:**
   - `AZURE_CLIENT_ID`: the managed identity's client ID
   - `AZURE_TENANT_ID`: the tenant ID

### 4. Add the identity to the publisher

1. Run **Actions → release → Run workflow** with **Setup only** checked. It releases nothing. Its summary prints an ID, then its **may publish** step fails, because the identity is not a member yet.
2. At <https://marketplace.visualstudio.com/manage>, open the publisher, **Members → Add**, paste the ID, role **Contributor**.
3. Run **Setup only** again. **may publish** passes when the identity can publish.

### 5. Release

**Actions → release → Run workflow.** Check **Bump Major Version** for a major release.

## When it fails

- **Publish fails, nothing tagged.** The next run reuses the same version.
- **`AADSTS700213` / no matching federated identity.** The credential's environment must be exactly `marketplace`, and the repository `pmghartman/hesperus`.
- **`VSS011031: There is no profile`.** Something called `profiles/me`; the setup run uses `connectionData` instead.
- **401 from the Marketplace.** The identity is not a member of the publisher, or not a Contributor.
