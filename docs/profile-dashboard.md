# Member dashboard — how the UI implements the Dynamic Member Profiles framework

`dashboard.html` is the profile section of the platform preview. It implements the
**NODAL Dynamic Member Profiles** working document (June 2026, builds on Section 7
*Audience Architecture* of the Strategic Document). Demo persona: **Camila**, the
framework's own worked example — one profile holding Community Member + Skilled
Practitioner (Public space) + Mentor (Participatory processes) + Local Connector (Lima).

## Mapping: framework → UI

| Framework concept (doc §) | Where it lives in the UI |
| --- | --- |
| Profile as a **role stack**, not a category (§1–2) | "Role stack:" card — validated role pills with scopes, plus an in-progress dashed pill (Ambassador 4/6) and an activity-mix bar (Practice / Mentoring / Connecting) showing the person is several things at once |
| Six profile layers (§2) | Identity → greeting/avatar; Topics+Skills → trust ladder; Intent → mentoring card note; Contribution → contributions card; Roles & badges → role stack + badges section |
| Onboarding Parts A/B/C (§3) | "Profile completeness:" rail card — Part A ✓, Part B ✓, Part C 2/4 with the unlock it gates (Project Expert validation) |
| Four-level proficiency scale (§4.1) | Self-assessment segmented controls: Exploring · Practicing · Proficient · Reference — levels attach to topics, never the person |
| Levels per topic, asymmetry is normal (§4.1, §5.2) | Mentoring card: "you mentor in participatory processes — and you're a mentee in urban data" |
| Experience indicators (§4.2) | Leadership + transmission toggles under the topic ratings |
| **Trust ladder** self-declared → endorsed → validated (§4.3, §7.2) | "Trust ladder:" card — outline / half-filled / filled dot markers per topic, exactly the visual language the doc proposes |
| Suggested starting tracks (§4.4) | "Suggested track:" card — live rule: L3+ + transmission → Leader/Mentor potential; L3+ + leads → Specialist; L2 → Practitioner; else Learner. Changing the sliders re-evaluates in real time |
| **Mentor fast-track from day one** (§5) | Fast-track panel appears when the Leader track fires: evidence review → 20-min validation call → trial session → Mentor badge |
| Self-declaration cap (§11 open question, resolved) | The Reference (L4) button is disabled unless NODAL-validated — "self-assessment caps at Proficient" |
| Growth trunk + **four branches** (§6) | Growth paths section — Knowledge / Project / Territory / Community rows (positions held on several at once), each opening a detail panel with activation criteria as a checklist, the unlock, and a CTA |
| **Badge families** (§7) | Badges grid — Role (validated, with scope), Contribution (automatic, with progress counts), Recognition (granted, scarce). Every tile states what it unlocks — "never create a badge that unlocks nothing" |
| Skills/topics evolve over time (§8) | Trust markers + editable self-assessment + "Course Graduate feeds your topic levels" badge; the contribution sparkline gives the profile a direction of travel |
| Dashboard answers "where am I / what's next / what do I unlock" (§9) | The page structure itself: role stack (where am I) → growth paths (what's open) → unlock chips and badge unlock lines (what I gain) |

## Notes

- Pure static preview — no backend dependency; all data illustrative, all DOM built
  with `textContent` (CSP: no inline scripts/styles).
- Brand only: Montserrat/Nunito, greens `#59bc53 / #addea8 / #3d5c38`, beige `#f2ecec`;
  card pastels are tints of those hues.
- Nav "Profile" on all pages now opens the dashboard; the public member view
  (`profile.html`) is linked from the sidebar as "Public profile".
