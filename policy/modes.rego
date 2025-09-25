package main

preset_change_label := "preset-change"
classic_template_ids := {"blank", "next-supabase", "speckit-template"}

has_preset_change_label {
  labels := input.labels
  labels != null
  label := labels[_]
  lower(label) == preset_change_label
}

is_presets_path(path) {
  path == "packages/speckit-presets/src/index.ts"
}

presets_file_changed(file) {
  is_presets_path(file.path)
}

presets_file_changed(file) {
  prev := file.previous_path
  prev != null
  is_presets_path(prev)
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
  presets_file_changed(file)
  not has_preset_change_label
  msg := "preset-change label is required when changing packages/speckit-presets/src/index.ts"
}

deny[msg] {
  files := input.files
  files != null
  file := files[_]
  file.status == "removed"
  template_id := classic_template_label(file.path)
  not has_preset_change_label
  msg := sprintf("preset-change label is required when removing files from classic template '%s': %s", [template_id, file.path])
}
