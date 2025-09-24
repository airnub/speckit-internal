package edu_us.ny_2d

default allow = true

overlay_active {
  input.project.integrates_with_ny_districts == true
}

policy_link_present {
  is_string(input.project.ny_data_privacy_policy_url)
  trim(input.project.ny_data_privacy_policy_url) != ""
}

rights_link_present {
  is_string(input.project.ny_parent_bill_of_rights_url)
  trim(input.project.ny_parent_bill_of_rights_url) != ""
}

deny[msg] {
  overlay_active
  not policy_link_present
  msg := {
    "id": "ny-2d-policy",
    "message": "New York Data Privacy & Security Policy link is missing",
  }
}

deny[msg] {
  overlay_active
  not rights_link_present
  msg := {
    "id": "ny-2d-parent-rights",
    "message": "New York Parent Bill of Rights link is missing",
  }
}

trim(value) = result {
  is_string(value)
  result := regex.replace("^(\\s+)|(\\s+)$", "", value)
}
