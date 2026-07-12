// nt_time_dilation kernel — buildplan 1.3, NEWTRIPOLI-L1-KERNELS-SPEC.md §1.
// guest-legal: YES — pure multiply/divide/compare; zk-provable in §18.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.

// Vendored from repo/ch-sims/data/canon.js — byte-equal citation values.
// TODO(1.4): canon-sync gate should cover these vendored constants.
const SERIES0_CEILING  = 50;   // canon.js: series[0].ceiling (New Tripoli) — default rate_x. §18
const SERIES0_RESET_MO = 6;    // canon.js: series[0].resetMonths — default reset_months. §9
const LIFESPAN_YR      = 122;  // canon.js: feasibility.lifespanYr — demonstrated neuronal ceiling. Audit §4.8

export function compute(policy_parameters) {
  const { rate_x: R, reset_months } = policy_parameters.input_parameters;
  const resetYears = reset_months / 12;
  const output_payload = {
    subj_per_real_year:       R,
    subj_between_sabbaths_yr: R * resetYears,
    upload_required:          R > LIFESPAN_YR,
    real_yr_to_lifespan:      LIFESPAN_YR / R,
    lifespan_yr:              LIFESPAN_YR,
  };
  return { output_payload };
}
