# F-014 Implementation Plan

## Architecture approach

Extend the existing explicit-click scan/plan/apply pipeline with two descriptor control kinds: `radio-group` and `custom-select`. The scanner exposes only labels, option text and selected-state metadata. The local rules choose a value from the selected profile; page-side code performs the minimal option click and verifies the resulting checked/value state.

## Contract changes

- Define exact option and verification requirements for radio groups and supported custom dropdowns.
- Extend the AI form field boundary with the two control kinds so the AI fallback can reason about ordinary unsupported choice fields without receiving page values.

## Implementation sequence

1. Define F-014 contracts and testable acceptance criteria.
2. Add role-aware local mapping and target-city value selection.
3. Extend page scanning and controlled application for radio groups and Element-style dropdowns.
4. Add fixtures/regression coverage, then run tests, build and typecheck.

## Risks and mitigations

- Dynamic option panels can render after a click: wait for two browser frames, require one exact visible option, then verify state.
- Radio inputs can be visually hidden by component CSS: evaluate visibility from their visible label/container rather than the native input rectangle alone.

## Verification strategy

- Unit-test gender radio and target-city plan selection.
- Manually verify with the fixture and the target online-application page.
- Run extension tests/build and web typecheck.
