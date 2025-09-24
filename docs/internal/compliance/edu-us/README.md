# Secure mode: Education (US)

The Education (US) pack bundles federal privacy and safety frameworks that apply to K–12 operators: FERPA, COPPA, CIPA, and PPRA. Optional state overlays (California SOPIPA, New York Education Law 2-d) add state-specific guardrails when districts require them.

## Getting started

```bash
speckit compliance plan --framework edu-us --overlays ca-sopipa,ny-2d
speckit compliance verify --framework edu-us
```

- `plan` writes working docs to `docs/internal/compliance/edu-us/**` and only emits state overlays that you request.
- `verify` evaluates evidence captured in `docs/internal/compliance/edu-us/edu-us-controls.yaml`, runs policy checks, and produces `.speckit/compliance-report.(json|md)`.

## Federal bundles

| Framework | Primary authority | Artifacts |
| --- | --- | --- |
| FERPA | Student Privacy Policy Office (U.S. Department of Education) | `ferpa-privacy-checklist.md` |
| COPPA | Federal Trade Commission | `coppa-consent-and-dataflow.md` |
| CIPA | Federal Communications Commission | `cipa-filtering-and-monitoring.md` |
| PPRA | Student Privacy Policy Office (U.S. Department of Education) | `ppra-survey-controls.md` |

## State overlays

| Overlay | Scope | Trigger |
| --- | --- | --- |
| California SOPIPA | Operators of K–12 online services used by California schools | Select `--overlays ca-sopipa` when California districts are in-scope. |
| New York Education Law 2-d | Educational agencies and vendors working with NY districts | Select `--overlays ny-2d` and capture the Parent Bill of Rights and district contracts. |

## Evidence expectations

Update `edu-us-controls.yaml` with a status (`pass`, `fail`, `manual`) and supporting evidence for each requirement. The verify command fails when:

- FERPA, COPPA, CIPA, or PPRA requirements are marked `fail`.
- COPPA applies to under-13 users but consent or retention controls are missing.
- CIPA E-Rate eligibility is claimed without filtering/monitoring documentation.
- New York integrations lack links to the Data Privacy & Security Policy and Parent Bill of Rights.

## Reference links

- U.S. Department of Education — [Student Privacy Policy Office](https://studentprivacy.ed.gov/)
- Federal Trade Commission — [COPPA compliance resources](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy)
- Federal Communications Commission — [CIPA guidance](https://www.fcc.gov/consumers/guides/childrens-internet-protection-act)
- New York State Education Department — [Education Law 2-d Resources](https://www.nysed.gov/data-privacy-security)
- California Legislature — [SOPIPA text](https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=8.&chapter=22.&lawCode=BPC&article=5.)
