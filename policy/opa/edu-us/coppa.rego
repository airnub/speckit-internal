package edu_us.coppa

default allow = true

audience_under_13 {
  input.project.audience_under_13 == true
}

consent_present {
  is_string(input.project.verifiable_parental_consent)
  trim(input.project.verifiable_parental_consent) != ""
}

retention_defined {
  is_string(input.project.data_retention_limit)
  trim(input.project.data_retention_limit) != ""
}

deny[msg] {
  audience_under_13
  not consent_present
  msg := {
    "id": "coppa-consent",
    "message": "Verifiable parental consent not documented for under-13 processing",
  }
}

deny[msg] {
  audience_under_13
  not retention_defined
  msg := {
    "id": "coppa-retention",
    "message": "Data retention limit missing for under-13 processing",
  }
}

trim(value) = result {
  is_string(value)
  result := regex.replace("^(\\s+)|(\\s+)$", "", value)
}
