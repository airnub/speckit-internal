#!/usr/bin/env node
import React from "react";
import { render, Text } from "ink";
import App from "./ui/App.js";

const Boot = () => (
  <>
    <Text color="cyan">SpecKit TUI v0.0.1</Text>
    <Text dimColor>AI OFF by default. N: template (Blank/Next+Supabase/Generic) · K: Spectral · B: docs/RTM · A: AI propose</Text>
    <App/>
  </>
);

render(<Boot />);
