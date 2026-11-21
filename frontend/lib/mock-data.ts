/**
 * MOCK DATA ONLY.
 *
 * Everything in this file is made-up placeholder content used to shape the UI.
 * It is NOT real market data and must never be presented as such. Every
 * component that renders it must show a <MockBadge /> or <MockDataNotice />.
 * Replace each export with an API call once the backend provides real data.
 */

export type MockStrategy = {
  id: string;
  name: string;
  type: string;
  timeframe: string;
  params: string;
  status: "Planned" | "Draft";
};

export const MOCK_STRATEGIES: MockStrategy[] = [
  { id: "ema-12-30", name: "EMA 12/30 Crossover", type: "ema_crossover", timeframe: "15m", params: "fast=12, slow=30", status: "Planned" },
  { id: "rsi", name: "RSI", type: "rsi", timeframe: "15m", params: "-", status: "Draft" },
  { id: "macd", name: "MACD", type: "macd", timeframe: "15m", params: "-", status: "Draft" },
  { id: "supertrend", name: "Supertrend", type: "supertrend", timeframe: "15m", params: "-", status: "Draft" },
];

export type MockInstrument = {
  symbol: string;
  exchange: "NSE";
  name: string;
  lastPrice: number;
  changePct: number;
};

// Prices are fictional and do not reflect real quotes.
export const MOCK_INSTRUMENTS: MockInstrument[] = [
  { symbol: "SAMPLE1", exchange: "NSE", name: "Sample Instrument One", lastPrice: 1000.0, changePct: 0.45 },
  { symbol: "SAMPLE2", exchange: "NSE", name: "Sample Instrument Two", lastPrice: 2500.5, changePct: -0.32 },
  { symbol: "SAMPLE3", exchange: "NSE", name: "Sample Instrument Three", lastPrice: 450.25, changePct: 1.1 },
];

export type MockSignal = {
  id: string;
  time: string;
  symbol: string;
  strategy: string;
  action: "BUY" | "SELL" | "HOLD";
  price: number;
};

export const MOCK_SIGNALS: MockSignal[] = [
  { id: "s1", time: "2000-01-01 09:30", symbol: "SAMPLE1", strategy: "EMA 12/30 Crossover", action: "BUY", price: 1000.0 },
  { id: "s2", time: "2000-01-01 09:45", symbol: "SAMPLE1", strategy: "EMA 12/30 Crossover", action: "HOLD", price: 1002.5 },
  { id: "s3", time: "2000-01-01 10:00", symbol: "SAMPLE1", strategy: "EMA 12/30 Crossover", action: "SELL", price: 1010.0 },
];

export type MockPosition = {
  symbol: string;
  quantity: number;
  entryPrice: number;
  lastPrice: number;
};

export const MOCK_POSITIONS: MockPosition[] = [
  { symbol: "SAMPLE2", quantity: 10, entryPrice: 2500.0, lastPrice: 2500.5 },
];

export const MOCK_OVERVIEW_STATS = [
  { label: "Paper Equity", value: "₹1,00,000", hint: "Starting capital (placeholder)" },
  { label: "Open Positions", value: "0", hint: "Paper positions" },
  { label: "Signals Today", value: "0", hint: "No strategy running yet" },
  { label: "Active Strategies", value: "0", hint: "None enabled" },
];
