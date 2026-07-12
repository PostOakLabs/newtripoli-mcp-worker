// nt_vat_feasibility kernel — buildplan 1.3, NEWTRIPOLI-L1-KERNELS-SPEC.md §3.
// guest-legal: NO — Math.pow(10, fidelity) for Landauer price; hash-verifiable only, not zk-provable.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Landauer digital-mind pricing + biological load vs Sahara solar cap (feasibility.html render()).
// Break-even (~10^21.8 ops/s) is narrative, not an output; aug_stage/accel_within_ceiling surface
// the canon point that the binding constraint is biology, not the Sahara.

// Vendored from repo/ch-sims/data/canon.js — byte-equal citation values.
// TODO(1.4): canon-sync gate should cover these vendored constants.
const BRAIN_W          = 20;      // canon.js: feasibility.brainWatts
const SUPPORT_OVERHEAD = 3;       // canon.js: feasibility.supportOverhead
const LANDAUER_J       = 3e-21;   // canon.js: feasibility.landauerJ — J per irreversible bit-op ~310 K
const SAHARA_AREA_M2   = 9.2e12;  // canon.js: feasibility.saharaAreaM2
const SAHARA_YIELD_WM2 = 25;      // canon.js: feasibility.saharaYieldWPerM2
const AUG_STAGES       = [        // canon.js: feasibility.augmentation[].{id,ceiling}
  { id: "vat",      ceiling: 2 },
  { id: "sensory",  ceiling: 4 },
  { id: "metabolic", ceiling: 6 },
  { id: "synaptic", ceiling: 50 },
  { id: "hybrid",   ceiling: 5000 },
  { id: "upload",   ceiling: 1e9 },
];
const SAHARA_CAP_W     = SAHARA_AREA_M2 * SAHARA_YIELD_WM2; // ≈ 2.3e14 (230 TW), derived, not a literal

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const pop      = p.pop_billions * 1e9;
  const bioFrac  = p.bio_pct / 100;
  const bioCount = pop * bioFrac;
  const digCount = pop * (1 - bioFrac);
  const bio_W_per_brain    = BRAIN_W * p.accel * SUPPORT_OVERHEAD;
  const digital_W_per_mind = Math.pow(10, p.digital_fidelity_ops) * LANDAUER_J; // ← non-guest-legal
  const total_W    = bioCount * bio_W_per_brain + digCount * digital_W_per_mind;
  const sahara_pct = (total_W / SAHARA_CAP_W) * 100;
  const margin     = SAHARA_CAP_W / total_W;
  const aug        = AUG_STAGES.find(a => a.id === p.aug_stage) || AUG_STAGES[0];

  const output_payload = {
    bio_count:            bioCount,
    digital_count:        digCount,
    bio_W_per_brain,
    digital_W_per_mind,
    total_W,
    sahara_capacity_W:    SAHARA_CAP_W,
    sahara_pct,
    margin,
    verdict:              sahara_pct <= 100 ? 'feasible' : 'over_capacity',
    aug_ceiling_x:        aug.ceiling,
    accel_within_ceiling: p.accel <= aug.ceiling, // the "real ceiling" signal (biology, not power)
  };
  return { output_payload };
}
