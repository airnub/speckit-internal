---
title: "HIPAA Security Rule Checklist"
requires_dialect: "speckit.v1@>=1.0.0"
tags: ["secure", "hipaa"]
---
# HIPAA Security Rule Checklist

This checklist summarises the administrative, physical, and technical safeguards drawn from the HIPAA Security Rule. It is derived from NIST SP 800-66 Rev.2 guidance and the NIST OLIR mapping to SP 800-53 Rev.5 controls to support secure-mode compliance planning.

## Crosswalk references

- NIST SP 800-66 Rev.2 — NIST SP 800-66 Rev.2 (https://csrc.nist.gov/publications/detail/sp/800-66/rev-2/final)
- NIST OLIR Mapping — NIST OLIR: HIPAA Security Rule ↔︎ SP 800-53 Rev.5 (https://csrc.nist.gov/Projects/olir)

## Safeguard status overview


### Administrative Safeguards (45 CFR §164.308)

Policies and procedures to manage the selection, development, implementation, and maintenance of security measures to protect electronic protected health information.

| Safeguard | HIPAA Citation | Status | Evidence | Mapped NIST SP 800-53 Rev.5 Controls |
| --- | --- | --- | --- | --- |




| Security Management Process | 45 CFR §164.308 §164.308(a)(1) | MANUAL | Manual evidence required | RA-3, CA-2, AU-6 |




| Workforce Security | 45 CFR §164.308 §164.308(a)(3) | MANUAL | Manual evidence required | PS-2, PS-3, AC-5 |


### Physical Safeguards (45 CFR §164.310)

Physical measures, policies, and procedures to protect electronic information systems and related buildings and equipment from natural and environmental hazards and unauthorized intrusion.

| Safeguard | HIPAA Citation | Status | Evidence | Mapped NIST SP 800-53 Rev.5 Controls |
| --- | --- | --- | --- | --- |




| Facility Access Controls | 45 CFR §164.310 §164.310(a)(1) | MANUAL | Manual evidence required | PE-2, PE-3, PE-6 |




| Device and Media Controls | 45 CFR §164.310 §164.310(d)(1) | MANUAL | Manual evidence required | MP-6, MP-7, SC-12 |


### Technical Safeguards (45 CFR §164.312)

Technology and the policy and procedures for its use that protect electronic protected health information and control access to it.

| Safeguard | HIPAA Citation | Status | Evidence | Mapped NIST SP 800-53 Rev.5 Controls |
| --- | --- | --- | --- | --- |




| Unique User Identification | 45 CFR §164.312 §164.312(a)(2)(i) | PASS | Workforce SSO issues immutable UUIDs; see infra/iac/iam.tf | AC-2, IA-2, IA-4 |




| Audit Controls | 45 CFR §164.312 §164.312(b) | PASS | Application and infrastructure logs aggregated in CloudWatch with 365-day retention (observability/logging.tf). | AU-2, AU-6, AU-12 |




| Encryption of ePHI at Rest | 45 CFR §164.312 §164.312(c)(1) | PASS | Managed database storage enforces AES-256 encryption via terraform/modules/database/encryption.tf. | SC-28, SC-12, MP-6 |




| Transmission Security | 45 CFR §164.312 §164.312(e)(1) | PASS | All external endpoints terminate TLS 1.2+ through AWS ACM certificates (infra/networking/tls.tf). | SC-8, SC-12, SC-13 |



## Next steps

1. Capture or link evidence for any safeguards marked as MANUAL.
2. Update `docs/internal/compliance/hipaa/technical-safeguards.yaml` with objective evidence when controls are automated.
3. Run `speckit compliance verify --framework hipaa` to refresh the compliance report.
