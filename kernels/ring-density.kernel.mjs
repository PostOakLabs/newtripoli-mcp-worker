// nt_ring_density — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §3.
// Register: canon. guest-legal: YES — multiply/divide/add/compare only; zk-provable in §18.
// Lifts ring-density.html render().

const RING_CIRCUMFERENCE_KM = 4712;   // canon.js: housing.ringCircumferenceKm — 2π·750 km ring
const SKYSCRAPER_RESIDENTS  = 2e6;    // canon.js: housing.skyscraperResidents — all >150 m buildings, combined; used for the skyscraper comparison reference
const TARGET_POP            = 8.1e9;  // canon.js: population.humans — everyone to be housed

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const circ_m = RING_CIRCUMFERENCE_KM * 1000;
  const ring_capacity = circ_m * p.ring_depth_m * p.floors / p.area_per_person_m2;
  const core_residents = p.core_millions * 1e6;
  const total_housed = ring_capacity + core_residents;
  const output_payload = {
    ring_capacity,
    core_residents,
    total_housed,
    pct_of_target:   total_housed / TARGET_POP * 100,
    shortfall:        Math.max(0, TARGET_POP - total_housed),
    density_per_km2:  1e6 * p.floors / p.area_per_person_m2,
    houses_everyone:  total_housed >= TARGET_POP,
  };
  return { output_payload };
}
