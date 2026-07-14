// ah_war_finance_default kernel — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §1.
// Register: alt-history. guest-legal: YES — arithmetic + HORIZON-bounded year loop + compare; strong §18 zk candidate.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Accounting identity: treasury drain → default year → act-of-war clause. Asserts a TOTAL over
// stipulated finances, not a history. Calibration figures are ILLUSTRATIVE/TUNABLE (WW1-Allied
// scale) cited to the documented record — NOT asserted history (board reframe rule).

// Vendored from data/canon.js CH_CANON.altHistory.warFinance — byte-equal citation values.
const WF_START_YEAR   = 1914;   // canon.js: altHistory.warFinance.startYear
const WF_RESERVES     = 165;    // canon.js: altHistory.warFinance.startingReserves — £M, BoE 1914 gold reserve order
const WF_REVENUE      = 200;    // canon.js: altHistory.warFinance.annualRevenue — £M, prewar UK revenue order
const WF_WAR_COST     = 1000;   // canon.js: altHistory.warFinance.warCostPerYear — £M/yr, WW1 spend order
const WF_DEBT_SERVICE = 0.05;   // canon.js: altHistory.warFinance.debtServiceRate — annual interest fraction
const WF_HORIZON_YEARS = 30;    // canon.js: altHistory.warFinance.horizonYears — loop bound (deterministic)

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  let reserves = p.starting_reserves;
  let debt     = p.starting_debt;
  let year     = 0;
  let defaulted = false;
  for (year = 1; year <= WF_HORIZON_YEARS; year++) {
    const interest = debt * p.debt_service_rate;
    const deficit  = p.war_cost_per_year + interest - p.annual_revenue;   // >0 = shortfall
    reserves -= deficit;
    if (deficit > 0) debt += deficit;                                     // finance the gap with debt
    if (reserves < p.default_threshold) { defaulted = true; break; }
  }
  const years_to_default     = defaulted ? year : null;
  const default_year         = defaulted ? p.start_year + year : null;
  const act_of_war_triggered = defaulted && p.act_of_war_clause === true;
  const output_payload = {
    defaults:            defaulted,
    years_to_default,                                        // int | null
    default_year,                                            // int | null
    terminal_reserves:   String(Math.round(reserves)),      // decimal string (I-JSON; can be large-negative)
    total_debt:          String(Math.round(debt)),          // decimal string (I-JSON; compounds toward 2^53)
    act_of_war_triggered,
    verdict: defaulted
      ? ('DEFAULT ' + default_year + (act_of_war_triggered ? ' · ACT-OF-WAR CLAUSE TRIPPED' : ''))
      : 'SOLVENT THROUGH HORIZON',
  };
  return { output_payload };
}
