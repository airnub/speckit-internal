package speckit.edu_us.ny_2d

# Input schema expectation:
# {
#   "framework": "edu-us",
#   "context": {
#     "ny_2d": {
#       "integrates_with_districts": bool
#     }
#   },
#   "evidence": {
#     "ny_2d": {
#       "parent_bill_of_rights": bool,
#       "privacy_security_policy": bool
#     }
#   }
# }

violation[msg] {
  input.framework == "edu-us"
  input.context.ny_2d.integrates_with_districts
  not input.evidence.ny_2d.parent_bill_of_rights
  msg := "New York Education Law 2-d requires a posted Parent Bill of Rights for Data Privacy and Security."
}

violation[msg] {
  input.framework == "edu-us"
  input.context.ny_2d.integrates_with_districts
  not input.evidence.ny_2d.privacy_security_policy
  msg := "New York Education Law 2-d requires a published Data Privacy and Security Policy before contracting with districts."
}
