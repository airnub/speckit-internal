---
title: HIPAA Security Rule Checklist
requires_dialect: speckit.v1
tags: ["secure", "hipaa"]
---

# HIPAA Security Rule Checklist

Secure mode surfaces the safeguards from the HIPAA Security Rule (HIPAA Security Rule) and aligns them with
NIST SP 800-66 Rev. 2 as well as the OLIR HIPAA→SP 800-53 Rev. 5 mapping. Use this checklist to track implementation status
and evidence across administrative, physical, and technical safeguards.


## Administrative Safeguards — 45 CFR §164.308

- [ ] **Risk Analysis** (`164.308(a)(1)(ii)(A)`)
  - Summary: Conduct an accurate and thorough assessment of potential risks to ePHI.
  - Implementation Tasks:
    - Maintain an asset inventory for systems storing or processing ePHI.
    - Review threat landscape quarterly using NIST SP 800-30 guidance.
    
  - NIST SP 800-53 Rev. 5 Controls: RA-3, RA-5

- [ ] **Workforce Clearance Procedures** (`164.308(a)(3)(ii)(B)`)
  - Summary: Implement procedures to ensure workforce access to ePHI is appropriate.
  - Implementation Tasks:
    - Document least-privilege roles mapped to job functions.
    - Run quarterly entitlement reviews for privileged accounts.
    
  - NIST SP 800-53 Rev. 5 Controls: PS-3, AC-2


## Physical Safeguards — 45 CFR §164.310

- [ ] **Facility Security Plan** (`164.310(a)(2)(ii)`)
  - Summary: Safeguard physical access to facilities where ePHI systems reside.
  - Implementation Tasks:
    - Maintain data center access logs with retention ≥ 6 years.
    - Review and revoke inactive keycards monthly.
    
  - NIST SP 800-53 Rev. 5 Controls: PE-2, PE-6

- [ ] **Device and Media Controls** (`164.310(d)(2)(i)`)
  - Summary: Dispose of media containing ePHI in a secure manner.
  - Implementation Tasks:
    - Use NIST SP 800-88 compliant media sanitization procedures.
    - Track custody of removable media and storage devices.
    
  - NIST SP 800-53 Rev. 5 Controls: MP-6, MP-2


## Technical Safeguards — 45 CFR §164.312

- [ ] **Unique User Identification** (`164.312(a)(2)(i)`)
  - Summary: Assign a unique name and/or number for identifying and tracking user identity.
  - Implementation Tasks:
    - Provision unique application identities via central IAM.
    - Disable dormant accounts after 60 days of inactivity.
    
  - NIST SP 800-53 Rev. 5 Controls: IA-2, AC-2

- [ ] **Encryption and Decryption** (`164.312(a)(2)(iv)`)
  - Summary: Implement mechanisms to encrypt and decrypt ePHI at rest.
  - Implementation Tasks:
    - Enforce encryption at rest for databases and object storage.
    - Manage encryption keys via dedicated KMS with annual rotation.
    
  - NIST SP 800-53 Rev. 5 Controls: SC-12, SC-28

- [ ] **Integrity Controls** (`164.312(c)(1)`)
  - Summary: Protect ePHI from improper alteration or destruction.
  - Implementation Tasks:
    - Enable cryptographic hashing for stored artifacts.
    - Retain tamper-evident audit logs for critical systems.
    
  - NIST SP 800-53 Rev. 5 Controls: SI-7, AU-9

- [ ] **Transmission Security** (`164.312(e)(1)`)
  - Summary: Guard against unauthorized access to ePHI transmitted over networks.
  - Implementation Tasks:
    - Enforce TLS 1.2+ for all external interfaces.
    - Use forward secrecy ciphers and disable legacy protocols.
    
  - NIST SP 800-53 Rev. 5 Controls: SC-8, SC-13




_References: NIST SP 800-66 Rev. 2 Implementation Guidance · NIST OLIR HIPAA→SP 800-53 Rev. 5 Mapping_

