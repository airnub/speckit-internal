package edu_eu.children

default allow = true

is_controller {
  lower(trim(input.project.role)) == "controller"
}

is_controller {
  lower(trim(input.project.role)) == "joint-controller"
}

children_subjects {
  some i
  lower(trim(input.project.data_subjects[i])) == "children"
}

consent_basis {
  some i
  lower(trim(input.project.lawful_bases[i])) == "consent"
}

dpia_documented {
  is_string(input.project.dpia_reference)
  trim(input.project.dpia_reference) != ""
}

age_gating_defined {
  is_string(input.project.age_gating_flow)
  trim(input.project.age_gating_flow) != ""
}

parental_consent_flow_documented {
  is_string(input.project.parental_consent_flow)
  trim(input.project.parental_consent_flow) != ""
}

ads_disabled {
  input.project.behavioral_ads_disabled == true
}

retention_defined {
  is_string(input.project.retention_limit)
  trim(input.project.retention_limit) != ""
}

configured_age = result {
  value := input.config.age_of_digital_consent
  is_number(value)
  result := value
}

configured_age = result {
  value := input.config.age_of_digital_consent
  is_string(value)
  result := to_number(value)
}

configured_age = 16 {
  not input.config.age_of_digital_consent
}

project_age = result {
  value := input.project.age_of_digital_consent
  is_number(value)
  result := value
}

project_age = result {
  value := input.project.age_of_digital_consent
  is_string(value)
  result := to_number(value)
}

project_age = 0 {
  not input.project.age_of_digital_consent
}

age_matches {
  configured_age == project_age
}

deny[msg] {
  is_controller
  children_subjects
  not dpia_documented
  msg := {
    "id": "edu-eu-dpia",
    "message": "DPIA reference missing for child data processing",
  }
}

deny[msg] {
  is_controller
  children_subjects
  not age_gating_defined
  msg := {
    "id": "edu-eu-age-gating",
    "message": "Age gating or assurance controls not documented",
  }
}

deny[msg] {
  is_controller
  children_subjects
  consent_basis
  not parental_consent_flow_documented
  msg := {
    "id": "edu-eu-parental-consent",
    "message": "Parental consent flow missing when consent is the lawful basis",
  }
}

deny[msg] {
  is_controller
  children_subjects
  not ads_disabled
  msg := {
    "id": "edu-eu-behavioral-ads",
    "message": "Behavioural advertising must be disabled for child audiences",
  }
}

deny[msg] {
  is_controller
  children_subjects
  not retention_defined
  msg := {
    "id": "edu-eu-retention",
    "message": "Retention limit for child data not documented",
  }
}

deny[msg] {
  is_controller
  children_subjects
  configured_age == 16
  not age_matches
  msg := {
    "id": "edu-eu-age-mismatch",
    "message": "Age of digital consent must remain 16 for Ireland unless spec config overrides it",
  }
}

trim(value) = result {
  is_string(value)
  result := trim_space(value)
}

trim_space(value) = result {
  result := regex.replace("^(\\s+)|(\\s+)$", "", value)
}
