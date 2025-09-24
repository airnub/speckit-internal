package edu_us.cipa

default allow = true

e_rate_claimed {
  input.project.e_rate_eligible == true
}

filtering_documented {
  is_string(input.project.filtering_policy_document)
  trim(input.project.filtering_policy_document) != ""
}

monitoring_documented {
  is_string(input.project.monitoring_policy_document)
  trim(input.project.monitoring_policy_document) != ""
}

deny[msg] {
  e_rate_claimed
  not filtering_documented
  msg := {
    "id": "cipa-filtering",
    "message": "Filtering or technology protection measure documentation missing while claiming E-Rate eligibility",
  }
}

deny[msg] {
  e_rate_claimed
  not monitoring_documented
  msg := {
    "id": "cipa-monitoring",
    "message": "Monitoring procedure documentation missing while claiming E-Rate eligibility",
  }
}

trim(value) = result {
  is_string(value)
  result := regex.replace("^(\\s+)|(\\s+)$", "", value)
}
