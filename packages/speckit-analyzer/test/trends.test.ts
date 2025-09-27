import { describe, expect, it } from "vitest";

import {
  buildLabelTrendSeries,
  rollingAverageSeries,
  sparkline,
  type LabelDailyRecord,
} from "../src/trends.js";

describe("buildLabelTrendSeries", () => {
  it("fills gaps between days and aggregates labels", () => {
    const records: LabelDailyRecord[] = [
      { date: "2024-01-01", labels: { alpha: 2 } },
      { date: "2024-01-03", labels: { alpha: 1, beta: 5 } },
    ];

    const series = buildLabelTrendSeries(records);

    expect(Object.keys(series)).toEqual(["alpha", "beta"]);
    expect(series.alpha).toEqual([
      { date: "2024-01-01", value: 2 },
      { date: "2024-01-02", value: 0 },
      { date: "2024-01-03", value: 1 },
    ]);
    expect(series.beta).toEqual([
      { date: "2024-01-01", value: 0 },
      { date: "2024-01-02", value: 0 },
      { date: "2024-01-03", value: 5 },
    ]);
  });
});

describe("rollingAverageSeries", () => {
  it("computes a trailing average using the requested window", () => {
    const input = [
      { date: "2024-01-01", value: 4 },
      { date: "2024-01-02", value: 8 },
      { date: "2024-01-03", value: 10 },
    ];

    const result = rollingAverageSeries(input, 2);

    expect(result).toEqual([
      { date: "2024-01-01", value: 4 },
      { date: "2024-01-02", value: 6 },
      { date: "2024-01-03", value: 9 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(rollingAverageSeries([], 3)).toEqual([]);
  });
});

describe("sparkline", () => {
  it("renders block characters scaled to the provided values", () => {
    expect(sparkline([0, 2, 4, 8])).toEqual("▁▃▅█");
  });

  it("caps the output to the requested length", () => {
    expect(sparkline([0, 1, 2, 3, 4], { length: 3 })).toEqual("▁▅█");
  });

  it("shows a flat line when values are constant", () => {
    expect(sparkline([3, 3, 3])).toEqual("███");
  });

  it("returns an em dash for empty data", () => {
    expect(sparkline([])).toEqual("—");
  });
});
