---
id: convention-editor-ui-must-follow-docs-ui-md-derived-from-the-user-s
type: convention
scope: project
title: Editor UI must follow docs/UI.md, derived from the user's mockup docs/example-layout.png
triggers: ["ui","diseño","design","layout","estilo","style","editor","mockup"]
anchors: [{"path":"docs/example-layout.png"}]
asserted: 2026-10-24
invalidated: null
superseded_by: null
confidence: medium
pin: false
source: user
---
The user supplied docs/example-layout.png as the visual reference for the app ("sigue un poco ese estilo").
docs/UI.md translates it into layout regions, CSS tokens and canvas conventions.

**How to apply:** every UI task (F2 editor onwards) must point the subagent to docs/UI.md and the PNG.
Elements beyond v1 scope (3D view, sewing instructions, difficulty, library, suggestions, accounts)
are rendered as disabled placeholders, not implemented.
