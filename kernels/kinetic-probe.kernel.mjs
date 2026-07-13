// nt_kinetic_probe kernel — buildplan 1.3, NEWTRIPOLI-L1-KERNELS-SPEC.md §2.
// guest-legal: YES — sqrt-only (Lorentz γ); zk-provable in §18 (spec §148 flagship).
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Physics = RELATIVISTIC KE (γ−1)mc² (locked decision 2), which DIFFERS from the sim's
// classical ½mv²; classical value is reported alongside for continuity. vaporization_margin
// stays classical specific-KE ½v²/enthalpy — byte-identical to the sim — because the
// deceleration-lottery chain (spec §5.2) gates on /vaporization_margin >= 1 and must match.

// Vendored from repo/ch-sims/data/canon.js — byte-equal citation values.
// TODO(1.4): canon-sync gate should cover these vendored constants.
const PROBE_MASS_KG = 122;      // canon.js: probe.massKg
const PROBE_VAP_JKG = 4.5e6;    // canon.js: probe.vaporizationJPerKg — osmium vaporization enthalpy
const TERM_V_MS     = 1000;     // canon.js: probe.terminalVMs — staged terminal speed (~1 km/s)
const DIST_LY_LOW   = 5000;     // canon.js: probe.distanceLyLow
const DIST_LY_HIGH  = 10000;    // canon.js: probe.distanceLyHigh
const C_MS          = 2.998e8;  // real-science constant; matches sim CSI, not in canon.js
const SOLID_BODIES  = ["terrestrial planet", "moon", "asteroid", "dwarf planet"]; // canon.js: probe.survives
const NO_SURFACE    = ["gas giant", "star"];                                       // canon.js: probe.destroys

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const beta  = p.cruise_c;                          // v/c
  const v     = beta * C_MS;                          // m/s
  const gamma = 1 / Math.sqrt(1 - beta * beta);       // Lorentz factor (sqrt-only ⇒ guest-legal)
  const cruise_KE_J           = String((gamma - 1) * PROBE_MASS_KG * C_MS * C_MS); // relativistic KE (headline); string per RFC 7493 (>2^53, I-JSON guard)
  const cruise_KE_classical_J = String(0.5 * PROBE_MASS_KG * v * v);               // classical ½mv² (reported); string per RFC 7493 (>2^53, I-JSON guard)
  const travel_yr             = p.distance_ly / beta;                       // ly / (v/c) = years
  const terminal_v_ms         = p.terminal_approach === 'staged' ? TERM_V_MS : v;
  const vaporization_margin   = (0.5 * terminal_v_ms * terminal_v_ms) / PROBE_VAP_JKG; // specific KE vs enthalpy
  const target_is_solid       = SOLID_BODIES.includes(p.target);
  const survives              = target_is_solid && p.terminal_approach === 'staged' && vaporization_margin < 1;
  const branch =
      !target_is_solid          ? 'destroyed_no_surface'
    : vaporization_margin >= 1  ? 'A_vaporized'          // deceleration-lottery gate (spec §5.2)
    :                             'B_survives';

  const output_payload = {
    travel_yr,
    cruise_KE_J,
    cruise_KE_classical_J,
    gamma,
    terminal_v_ms,
    vaporization_margin,
    target_is_solid,
    survives,
    branch,
  };
  return { output_payload };
}
