# F-014: Choice-control form filling

## Goal

Allow the extension to fill two common online-application choice controls after the user explicitly clicks Fill: gender radio groups and single-choice expected-work-location dropdowns.

## User scenarios

1. A gender field is rendered as a radio group whose visible option text is in an element such as `<span class="el-radio__label">男</span>`.
2. An expected-work-location field is rendered as a native or Element-style single-choice dropdown.
3. The selected profile contains a direct gender fact and one or more ordered target cities.

## In scope

- Scan native radio inputs as one field group, retain visible option labels only, and associate the group with its surrounding field label.
- Select the exact gender option after an explicit Fill click and verify its checked state.
- Recognize a supported Element-style readonly select input as a custom single-choice dropdown; open it, choose one exact visible option, and verify the control reflects the choice.
- Map an explicit expected-work-location label to the first ordered `targetCities` value in the selected personal profile.

## Out of scope

- Multi-select/cascader controls, free-form city search, date pickers, uploads, consent, submission, navigation and non-supported custom controls.
- Guessing an option when its visible text does not exactly match the profile value.

## Acceptance criteria

1. A radio group whose surrounding label is “性别” creates one descriptor with the visible options “男” and “女”, and selects the option equal to the saved gender.
2. A supported single-choice expected-work-location dropdown receives the first saved target city only when an exact visible option is present.
3. Failure to open, select or verify either choice control is reported as not filled and highlighted red; no form submission occurs.
4. Existing controls with a choice already selected are skipped.
5. Extension tests and production build pass.

## Affected contracts

- `specs/contracts/browser-extension.md`
- `web/server/schemas/form-fill.ts`

## Risks and open questions

- Component libraries vary. Unsupported custom dropdowns remain AI/manual rather than receiving simulated arbitrary clicks.
- A profile with multiple target cities uses its declared first city as the ordered first preference.
