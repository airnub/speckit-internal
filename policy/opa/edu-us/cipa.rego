package speckit.edu_us.cipa

# Input schema expectation:
# {
#   "framework": "edu-us",
#   "context": {
#     "cipa": {
#       "claims_e_rate": bool
#     }
#   },
#   "evidence": {
#     "cipa": {
#       "filtering_policy": bool
#     }
#   }
# }

# Require an internet safety policy and filtering/monitoring documentation
# whenever a project claims E-Rate eligibility under CIPA.
violation[msg] {
  input.framework == "edu-us"
  input.context.cipa.claims_e_rate
  not input.evidence.cipa.filtering_policy
  msg := "CIPA compliance requires a published filtering and monitoring policy for E-Rate eligibility."
}
