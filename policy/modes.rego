package main

mode_change_label := "mode-change"
classic_template_ids := {"blank", "next-supabase", "speckit-template"}

has_mode_change_label {
  labels := input.labels
  labels != null
  label := labels[_]
  lower(label) == mode_change_label
}

is_modes_path(path) {
  path == "packages/speckit-cli/src/config/modes.ts"
}

modes_file_changed(file) {
  is_modes_path(file.path)
}

modes_file_changed(file) {
  prev := file.previous_path
  prev != null
  is_modes_path(prev)
}

matches_classic_template(path, id) {
  pattern := sprintf("(^|/)templates/%s($|/|\\.)", [id])
  re_match(pattern, path)
}

classic_template_label(path) = id {
  id := classic_template_ids[_]
  matches_classic_template(path, id)
}

deny[msg] {
  files := input.files
  files != null
  file := files[_]
  modes_file_changed(file)
  not has_mode_change_label
  msg := "mode-change label is required when changing packages/speckit-cli/src/config/modes.ts"
}

deny[msg] {
  files := input.files
  files != null
  file := files[_]
  file.status == "removed"
  template_id := classic_template_label(file.path)
  not has_mode_change_label
  msg := sprintf("mode-change label is required when removing files from classic template '%s': %s", [template_id, file.path])
}
