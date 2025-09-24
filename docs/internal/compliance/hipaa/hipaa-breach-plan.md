---
title: "HIPAA Breach Notification Playbook"
requires_dialect: "speckit.v1@>=1.0.0"
tags: ["secure", "hipaa"]
---
# Breach Notification Response Plan

This playbook supports the Breach Notification Rule (45 CFR §164.400-414) and links each decision point to HIPAA Security Rule safeguards and the mapped NIST SP 800-53 Rev.5 controls. Use it alongside the audit evidence produced by Audit Controls.

## Decision tree

1. **Detect anomalous activity**
   - Triggered by audit controls (§164.312(b)) and mapped controls AU-2, AU-6, AU-12.
   - Confirm whether the event involves unsecured PHI.
2. **Assess scope and risk**
   - Security Officer leads an assessment with Privacy Officer.
   - Reference Administrative safeguards §164.308(a)(1) (Security Management Process) and NIST SP 800-66 Rev.2 guidance Section 5.
3. **Determine notification obligations**
   - If breach confirmed, follow §164.404 (individuals), §164.406 (media), §164.408 (HHS).
   - Document decision rationale and link to disclosure logs maintained under Privacy governance.
4. **Execute communication plan**
   - Coordinate with legal and communications teams.
   - Provide mitigation steps tied to safeguards such as Transmission Security (TLS enforcement) and Encryption of ePHI at Rest (encryption at rest).
5. **Post-incident review**
   - Update risk analysis and workforce training materials.
   - Feed lessons learned into the HIPAA security checklist and evidence log.

## Evidence pointers

- `docs/internal/compliance/hipaa/technical-safeguards.yaml` – authoritative status for automated safeguards.
- System architecture diagrams – verify TLS termination points and key management solutions.
- IAM provisioning logs – demonstrate unique user ID lifecycle controls.

Maintain this document under version control and update after each tabletop exercise.
