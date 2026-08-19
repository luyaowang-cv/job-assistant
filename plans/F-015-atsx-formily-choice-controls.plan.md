# F-015 Implementation Plan

## Architecture approach

Extend the existing explicit-click scan/plan/apply pipeline rather than introducing a site adapter. The scanner derives semantic labels from bounded Formily metadata. The local rule module remains DOM-free and assigns only already supported candidate facts to normal editable text inputs. Custom selectors and date pickers remain manual.

## Contract changes

- Define Formily metadata label precedence and explicit exclusion of ATSX custom selectors in the browser-extension contract.

## Implementation sequence

1. Add F-015 specification, contract, plan and tasks.
2. Extend scanner metadata labels for normal editable text inputs.
3. Add an anonymized fixture and regression tests, then run extension test/build and web typecheck.

## Risks and mitigations

- Formily containers can include both editable text controls and custom selectors: metadata is derived locally per control and custom selectors remain outside the fill candidate set.

## Verification strategy

- Unit-test local mapping using Formily metadata passed as descriptors and ensure custom selectors remain manual.
- Manually validate the fixture's scan and controlled fill flow without submitting.
- Run `corepack pnpm test` and `corepack pnpm build` in `extension`, then `corepack pnpm typecheck` in `web`.
