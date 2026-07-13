// nt_birthday_sacrifice — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §4.
// Register: canon. guest-legal: YES — rates taken directly; multiply/subtract/round/compare only. zk-provable in §18.
// Lifts birthday-sacrifice.html render().

const SIM_YEARS_PER_BLOCK = 25;   // canon.js: simYearsPerBlock — simulated yr per 6-mo Tripoli block (§18)
const SERIES0_CEILING     = 50;   // canon.js: series[0].ceiling (New Tripoli) — default your_rate_x. §18
const PLUTO_START         = 200;  // canon.js: plutoDoublingSchedule[0] — New Pluto entry rate. default family_rate_x. §4/§18

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const your_subjective_yr   = p.your_rate_x   * p.calendar_yr;
  const family_subjective_yr = p.family_rate_x * p.calendar_yr;
  const per_year_cost_x      = Math.max(0, p.family_rate_x - p.your_rate_x);
  const output_payload = {
    your_subjective_yr,
    family_subjective_yr,
    sacrifice_yr:   per_year_cost_x * p.calendar_yr,
    per_year_cost_x,
    descendants:    Math.max(0, Math.round(your_subjective_yr / SIM_YEARS_PER_BLOCK)),
  };
  return { output_payload };
}
