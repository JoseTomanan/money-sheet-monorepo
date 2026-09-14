# ADR-0015: Deploy GAS to personal and template projects after merge

**Status:** Accepted

## Context

The repository maintains the same Google Apps Script backend in two bound script
projects: the owner's personal spreadsheet and the published spreadsheet template.
The previous workflow targeted only one committed script ID and one hardcoded web-app
deployment ID. It also ran for every push to `main` and allowed manual dispatch, so a
deployment did not necessarily correspond to a reviewed pull-request merge.

Updating a script project's source with `clasp push` is not enough to update its stable
`/exec` URL. Each project also needs its existing web-app deployment redeployed to a
new version. Google Apps Script cannot update two projects atomically.

## Decision

When a pull request targeting `main` is closed and was merged, and its changed paths
include `clasp/**` or the GAS deployment workflow, GitHub Actions builds and deploys
the merged commit to both maintained destinations:

- `gas-personal`
- `gas-template`

Each name is a GitHub environment containing `CLASP_SCRIPT_ID` and
`CLASP_DEPLOYMENT_ID` variables. Both jobs use the shared `CLASP_CREDENTIALS`
repository secret. The workflow rewrites `.clasp.json` only on its runner, pushes the
canonical generated `dist/`, redeploys the existing deployment ID so the URL remains
stable, and smoke-tests the unauthenticated `getConfig` action.

Direct pushes to `main`, unmerged pull requests, and manual dispatch do not deploy.
Separate workflow runs are serialized, while the two destinations within one run are
attempted independently. A failure leaves the workflow red for an explicit failed-job
rerun; the successful destination is not rolled back.

## Consequences

- Personal and future template copies receive the same reviewed GAS source.
- Both existing `/exec` URLs advance on each qualifying merge.
- The clasp credential's Google account must be able to edit both bound projects.
- GitHub environment variables become required deployment configuration.
- A transient or configuration failure can leave the two destinations on different
  versions until the failed job is rerun successfully.

## Considered options

- **Deploy on every push to `main`:** rejected because direct pushes would deploy.
- **Keep manual dispatch:** rejected so every deployment remains tied to a merged PR.
- **Push the template without redeploying it:** rejected because the maintained
  template web-app URL is also a supported destination.
- **Rollback the successful target when its peer fails:** rejected because GAS has no
  atomic multi-project deployment and compensating redeployments add another failure
  path.
