# Ireland: Children’s Data Protection Fundamentals

The Irish Data Protection Commission (DPC) sets out 14 “Fundamentals” for protecting children’s data. Use this guide to embed those expectations in your product lifecycle and document controls for review.

## 1. Best interests first
- [ ] Demonstrate how the best interests of the child drive product decisions, especially around engagement features.
- [ ] Record trade-off discussions when commercial interests collide with child welfare, including mitigations adopted.

## 2. Transparency and child-friendly design
- [ ] Provide layered privacy information with plain-language and visual explanations suitable for different age groups.
- [ ] Capture usability testing notes that confirm children can understand the notices and controls.

## 3. Age assurance and parental support
- [ ] Describe the age verification or gating approach and document accuracy checks.
- [ ] Explain how parents/guardians can assist children with consent, access requests, or disputes.

## 4. Profiling, marketing, and nudge restrictions
- [ ] Disable behavioural advertising, tracking, or dark patterns that encourage oversharing by children.
- [ ] Document safeguards preventing high-risk profiling or automated decision-making about children.

## 5. Data minimisation and retention
- [ ] Justify each data element collected from children and demonstrate why it is necessary for the educational purpose.
- [ ] Log retention schedules and deletion routines, including how backups and archives are purged.

## 6. Security and breach readiness
- [ ] Record technical and organisational measures protecting children’s data (encryption, access control, logging).
- [ ] Maintain an incident response playbook with DPC notification thresholds and parent communication plans.

## 7. Enabling children’s rights
- [ ] Capture workflows for access, rectification, erasure, restriction, and objection requests submitted by or for children.
- [ ] Track education/awareness materials that teach children and families how to exercise those rights.

> Ireland’s default age of digital consent is {{ edu_eu_ie.config.age_of_digital_consent }}. Update `.speckit/spec.yaml` (`compliance.frameworks` → `edu-eu-ie.config.age_of_digital_consent`) if the service targets a different EU/EEA Member State.

## Reference links
- Data Protection Commission — [Children’s Fundamentals](https://www.dataprotection.ie/en/dpc-guidance/childrens-data-protection)
- DPC — [Children’s Rights and Safeguards FAQ](https://www.dataprotection.ie/en/individuals/children)
- European Data Protection Board — [Guidelines on Consent](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en)
