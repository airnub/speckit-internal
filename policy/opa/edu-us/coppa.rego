package speckit.edu_us.coppa

# Input schema expectation:
# {
#   "framework": "edu-us",
#   "context": {
#     "coppa": {
#       "processes_under_13": bool
#     }
#   },
#   "evidence": {
#     "coppa": {
#       "parental_consent": bool,
#       "direct_notice": bool,
#       "retention_schedule": bool
#     }
#   }
# }

# Flag when a product processes data from children under 13 but
# has not captured verifiable parental consent evidence.
violation[msg] {
  input.framework == "edu-us"
  input.context.coppa.processes_under_13
  not input.evidence.coppa.parental_consent
  msg := "COPPA requires verifiable parental consent before collecting personal information from children under 13."
}

# Flag when parental notices are missing for child-directed features.
violation[msg] {
  input.framework == "edu-us"
  input.context.coppa.processes_under_13
  not input.evidence.coppa.direct_notice
  msg := "COPPA direct notice to parents must be delivered before enabling child accounts."
}

# Flag if retention limits are undefined when handling child data.
violation[msg] {
  input.framework == "edu-us"
  input.context.coppa.processes_under_13
  not input.evidence.coppa.retention_schedule
  msg := "COPPA requires an articulated retention and deletion schedule for child personal information."
}
