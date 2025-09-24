package hipaa.tech

required_controls := {"tls", "encryption_at_rest", "unique_user_ids", "audit_logging"}

control_by_key[key] = control {
  control := input.controls[_]
  control.key == key
}

deny[msg] {
  key := required_controls[_]
  not control_by_key[key]
  msg := sprintf("Missing control evidence for '%s'", [key])
}

deny[msg] {
  control := input.controls[_]
  control.category == "technical"
  control.status == "fail"
  msg := sprintf("%s failed: %s", [control.requirement_id, control.reason])
}

manual[msg] {
  control := input.controls[_]
  control.category == "technical"
  control.status == "manual"
  msg := sprintf("%s requires manual review", [control.requirement_id])
}

allow {
  not deny[_]
}
