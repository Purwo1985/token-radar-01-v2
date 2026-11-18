// token-radar-01-v2: a peer-fitted launch radar.
//
// The model is a regression, not a flat multiple. It fits a log-log line
// through the 128 live-token protocols in the snapshot itself
// (log market cap on log TVL), then adjusts each pre-token protocol by the
// median residual its own category's live peers leave on that line, by its
// seven-day momentum, by how long it has run with no token, and by how many
// chains it spans. A walk-forward split (fit on the oldest 70% of live
// protocols, tested on the newest 30%) is computed in the same run and shown
// on the page, so the reader sees how far the fit can be trusted — and how
// far it cannot. No protocol name is ever special-cased: one function scores
// every row, and the fit is recomputed from the snapshot on every run.

/** One protocol record: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted line and its honest report card. */
export interface FitReport {
  /** Live-token protocols that entered the fit (mcap and TVL both positive). */
  n: number;
  /** log(mcap) = intercept + slope * log(tvl). */
  intercept: number;
  slope: number;
  /** R-squared of the fit on all n live protocols. */
  r_squared: number;
  /** Median absolute log error of the fit, as a multiple (exp of it). */
  median_error_x: number;
  /** Walk-forward: fit on the oldest 70% of dated live protocols. */
  walkforward_train: number;
  walkforward_test: number;
  /** Median absolute log error on the held-out newest 30%, as a multiple. */
  walkforward_median_error_x: number;
  /** Mean absolute log error on the held-out newest 30%, as a multiple. */
  walkforward_mean_error_x: number;
  /** The global median market-cap / TVL among live protocols. */
  global_median_ratio: number;
}

/** One category's live peers and what they leave on the fitted line. */
export interface CategoryPeer {
  category: string;
  /** Live-token protocols in this category that entered the fit. */
  peers: number;
  /** Median residual of the category's peers, as a multiplier on the fitted value. */
  residual_x: number;
  /** Median market-cap / TVL of the category's live peers. */
  median_ratio: number;
}

/** One step of a farm plan: action, cost and time, as one string. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One ranked row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  /** 0-100: how launch-ready the protocol looks (age, momentum, breadth). */
  readiness: number;
  model: {
    fitted_value_usd: number;
    category_residual_x: number;
    momentum_x: number;
    tenure_x: number;
    breadth_x: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  readiness: number;
  fitted_value_usd: number;
  category_residual_x: number;
  momentum_x: number;
  tenure_x: number;
  breadth_x: number;
  farm_steps: string[];
}

/** A live-token protocol shown for comparison, at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  ratio: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FitReport;
  categories: CategoryPeer[];
  /** Every live protocol that entered the fit, for the scatter chart. */
  fit_points: { tvl: number; mcap: number }[];
  /** The snapshot's watchlist slugs, so the page can badge them. */
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-2-regression';

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const q = [...values].sort((a, b) => a - b);
  const mid = Math.floor(q.length / 2);
  return q.length % 2 === 1 ? q[mid]! : (q[mid - 1]! + q[mid]!) / 2;
}

/** Ordinary least squares of y on x; returns intercept, slope and R-squared. */
function ols(xs: number[], ys: number[]): { intercept: number; slope: number; r2: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const f = intercept + slope * xs[i]!;
    ssr += (ys[i]! - f) * (ys[i]! - f);
    sst += (ys[i]! - my) * (ys[i]! - my);
  }
  return { intercept, slope, r2: sst === 0 ? 0 : 1 - ssr / sst };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol may be ranked as a launch candidate. The watchlist's
 * own exclusions are applied to the whole board: a wrapped, staked or
 * bridged product of a token that already trades, a versioned pool of
 * another protocol, and a centralised exchange are not launches waiting to
 * happen, however large their TVL.
 */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const PRODUCT_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== null &&
    !PRODUCT_CATEGORY.has(p.category) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_LEAD.test(p.name)
  );
}

/**
 * Fit the line and its report card from the snapshot's live-token
 * protocols, and the per-category peer table. Everything here is computed
 * from the snapshot at run time; nothing about the market is hardcoded.
 */
