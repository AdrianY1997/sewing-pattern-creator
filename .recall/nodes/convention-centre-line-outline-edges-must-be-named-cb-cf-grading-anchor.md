---
id: convention-centre-line-outline-edges-must-be-named-cb-cf-grading-anchor
type: convention
scope: project
title: Centre-line outline edges must be named *.cb* / *.cf* (grading anchor and fold detection depend on it)
triggers: ["centro","centre","doblez","fold","anchor","anclaje","tallas","sizes","cb","cf"]
anchors: [{"path":"src/core/ops/pattern.ts","symbol":"isCentreLineId"}]
asserted: 2026-10-24
invalidated: null
superseded_by: null
confidence: medium
pin: false
source: audit
---
gradingAnchor (nested-sizes view) and cutOnFold's fold run find the centre line by segment id via isCentreLineId: regex `(^|\.)c[bf]([A-Z.~]|$)`, e.g. back.cb, back.cbHip, front.cf, front.cfHip, and the derived ids of edited edges such as back.cb~1 / back.cb~2 (splitSegment, splitPiece) or back.cb~m (cutOnFold): the `~` suffix keeps them centre-line edges. If a block names its centre edge differently, sizes silently align on the bbox top-left corner instead of the construction point.

**How to apply:** in any new block, name centre back/front outline edges `<piece>.cb*` / `<piece>.cf*` and put the topmost one first in the outline; update isCentreLineId and docs/SPEC.md §7.1 together if the scheme changes.
