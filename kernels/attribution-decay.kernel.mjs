// ah_attribution_decay kernel — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §3.
// Register: alt-history. guest-legal: YES — integer-power decay via bounded multiply loops + compare; strong §18 zk candidate.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Parametric decay identity: test/strikes/censorship → attribution-confidence curve. Powers the
// structural-rhyme partial-hash (§5.1). Calibration figures are ILLUSTRATIVE/TUNABLE cited to the
// documented record — NOT asserted history (board reframe rule).

// Vendored from data/canon.js CH_CANON.altHistory.attributionDecay — byte-equal citation values.
const AD_INIT_CONF     = 0.95;  // canon.js: altHistory.attributionDecay.initialConfidence
const AD_DECAY_YR      = 0.15;  // canon.js: altHistory.attributionDecay.decayPerYear — fractional/yr
const AD_THRESHOLD     = 0.50;  // canon.js: altHistory.attributionDecay.threshold — "plausible deniability" line
const AD_TEST_BOOST    = 0.30;  // canon.js: altHistory.attributionDecay.testBoostPerCorroboration
const AD_HORIZON_YEARS = 100;   // canon.js: altHistory.attributionDecay.horizonYears — loop bound

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const yrs   = Math.min(Math.max(Math.trunc(p.years_elapsed), 0), AD_HORIZON_YEARS);
  const base  = 1 - p.decay_per_year * (1 + p.censorship_factor);   // per-year retention
  // confidence after `yrs` years of decay = init * base^yrs (integer-power loop):
  let conf = p.initial_confidence;
  for (let i = 0; i < yrs; i++) conf *= base;
  // corroborating tests pull confidence back toward 1: 1 - (1-conf)*(1-AD_TEST_BOOST)^tests (integer-power loop):
  let gapMul = 1;
  const tests = Math.min(Math.max(Math.trunc(p.corroborating_tests), 0), 100);
  for (let i = 0; i < tests; i++) gapMul *= (1 - AD_TEST_BOOST);
  conf = 1 - (1 - conf) * gapMul;
  if (conf < 0) conf = 0; if (conf > 1) conf = 1;
  // years-to-threshold at zero corroboration (deterministic bounded loop):
  let years_to_threshold = null, c = p.initial_confidence;
  for (let y = 0; y <= AD_HORIZON_YEARS; y++) { if (c < p.threshold) { years_to_threshold = y; break; } c *= base; }
  const output_payload = {
    attribution_confidence: Math.round(conf * 1e6) / 1e6,   // 6-dp, deterministic
    confidence_pct:         Math.round(conf * 1000) / 10,   // 1-dp percent
    below_threshold:        conf < p.threshold,             // bool — deniability achieved
    years_to_threshold,                                     // int | null (null = never crosses in HORIZON)
    verdict: (conf < p.threshold ? 'DENIABLE' : 'ATTRIBUTABLE') + ' · ' + (Math.round(conf * 1000) / 10).toFixed(1) + '%',
  };
  return { output_payload };
}