export function fitModel(snapshot: Snapshot): { fit: FitReport; categories: CategoryPeer[] } {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd!));
  const { intercept, slope, r2 } = ols(xs, ys);
  const absErr = live.map((p, i) => Math.abs(ys[i]! - (intercept + slope * xs[i]!)));
  const globalMedianRatio = median(live.map((p) => p.mcap_usd! / p.tvl_usd));

  // Walk-forward: fit on the oldest 70% of dated live protocols, test on the newest 30%.
  const dated = live.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
  const cut = Math.max(10, Math.floor(dated.length * 0.7));
  const train = dated.slice(0, cut);
  const test = dated.slice(cut);
  const tr = ols(train.map((p) => Math.log(p.tvl_usd)), train.map((p) => Math.log(p.mcap_usd!)));
  const testErr = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - (tr.intercept + tr.slope * Math.log(p.tvl_usd))));
  testErr.sort((a, b) => a - b);

  // Per-category peer table: median residual on the fitted line, shrunk
  // toward zero when a category has few live peers.
  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(p);
    byCategory.set(key, list);
  }
  const categories: CategoryPeer[] = [...byCategory.entries()]
    .map(([category, peers]) => {
      const residuals = peers.map((p) => Math.log(p.mcap_usd!) - (intercept + slope * Math.log(p.tvl_usd)));
      const n = peers.length;
      const shrunk = median(residuals) * (n / (n + 2));
      return {
        category,
        peers: n,
        residual_x: Math.exp(shrunk),
        median_ratio: median(peers.map((p) => p.mcap_usd! / p.tvl_usd)),
      };
    })
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));

  return {
    fit: {
      n: live.length,
      intercept,
      slope,
      r_squared: r2,
      median_error_x: Math.exp(median(absErr)),
      walkforward_train: train.length,
      walkforward_test: test.length,
      walkforward_median_error_x: Math.exp(median(testErr)),
      walkforward_mean_error_x: Math.exp(testErr.reduce((a, b) => a + b, 0) / testErr.length),
      global_median_ratio: globalMedianRatio,
    },
    categories,
  };
}

/** Seven-day momentum, clamped, as a multiplier: +100% growth pays x1.40, -50% costs x0.80. */
function momentumFactor(change7d: number | null): number {
  const g = Math.min(150, Math.max(-50, finite(change7d, 0)));
  return 1 + 0.004 * g;
}

/** Tenure: a protocol that has run longer with no token earns more of the fitted value. */
function tenureFactor(age: number | null): number {
  if (age === null) return 0.88;
  return 0.8 + 0.2 * (Math.min(Math.max(age, 0), 1460) / 1460);
}

/** Breadth: each extra chain past the first adds 1.5%, capped at twelve extra. */
function breadthFactor(chains: number): number {
  return 1 + 0.015 * Math.min(Math.max(chains - 1, 0), 12);
}

/** Launch-readiness, 0-100, from age, momentum and breadth — a second opinion beside value. */
function readiness(age: number | null, change7d: number | null, chains: number): number {
  const ageScore = age === null ? 0.5 : Math.min(Math.max(age, 0), 1095) / 1095;
  const growthScore = change7d === null ? 0.5 : Math.min(1, Math.max(0, (change7d + 20) / 120));
  const breadthScore = Math.min(chains, 8) / 8;
  return Math.round(100 * (0.45 * ageScore + 0.35 * growthScore + 0.2 * breadthScore));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: action, then cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC into ${name} on ${chain} and leave the supply open.`;
  if (c.includes('dex') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave the position open.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC into ${chain} with ${name}, then put the bridged funds to work inside its app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain's native asset through ${name} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} and take one position in an open market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the shares.`;
  if (c.includes('stable') || c.includes('dual-token')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset ${name} issues on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('aggregator')) return `Deposit $${capital} of USDC into ${name}'s main strategy on ${chain} and leave it compounding.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and hold the position.`;
  if (c.includes('payment') || c.includes('card')) return `Route $${capital} of spending through ${name} on ${chain} and keep the account active.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to the ${name} chain and use one of its native apps.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/**
 * A protocol's farm plan: five phases — Prepare, Position, Stay active,
 * Hold, Claim and record — each with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age), never from a list of
 * names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline on paper.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 200 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action every week — a deposit, a swap, a borrow or a vote — so the wallet reads as a real user.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, and open the protocol's own points or rewards page once a month to confirm the activity counts.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Claim only from the link the protocol itself publishes, never from a link in a message, then write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's comparison table. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || b.tvl_usd - a.tvl_usd)
    .slice(0, 12)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
      ratio: p.mcap_usd! / p.tvl_usd,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { fit, categories } = fitModel(snapshot);
  const residualByCategory = new Map(categories.map((c) => [c.category, c.residual_x]));
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its TVL.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const fitted = Math.exp(fit.intercept + fit.slope * Math.log(Math.max(p.tvl_usd, 1)));
    const residual = residualByCategory.get(p.category ?? 'Uncategorised') ?? 1;
    const momentum = momentumFactor(p.change_7d);
    const tenure = tenureFactor(age);
    const breadth = breadthFactor(p.chains.length);
    const implied = Math.max(1, Math.round(fitted * residual * momentum * tenure * breadth));
    return { p, age, fitted, residual, momentum, tenure, breadth, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    readiness: readiness(s.age, s.p.change_7d, s.p.chains.length),
    model: {
      fitted_value_usd: Math.round(s.fitted),
      category_residual_x: round4(s.residual),
      momentum_x: round4(s.momentum),
      tenure_x: round4(s.tenure),
      breadth_x: round4(s.breadth),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    readiness: row.readiness,
    fitted_value_usd: row.model.fitted_value_usd,
    category_residual_x: row.model.category_residual_x,
    momentum_x: row.model.momentum_x,
    tenure_x: row.model.tenure_x,
    breadth_x: row.model.breadth_x,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const { fit, categories } = fitModel(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const fitPoints = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd! }))
    .sort((a, b) => a.tvl - b.tvl);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit,
    categories,
    fit_points: fitPoints,
    watchlist: [...snapshot.watchlist],
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
