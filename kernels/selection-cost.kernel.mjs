// nt_selection_cost — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §6.
// Register: canon. guest-legal: YES — multiply/subtract only; zk-provable in §18.
// Lifts selection-sorter.html render().

const TOTAL_POP = 8.1e9;   // canon.js: population.humans (the sim uses an inline 8.1e9; kernel sources canon)
// Exclusion fractions, vendored verbatim from canon.js: selection.criteria (id → fraction of TOTAL_POP deleted):
const SELECTION_CRITERIA = {
  all:0, literacy:0.15, education:0.55, nocrime:0.10, creative:0.85, productive:0.40, iq:0.50,
  health:0.16, wealth:0.84, digital:0.32, faith:0.24, english:0.81, adult:0.26, nocriminal:0.22,
  longevity:0.999
};  // canon.js: selection.criteria

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const excl_fraction  = SELECTION_CRITERIA[p.criterion];
  const excluded_people = excl_fraction * TOTAL_POP;
  const output_payload = {
    excl_fraction,
    excl_pct:         excl_fraction * 100,
    excluded_people,
    retained_people:  TOTAL_POP - excluded_people,
  };
  return { output_payload };
}
