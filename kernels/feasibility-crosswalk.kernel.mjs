// nt_feasibility_crosswalk — meta-kernel, buildplan §2.5, NEWTRIPOLI-CHAINS-SPEC.md §3.
// Register: feasibility. guest-legal: NO — transitively uses nt_vat_feasibility's
// Math.pow(10, fidelity) Landauer price; hash-verifiable only, NOT zk-provable in §18.
//
// Contract (HASHWIRE-SPEC §5): compute(policy_parameters) -> { output_payload }.
// Reads only policy_parameters.input_parameters. NEVER hashes, NEVER builds the envelope.
//
// Ingests the union of the physics inputs, calls the five sibling kernels (no inline
// physics — import + delegate), and emits the graded D1..D10 claim ledger per the LOCKED
// §3.2 verdict table (feasibility paper §4–§5). I-JSON safe: emits only labels + small
// numbers (no energy field ≥ 2^53).

import { compute as kineticProbeCompute }     from './kinetic-probe.kernel.mjs';
import { compute as timeDilationCompute }     from './time-dilation.kernel.mjs';
import { compute as vatFeasibilityCompute }   from './vat-feasibility.kernel.mjs';
import { compute as interfaceBandwidthCompute } from './interface-bandwidth.kernel.mjs';
import { compute as commsLagCompute }         from './comms-lag.kernel.mjs';

// Fixture defaults (CHAINS-SPEC §1 baked fields) — input echoes, not physics constants.
const DEFAULTS = {
  cruise_c: 0.10, terminal_approach: 'staged', target: 'terrestrial planet', distance_ly: 7500,
  rate_x: 50, reset_months: 6,
  pop_billions: 8.1, bio_pct: 10, accel: 1, aug_stage: 'vat', digital_fidelity_ops: 20,
  channels: 1024, direction: 'read',
  your_rate_x: 50, their_rate_x: 1000000, latency_ms: 50, variant: 'A',
};

// Severity (worst → best) for binding_verdict (CHAINS-SPEC §3.1).
const SEVERITY = { 'Barred': 4, 'Unfalsifiable': 3, 'Contested': 2, 'Merely-early': 1, 'Permitted': 0 };
const VOCAB = ['Permitted', 'Merely-early', 'Contested', 'Barred', 'Unfalsifiable'];

export function compute(policy_parameters) {
  const p = { ...DEFAULTS, ...policy_parameters.input_parameters };

  // Delegate to the five physics kernels — read only the named gate pointers (§1).
  const probe = kineticProbeCompute({ input_parameters: {
    cruise_c: p.cruise_c, distance_ly: p.distance_ly, terminal_approach: p.terminal_approach, target: p.target,
  } }).output_payload;
  const dilate = timeDilationCompute({ input_parameters: {
    rate_x: p.rate_x, reset_months: p.reset_months,
  } }).output_payload;
  const vat = vatFeasibilityCompute({ input_parameters: {
    pop_billions: p.pop_billions, bio_pct: p.bio_pct, accel: p.accel,
    aug_stage: p.aug_stage, digital_fidelity_ops: p.digital_fidelity_ops,
  } }).output_payload;
  const iface = interfaceBandwidthCompute({ input_parameters: {
    channels: p.channels, direction: p.direction,
  } }).output_payload;
  const comms = commsLagCompute({ input_parameters: {
    your_rate_x: p.your_rate_x, their_rate_x: p.their_rate_x, latency_ms: p.latency_ms,
  } }).output_payload;

  // §3.2 locked verdict table. dynamic entries read a driver pointer; static baselines are constants.
  const ledger = [
    { id: 'C-D1', claim: 'Delivery — decelerate a probe onto a target surface intact',
      verdict: (probe.branch === 'A_vaporized' || probe.branch === 'destroyed_no_surface') ? 'Barred' : 'Merely-early',
      driver: `kinetic_probe./branch=${probe.branch}`, dynamic: true },
    { id: 'C-D2', claim: 'Replication — self-reproducing manufacture at destination',
      verdict: 'Merely-early', driver: 'static baseline (§4.2 closure is engineering, not law)', dynamic: false },
    { id: 'C-D3', claim: 'Vat substrate — sustain biological brains in engineered vats',
      verdict: 'Contested', driver: 'static baseline (§4.3 merely-early)', dynamic: false },
    { id: 'C-D4', claim: 'BCI bandwidth — full-brain read/write interface',
      verdict: iface.interface_complete ? 'Permitted' : 'Merely-early',
      driver: `interface_bandwidth./interface_complete=${iface.interface_complete}`, dynamic: true },
    { id: 'C-D5', claim: 'Temporal acceleration — run subjective time faster than wall-clock',
      verdict: vat.accel_within_ceiling ? 'Permitted' : 'Contested',
      driver: `vat_feasibility./accel_within_ceiling=${vat.accel_within_ceiling}`, dynamic: true },
    { id: 'C-D6', claim: 'Energy & siting — power the population within the Sahara solar cap',
      verdict: vat.verdict === 'feasible' ? 'Permitted' : 'Contested',
      driver: `vat_feasibility./verdict=${vat.verdict}`, dynamic: true },
    { id: 'C-D7', claim: 'Substrate conversion — migrate a mind off biology',
      verdict: dilate.upload_required ? 'Unfalsifiable' : 'Contested',
      driver: `time_dilation./upload_required=${dilate.upload_required}`, dynamic: true },
    { id: 'C-D8', claim: 'ETI motivation — why an alien intelligence would do this',
      verdict: 'Unfalsifiable', driver: 'static baseline (§3 triage / §5 xenopsychology)', dynamic: false },
    { id: 'C-D9', claim: 'Latency — sustain real-time exchange across the tier gap',
      verdict: p.variant === 'A' ? 'Permitted' : 'Contested',
      driver: `comms_lag.variant=${p.variant} (frame_pct=${comms.frame_pct})`, dynamic: true },
    { id: 'C-D10', claim: 'Longevity — biological continuity across the voyage',
      verdict: dilate.upload_required ? 'Barred' : 'Contested',
      driver: `time_dilation./upload_required=${dilate.upload_required}`, dynamic: true },
  ];

  const verdict_counts = { Permitted: 0, 'Merely-early': 0, Contested: 0, Barred: 0, Unfalsifiable: 0 };
  for (const e of ledger) verdict_counts[e.verdict] += 1;

  let binding_verdict = 'Permitted';
  for (const e of ledger) {
    if (SEVERITY[e.verdict] > SEVERITY[binding_verdict]) binding_verdict = e.verdict;
  }

  const output_payload = { ledger, verdict_counts, binding_verdict };
  return { output_payload };
}
