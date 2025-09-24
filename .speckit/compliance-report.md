# HIPAA Compliance Summary

Generated: 2025-09-24T22:41:38.361Z

Crosswalks: [NIST SP 800-66 Rev.2](https://csrc.nist.gov/publications/detail/sp/800-66/rev-2/final), [OLIR Mapping](https://csrc.nist.gov/Projects/olir)

Objective control failures: 0

| Requirement | Status | Objective | Evidence |
| --- | --- | --- | --- |
| HIPAA-SR-ADM-SEC-MGMT | MANUAL | No |  |
| HIPAA-SR-ADM-WORKFORCE | MANUAL | No |  |
| HIPAA-SR-PHY-FACILITY-ACCESS | MANUAL | No |  |
| HIPAA-SR-PHY-DEVICE-MEDIA | MANUAL | No |  |
| HIPAA-SR-TECH-ACCESS-UNIQUE-ID | PASS | Yes | Workforce SSO issues immutable UUIDs; see infra/iac/iam.tf |
| HIPAA-SR-TECH-AUDIT-CONTROLS | PASS | Yes | Application and infrastructure logs aggregated in CloudWatch with 365-day retention (observability/logging.tf). |
| HIPAA-SR-TECH-INTEGRITY-ENCRYPTION | PASS | Yes | Managed database storage enforces AES-256 encryption via terraform/modules/database/encryption.tf. |
| HIPAA-SR-TECH-TRANSMISSION-SECURITY | PASS | Yes | All external endpoints terminate TLS 1.2+ through AWS ACM certificates (infra/networking/tls.tf). |

OPA policy: policy/opa/hipaa/technical.rego
