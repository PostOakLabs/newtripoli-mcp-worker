// ah_nuclear_program_clock kernel — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §2.
// Register: alt-history. guest-legal: NO — Math.log10 seismic magnitude of runtime yield; hash-verifiable only, NOT zk-provable §18.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Enrichment→timeline physics: actor preset → first-device date + detection signature. Powers the
// structural-rhyme partial-hash (§5.1). Calibration figures are ILLUSTRATIVE/TUNABLE cited to the
// documented record — NOT asserted history (board reframe rule).

// Vendored from data/canon.js CH_CANON.altHistory.nuclearClock — byte-equal citation values.
const NC_START_YEAR   = 1942;  // canon.js: altHistory.nuclearClock.programStartYear — Manhattan order
const NC_CRIT_MASS_KG = 6.0;   // canon.js: altHistory.nuclearClock.criticalMassKg — Pu device order (Fat Man ~6.2)
const NC_PROD_RATE    = 4.0;   // canon.js: altHistory.nuclearClock.fissileProductionKgYr — kg/yr fissile
const NC_LEAD_MONTHS  = 18;    // canon.js: altHistory.nuclearClock.engineeringLeadMonths — design/assembly overhead
const NC_YIELD_KT     = 20;    // canon.js: altHistory.nuclearClock.yieldKt — Trinity order

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const time_to_fissile_years = p.critical_mass_kg / p.fissile_production_kg_yr;
  const months_from_start     = Math.round(p.engineering_lead_months + time_to_fissile_years * 12);
  const first_device_year     = p.program_start_year + Math.floor(months_from_start / 12);
  const seismic_mb            = 4.0 + 0.75 * Math.log10(p.yield_kt);         // Richter-Gutenberg yield relation
  const atmospheric_detectable = p.test_medium === 'atmospheric';           // fallout/airborne debris → AFTAC
  const output_payload = {
    first_device_year,                                     // int
    months_from_start,                                     // int
    time_to_fissile_years,                                 // number
    seismic_mb:            Math.round(seismic_mb * 100) / 100,   // 2-dp, deterministic
    atmospheric_detectable,                                // bool
    detectable: atmospheric_detectable || seismic_mb >= 3.5,     // seismic floor for underground detection
    verdict: 'DEVICE ' + first_device_year + ' · mb ' + (Math.round(seismic_mb * 100) / 100).toFixed(2),
  };
  return { output_payload };
}
