# F-013 Implementation Plan

## Architecture approach

Use the safe form descriptor’s native `controlType` to disambiguate a shared “personal document” label before the general rule lookup. This keeps the mapping deterministic and does not inspect or retain any existing page value.

## Contract changes

- Define the paired-control mapping in the browser-extension contract.

## Implementation sequence

1. Add the paired-control behavior to the contract and feature artifacts.
2. Add a role-aware document rule to the local fill-rule module.
3. Add paired-control regression coverage.
4. Run extension tests and build.

## Risks and mitigations

- A text field may contain a misleading generic label: only the explicit shared personal-document label receives this role-aware exception.
- A select option may not exactly match the saved type: existing exact-option guard leaves it for AI/manual handling.

## Verification strategy

- Confirm the plan targets `documentType` for the select and `documentNumber` for the text input.
- Run `pnpm test` and `pnpm build` in `extension`.
