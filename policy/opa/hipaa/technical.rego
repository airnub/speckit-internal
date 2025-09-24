package hipaa.technical

# Technical safeguards expected to have objective evidence inside
# docs/internal/compliance/hipaa/technical-safeguards.yaml. The CLI verifier
# mirrors this policy by enforcing pass/fail for these IDs and surfacing
# manual evidence for all remaining safeguards.

controls := {
  "HIPAA-SR-TECH-ACCESS-UNIQUE-ID": {
    "title": "Unique user identification",
    "hipaa": "45 CFR §164.312(a)(2)(i)",
    "nist": ["AC-2", "IA-2", "IA-4"]
  },
  "HIPAA-SR-TECH-AUDIT-CONTROLS": {
    "title": "Audit controls",
    "hipaa": "45 CFR §164.312(b)",
    "nist": ["AU-2", "AU-6", "AU-12"]
  },
  "HIPAA-SR-TECH-INTEGRITY-ENCRYPTION": {
    "title": "Encryption of ePHI at rest",
    "hipaa": "45 CFR §164.312(c)(1)",
    "nist": ["SC-28", "SC-12", "MP-6"]
  },
  "HIPAA-SR-TECH-TRANSMISSION-SECURITY": {
    "title": "Transmission security",
    "hipaa": "45 CFR §164.312(e)(1)",
    "nist": ["SC-8", "SC-12", "SC-13"]
  }
}

# Pass when evidence marks the safeguard as implemented.
allow[control_id] {
  control_id := key
  controls[control_id]
  input.controls[control_id].status == "pass"
}

# Fail when status is explicitly fail or missing.
deny[msg] {
  control_id := key
  controls[control_id]
  not allow[control_id]
  status := input.controls[control_id].status
  status == "fail"
  msg := {
    "id": control_id,
    "message": sprintf("Safeguard %s reported status 'fail'", [control_id])
  }
}

deny[msg] {
  control_id := key
  controls[control_id]
  not input.controls[control_id]
  msg := {
    "id": control_id,
    "message": sprintf("Safeguard %s missing objective evidence", [control_id])
  }
}

# Manual evidence bucket captures safeguards that are not objectively scored.
manual[control_id] {
  control_id := key
  controls[control_id]
  input.controls[control_id].status == "manual"
}
