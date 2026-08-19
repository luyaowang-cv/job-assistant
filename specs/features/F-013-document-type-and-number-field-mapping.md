# F-013: Document type and document number field mapping

## Goal

Ensure that online-application forms that present a shared “personal document” label with two controls receive the correct candidate facts: the document-type control receives the document type, and the text control receives the complete document number.

## User scenarios

1. A form displays a document-type select and a neighbouring document-number text input under one shared label such as “个人证件”.
2. The user clicks Fill after choosing an application profile that contains both `documentType` and `documentNumber`.
3. The select is filled with the exact matching type option, while the text input is filled with the saved number rather than the words “身份证”.

## In scope

- Disambiguate the shared personal-document label by native control role.
- Keep explicit “身份证号” and equivalent labels mapped to `documentNumber`.
- Add a regression test for the paired select and text-input layout.

## Out of scope

- Custom dropdowns, radio controls, uploads, consent controls and submission.
- Guessing a document number when the candidate profile does not contain one.

## Acceptance criteria

1. A `select` with label “个人证件” maps only to `documentType`.
2. A text input with the same label maps only to `documentNumber`.
3. The pair produces two successful local plan entries when the select has one exact type option and the profile contains both facts.
4. Extension tests and production build pass.

## Affected contracts

- `specs/contracts/browser-extension.md`

## Risks and open questions

- Some sites use custom, non-native dropdowns. Those remain AI/manual handling rather than being guessed locally.
