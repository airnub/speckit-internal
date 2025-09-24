# GDPR Student Data Processing Checklist

Use this checklist to map how your education service processes student personal data under the General Data Protection Regulation (GDPR). Capture lawful bases, transparency artefacts, and risk triggers so privacy reviewers can confirm compliance before launch.

> **Age of digital consent**: {{ edu_eu_ie.config.age_of_digital_consent }} ({{ edu_eu_ie.config.member_state | upper }}) — adapt in `.speckit/spec.yaml` if another EU/EEA Member State applies. See [GDPR Article 8](https://eur-lex.europa.eu/eli/reg/2016/679/art_8/oj) and the Irish Data Protection Commission’s [Children’s Fundamentals guidance](https://www.dataprotection.ie/en/dpc-guidance/childrens-data-protection). 

## 1. Lawful bases & minimisation
- [ ] List every processing activity involving student personal data and link to the system of record.
- [ ] Record the lawful basis relied upon for each activity (e.g., public task for schools, legitimate interests for analytics, consent for optional features).
- [ ] Document data minimisation and necessity analysis; justify any special category data.
- [ ] Note processors/sub-processors and ensure contracts cover Article 28 requirements.

## 2. Transparency & notices
- [ ] Publish child-friendly privacy notices that explain purposes, retention, sharing, and children’s rights.
- [ ] Maintain parent/guardian communications explaining the service, any optional features, and how to exercise rights.
- [ ] Track when notices were last reviewed and how updates are communicated.

## 3. Data subject rights fulfilment
- [ ] Define workflows for access, rectification, erasure, restriction, and objection requests from students or guardians.
- [ ] Capture service-level agreements for responding to requests (recommended: within 30 days) and escalation contacts.
- [ ] Test identity verification controls before releasing or deleting data.

## 4. DPIA & risk triggers
- [ ] Evaluate whether the service profile requires a Data Protection Impact Assessment (large-scale monitoring, new technologies, profiling, high-risk cohorts).
- [ ] If a DPIA is required, log the reference, reviewer, mitigation actions, and revalidation cadence.
- [ ] Track legitimate interest assessments and balancing tests where used.
- [ ] Note any cross-border data transfers and safeguards (SCCs, adequacy decisions, derogations).

## 5. Governance & retention
- [ ] Define retention periods for each dataset and align them with educational necessity.
- [ ] Implement deletion and archival routines plus audit trails confirming completion.
- [ ] Identify responsible roles (controller, joint controller, processor) and escalation points.

## Reference links
- European Commission — [GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- Data Protection Commission (Ireland) — [Fundamentals for a Child-Oriented Approach to Data Processing](https://www.dataprotection.ie/en/dpc-guidance/childrens-data-protection)
- European Data Protection Board — [DPIA Guidelines](https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-202002-article-64-1a-opinion-dpia-template_en)
