# Upstream provenance

## Element Plus Nuxt Starter

- Repository: https://github.com/element-plus/element-plus-nuxt-starter
- Imported commit: `6ecb01e7a0ba3df15f61029df9c51ea31edcce81`
- Retrieved: 2026-08-07
- License: MIT (preserved at `web/LICENSE`)
- Imported into: `web/`
- Import method: GitHub source archive pinned to the commit above; no upstream `.git` directory was imported.

### Adopted scope

This repository supplies the Nuxt + Element Plus application baseline only. Job Assistant business pages, API routes, Prisma schema, LangGraph workflows, and Chrome extension code are implemented in this repository under the approved SSD specifications.

### Change policy

Keep the upstream license. Record material local changes in the relevant feature plan and task documents; do not present imported code as wholly original work.

## Third-party browser extensions (studied, not imported)

Two third-party form-filling extensions were placed in the working tree as comparison material while rebuilding the extension's field matching. **Neither ships a LICENSE file**, and StarJob states no license anywhere, so both are all-rights-reserved by default. No code from either was copied, adapted, or redistributed: only the mechanisms below were studied and then implemented independently against this repository's own profile schema, module layout, and comment style. Both directories and their archives are excluded by `.gitignore`.

### starjob-resume-assistant 1.1.5

- Source: local distribution archive supplied by the repository owner
- License: none declared (no LICENSE file, no license section in README or PRIVACY.md)
- Method: mechanisms studied, code rewritten from scratch

Recorded here so the design is not later mistaken for wholly original work:

| Mechanism | Where it landed |
| --- | --- |
| Scored field matching (0.99 exact / 0.91 contains / 0.80 contained, accept at 0.68) | `extension/lib/form-fill-rules.js` |
| Section hint as a hard gate, to disambiguate blocks repeating a label such as “描述” or “开始时间” | same |
| Descriptor vetoes for near-miss labels (a pinyin box is not a name, a school-name box is not a date) | same |
| Repeated page blocks mapped onto consecutive saved records (anchor advance with occurrence fallback) | same |
| Select/radio option synonyms | same (table written against this repository's own profile fields) |
| Text write contract: `beforeinput` → prototype setter → `input` → settle → `change` → real `blur` | `extension/lib/form-page-bridge.js` |
| Deferred batch read-back, to catch values a framework reverts after accepting them | same |
| Breadth-first walk of open shadow roots | same |
| Per-frame injection with field ids namespaced as `frameId::localId` | `extension/lib/frame-scope.js` |

### CampusApply-Agent

- Source: local archive supplied by the repository owner
- License: README claims MIT, but no LICENSE file is present
- Method: implementation not adopted. Its bidirectional substring scoring and character-overlap “semantic” match were assessed as too prone to false positives and are explicitly not used. Only the idea of an option synonym table was carried over, with the table written independently.

### Policy

Before copying code — rather than studying a mechanism — from any upstream, confirm that upstream's actual license and record it here first.
