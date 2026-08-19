# F-015: ATSX / Universe Design Formily text fields

## Goal

Allow the browser extension to safely recognize and fill a reusable class of ATSX / Universe Design Formily text fields after the user explicitly clicks Fill.

## User scenarios

1. A Formily field exposes its semantic name on the nearest `.ud-formily-item` through `data-form-field-i18n-name`, while its native input has no associated label.
2. A Formily field contains a readonly custom selector beside text fields; the selector remains outside automatic filling.

## In scope

- Derive a short field label from the closest Formily item's `data-form-field-i18n-name` or `data-form-field-name` before less-specific container text.
- Treat `.ud__native-input` text controls as existing controlled inputs and retain the current setter, event and value-verification workflow.
- Add a sanitized fixture and regression coverage for ATSX semantic fields, selected dropdowns, a single-choice dropdown, and excluded controls.

## Out of scope

- All ATSX custom selectors, including single-select, multi-select, searchable controls and preferred-city fields limited to several cities.
- Date/year/month pickers, cascaders, asynchronous option search, dynamic repeated blocks and unsupported custom controls.
- Uploads, consent checkboxes, passwords, verification codes, payments, submission, navigation and clearing an existing selection.

## Acceptance criteria

1. Fields identified only by Formily `data-form-field-i18n-name` are mapped locally for name, phone, email, identity number, school and major.
2. ATSX selectors are not used as candidates for automatic filling.
3. File inputs and consent checkboxes are skipped or remain manual; none is clicked or filled.
5. Extension tests and production build pass; web typecheck remains passing.

## Affected contracts

- `specs/contracts/browser-extension.md`

## Risks and open questions

- ATSX date pickers and selectors expose custom interaction workflows; they remain excluded until separately specified.
