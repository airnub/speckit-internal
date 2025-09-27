const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LabelDailyRecord {
  date: string; // YYYY-MM-DD
  labels: Record<string, number>;
}

export interface LabelTrendPoint {
  date: string;
  value: number;
}

export type LabelTrendSeries = Record<string, LabelTrendPoint[]>;

function toDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateDates(start: string, end: string): string[] {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (startDate.getTime() > endDate.getTime()) {
    return [];
  }
  const dates: string[] = [];
  for (let current = startDate; current.getTime() <= endDate.getTime(); current = new Date(current.getTime() + MS_PER_DAY)) {
    dates.push(formatDate(current));
  }
  return dates;
}

export function buildLabelTrendSeries(records: LabelDailyRecord[]): LabelTrendSeries {
  if (records.length === 0) {
    return {};
  }
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]?.date;
  const last = sorted[sorted.length - 1]?.date;
  if (!first || !last) {
    return {};
  }
  const dateRange = enumerateDates(first, last);
  const byDate = new Map<string, LabelDailyRecord>();
  for (const record of sorted) {
    byDate.set(record.date, record);
  }
  const labels = new Set<string>();
  for (const record of sorted) {
    for (const key of Object.keys(record.labels)) {
      labels.add(key);
    }
  }
  const series: LabelTrendSeries = {};
  for (const label of labels) {
    series[label] = dateRange.map((date) => ({
      date,
      value: byDate.get(date)?.labels[label] ?? 0,
    }));
  }
  return series;
}

export function rollingAverageSeries(points: LabelTrendPoint[], windowSize: number): LabelTrendPoint[] {
  if (windowSize <= 0) {
    throw new Error(`windowSize must be positive, received ${windowSize}`);
  }
  if (points.length === 0) {
    return [];
  }
  const result: LabelTrendPoint[] = [];
  const values = points.map((point) => point.value);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= windowSize) {
      sum -= values[index - windowSize];
    }
    const divisor = Math.min(windowSize, index + 1);
    result.push({
      date: points[index].date,
      value: Number((sum / divisor).toFixed(3)),
    });
  }
  return result;
}

const SPARKLINE_BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

type SparklineOptions = {
  length?: number;
};

export function sparkline(values: number[], options: SparklineOptions = {}): string {
  const { length } = options;
  if (!Array.isArray(values) || values.length === 0) {
    return "—";
  }
  const subset = length && values.length > length ? values.slice(values.length - length) : values;
  const min = Math.min(...subset);
  const max = Math.max(...subset);
  if (max === min) {
    const block = max === 0 ? SPARKLINE_BLOCKS[0] : SPARKLINE_BLOCKS[SPARKLINE_BLOCKS.length - 1];
    return block.repeat(subset.length);
  }
  const span = max - min;
  return subset
    .map((value) => {
      const normalized = (value - min) / span;
      const index = Math.round(normalized * (SPARKLINE_BLOCKS.length - 1));
      return SPARKLINE_BLOCKS[Math.min(SPARKLINE_BLOCKS.length - 1, Math.max(0, index))];
    })
    .join("");
}
