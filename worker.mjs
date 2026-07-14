// New Tripoli MCP server — Cloudflare Workers runtime.
// Generic dispatch/discovery/hash scaffold. NT physics tools are registered by the
// L1 kernel WUs (buildplan 1.3) into KERNEL_REGISTRY / CHAINS below.
// Data is served from tools-manifest.json via the ASSETS binding (vendored by generate.mjs).
// Deploy: node generate.mjs && npx wrangler deploy
// Endpoint: https://mcp.newtripoli.xyz/mcp

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toReqRes, toFetchResponse } from 'fetch-to-node';
import { z } from 'zod';
import { compute as timeDilationCompute } from './kernels/time-dilation.kernel.mjs';
import { compute as kineticProbeCompute } from './kernels/kinetic-probe.kernel.mjs';
import { compute as vatFeasibilityCompute } from './kernels/vat-feasibility.kernel.mjs';
import { compute as accelerationCeilingCompute } from './kernels/acceleration-ceiling.kernel.mjs';
import { compute as commsLagCompute } from './kernels/comms-lag.kernel.mjs';
import { compute as ringDensityCompute } from './kernels/ring-density.kernel.mjs';
import { compute as birthdaySacrificeCompute } from './kernels/birthday-sacrifice.kernel.mjs';
import { compute as syntheticBodyCompute } from './kernels/synthetic-body.kernel.mjs';
import { compute as selectionCostCompute } from './kernels/selection-cost.kernel.mjs';
import { compute as interfaceBandwidthCompute } from './kernels/interface-bandwidth.kernel.mjs';
import { compute as techTreePathCompute } from './kernels/tech-tree.kernel.mjs';
import { compute as provenanceCompute } from './kernels/provenance.kernel.mjs';
import { compute as feasibilityCrosswalkCompute } from './kernels/feasibility-crosswalk.kernel.mjs';
import { compute as warFinanceDefaultCompute } from './kernels/war-finance.kernel.mjs';
import { compute as nuclearProgramClockCompute } from './kernels/nuclear-clock.kernel.mjs';
import { compute as attributionDecayCompute } from './kernels/attribution-decay.kernel.mjs';
import { compute as injusticeLedgerCompute } from './kernels/injustice-ledger.kernel.mjs';
import { compute as stadiumCapacityCompute } from './kernels/stadium-capacity.kernel.mjs';

export const BASE_URL = 'https://newtripoli.xyz';
const VERSION  = '0.3.0';

// Vendored from data/canon.js CH_CANON.CANON_VERSION. Enters the hash preimage via
// policy_parameters.canon_version (HASHWIRE-SPEC §2), so a canon bump moves every
// tool's golden hash traceably. A canon-sync CI gate (buildplan 1.4) asserts this
// literal byte-equals canon.js's CANON_VERSION so the two runtimes never drift.
// TODO(1.4): wire the canon-sync gate that reads data/canon.js.
const CANON_VERSION = '2026.07.12';

// audit_signature.newtripoli_version (OUTSIDE the hash preimage — HASHWIRE-SPEC §3).
const NT_ARTIFACT_VERSION = '1.0.0';

// OCG Standard §17 (Kernel Identity Binding) — content digest of this file, computed by
// generate.mjs over the LF-normalized source with this line's value replaced by the literal
// 'PLACEHOLDER'. Populated by `node generate.mjs`; idempotent (re-running yields no diff).
const KERNEL_DIGEST = 'sha256:74a0278347b58674bf0bbf390398b2bdf734c832b3866043bbdbf08e83549875';

// Vendored from AINumbers ChainGraph SSOT kernels/_hash.mjs (OCG Standard §4 JCS).
// Namespace adapted for me.newtripoli. Recursive key sort + per-value
// JSON.stringify reproduces RFC 8785 JCS for the I-JSON subset; assertIJson
// fails loud on non-finite / unsafe-int rather than emit an unstable hash.
// This inline block IS the vendored logic (line-for-line equal to lib/_hash.mjs,
// which the browser sims import in 1.5). Do NOT add a second hash path.
function assertIJson(v){
  if(typeof v==='number'){
    if(!Number.isFinite(v))throw new Error('Non-finite number ('+v+') not valid I-JSON (RFC 8785 §3.2.2.3).');
    if(Number.isInteger(v)&&!Number.isSafeInteger(v))throw new Error('Integer '+v+' exceeds 2^53 (RFC 7493).');
  } else if(Array.isArray(v)){ v.forEach(assertIJson); }
  else if(v&&typeof v==='object'){ for(const k of Object.keys(v)) assertIJson(v[k]); }
}
const cgCanon=(v)=>Array.isArray(v)?v.map(cgCanon):(v&&typeof v==='object')?Object.keys(v).sort().reduce((o,k)=>(o[k]=cgCanon(v[k]),o),{}):v;
function canonicalPreimage(policy_parameters,output_payload){
  const obj={policy_parameters,output_payload};
  assertIJson(obj);
  return JSON.stringify(cgCanon(obj));
}
// Bare lowercase hex (OCG §4). No "sha256:" prefix.
async function executionHash(policy_parameters,output_payload){
  const bytes=new TextEncoder().encode(canonicalPreimage(policy_parameters,output_payload));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ---------------------------------------------------------------------------
// Vendored VERBATIM from AINumbers ChainGraph SSOT
// C:\dev\Claude\Projects\AINumbers\repo\chaingraph\kernels\_gateval.mjs
// (OpenChainGraph shared decision-gate evaluator, OCG Standard §21.4+).
// SINGLE SOURCE OF TRUTH for gate evaluation across every ChainGraph-conformant
// executing surface (AINumbers worker, embedded runChain, this worker's run_chain
// below). Do not reimplement — copy the logic exactly; byte-parity matters.
// PURE ECMA-262: no Date, no Math.random, no locale/Intl, no crypto, no I/O.
// ---------------------------------------------------------------------------

// Closed op enum (OCG §21.4). No other operator is valid.
const GATE_OPS = Object.freeze(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'present', 'absent']);
// Ops that carry a comparison `value` (present/absent do not).
const VALUE_OPS = Object.freeze(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in']);

const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Structural strict equality (no coercion). Used by eq/neq/in.
function gv_deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!gv_deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!gv_deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// A valid RFC 6901 JSON Pointer is "" (whole document) or a string of "/"-
// prefixed tokens. Escapes: ~1 -> "/", ~0 -> "~"; a "~" not part of ~0/~1 is
// invalid. Syntax-only (does not resolve). Exported for validate-chains.
function isPointerSyntaxValid(pointer) {
  if (typeof pointer !== 'string') return false;
  if (pointer === '') return true;
  if (pointer[0] !== '/') return false;
  // Every "~" must be immediately followed by "0" or "1".
  return !/~(?![01])/.test(pointer);
}

// Resolve an RFC 6901 pointer against a document.
// Returns { found, value }. found=false when any token is missing / out of
// range / the pointer is syntactically invalid.
function rfc6901(doc, pointer) {
  if (!isPointerSyntaxValid(pointer)) return { found: false, value: undefined };
  if (pointer === '') return { found: true, value: doc };
  const tokens = pointer.slice(1).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const tok of tokens) {
    if (cur === null || typeof cur !== 'object') return { found: false, value: undefined };
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9][0-9]*)$/.test(tok)) return { found: false, value: undefined };
      const idx = Number(tok);
      if (idx >= cur.length) return { found: false, value: undefined };
      cur = cur[idx];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, tok)) return { found: false, value: undefined };
      cur = cur[tok];
    }
  }
  return { found: true, value: cur };
}

// Apply one op. `found` = pointer resolved; `observed` = resolved value.
// Value ops (all but present/absent) require found=true, else no-match.
function applyOp(op, found, observed, value) {
  switch (op) {
    case 'present': return found;
    case 'absent': return !found;
    case 'eq': return found && gv_deepEqual(observed, value);
    case 'neq': return found && !gv_deepEqual(observed, value);
    case 'gt': return found && isFiniteNum(observed) && isFiniteNum(value) && observed > value;
    case 'gte': return found && isFiniteNum(observed) && isFiniteNum(value) && observed >= value;
    case 'lt': return found && isFiniteNum(observed) && isFiniteNum(value) && observed < value;
    case 'lte': return found && isFiniteNum(observed) && isFiniteNum(value) && observed <= value;
    case 'in': return found && Array.isArray(value) && value.some((v) => gv_deepEqual(observed, v));
    default: return false; // unknown op never matches (validate-chains rejects it statically)
  }
}

/**
 * Evaluate a gate against THIS step's output_payload.
 * @param {{input:string, rules:Array<{op:string,value?:any,next:string}>, default:string}} gate
 * @param {object} outputPayload
 * @returns {{input_pointer:string, observed_value:any, matched_rule_index:number|null, op:string|null, value:any, next:string}}
 *   A decision record (minus step_id, which the caller merges in). Deterministic
 *   and recomputable by a verifier from the recorded outputPayload.
 */
function evaluateGate(gate, outputPayload) {
  const { found, value: observed } = rfc6901(outputPayload, gate.input);
  const observed_value = found ? observed : null;
  const rules = Array.isArray(gate.rules) ? gate.rules : [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (applyOp(r.op, found, observed, r.value)) {
      return {
        input_pointer: gate.input,
        observed_value,
        matched_rule_index: i,
        op: r.op,
        value: VALUE_OPS.includes(r.op) ? (r.value === undefined ? null : r.value) : null,
        next: r.next,
      };
    }
  }
  // First-match failed for every rule → mandatory default (total function).
  return {
    input_pointer: gate.input,
    observed_value,
    matched_rule_index: null,
    op: null,
    value: null,
    next: gate.default,
  };
}

// Canonical step identifier: explicit `id`, else the step's tool_id (OCG §21.4).
function stepId(step) {
  return (step && typeof step.id === 'string' && step.id.length) ? step.id : step.tool_id;
}
// ---------------------------------------------------------------------------
// End vendored _gateval.mjs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// base64url-encode a plain object into an #in= fragment value.
// Used to build prefill deep-links for the flagship tools.
// ---------------------------------------------------------------------------
function base64urlEncode(obj) {
  const json = JSON.stringify(obj);
  const b64  = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------------------
// Module-scope cache: assets are immutable per deploy, load once per isolate.
// ---------------------------------------------------------------------------
let dataCache = null;
async function loadData(env) {
  if (dataCache) return dataCache;
  const r = await env.ASSETS.fetch('https://assets.local/tools-manifest.json');
  if (!r.ok) throw new Error('asset miss: tools-manifest.json > ' + r.status);
  dataCache = await r.json();
  return dataCache;
}

// ---------------------------------------------------------------------------
// The canonical NT single-tool wrapper (HASHWIRE-SPEC §5) — DOCUMENTED PATTERN.
// The L1 kernel WUs (buildplan 1.3) register each NT physics tool by following
// this exact shape. It establishes the frozen envelope; 1.2 registers no NT
// physics tool (the 7 legacy inline tool bodies were deleted). Kernels export
// compute(policy_parameters) -> { output_payload } and NEVER hash; the worker
// wrapper owns hashing + envelope assembly.
//
//   server.registerTool('<nt_tool>', { …schema… }, async (args) => {
//     const input_parameters = { /* defaulted, caller-supplied inputs */ };
//     const policyParameters = { execution_backend: 'js', canon_version: CANON_VERSION, input_parameters };
//     const { output_payload: outputPayload } = <slug>Compute(policyParameters);
//     const execHash = await executionHash(policyParameters, outputPayload);   // preimage = {pp, op} ONLY
//     const artifact = {
//       '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
//       chaingraph_version: '0.4.0',
//       buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
//       mandate_type: 'me.newtripoli/<tool>',   // OUTSIDE preimage
//       tool_id: '<slug>', tool_version: '1.0.0',
//       generated_at: new Date().toISOString(),
//       execution_hash: execHash,
//       chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
//       policy_parameters: policyParameters,   // INSIDE preimage
//       output_payload: outputPayload,         // INSIDE preimage
//       compliance_flags: [ /* per tool */ ],
//       audit_signature: {                     // ALL OUTSIDE preimage
//         client_side_executed: true, zero_pii_verified: true, deterministic_run: true,
//         register: '<canon|feasibility|real-science|…>',
//         data_sources: [ /* citations */ ],
//         schema_version: 'nt-chaingraph-0.4.0',
//         newtripoli_version: NT_ARTIFACT_VERSION,
//         permalink: BASE_URL + '/tools/<slug>.html',
//       },
//     };
//     artifact.audit_signature.build_identity = { kernel_digest: KERNEL_DIGEST, buildType: BUILDID_BUILDTYPE, source_ref: 'worker.mjs' };
//     return { content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }], structuredContent: artifact };
//   });
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OCG Standard §21 — run_chain server-side kernel execution.
// KERNEL_REGISTRY maps a tool_id to its compute() + registered mandate_type.
// EMPTY in 1.2 — the L1 kernel WUs (buildplan 1.3) populate it.
// ---------------------------------------------------------------------------
export const KERNEL_REGISTRY = {
  nt_time_dilation: { compute: timeDilationCompute, mandate_type: 'me.newtripoli/time_dilation' },
  nt_kinetic_probe: { compute: kineticProbeCompute, mandate_type: 'me.newtripoli/kinetic_probe' },
  nt_vat_feasibility: { compute: vatFeasibilityCompute, mandate_type: 'me.newtripoli/vat_feasibility' },
  nt_acceleration_ceiling: { compute: accelerationCeilingCompute, mandate_type: 'me.newtripoli/acceleration_ceiling' },
  nt_comms_lag: { compute: commsLagCompute, mandate_type: 'me.newtripoli/comms_lag' },
  nt_ring_density: { compute: ringDensityCompute, mandate_type: 'me.newtripoli/ring_density' },
  nt_birthday_sacrifice: { compute: birthdaySacrificeCompute, mandate_type: 'me.newtripoli/birthday_sacrifice' },
  nt_synthetic_body: { compute: syntheticBodyCompute, mandate_type: 'me.newtripoli/synthetic_body' },
  nt_selection_cost: { compute: selectionCostCompute, mandate_type: 'me.newtripoli/selection_cost' },
  nt_interface_bandwidth: { compute: interfaceBandwidthCompute, mandate_type: 'me.newtripoli/interface_bandwidth' },
  nt_tech_tree_path: { compute: techTreePathCompute, mandate_type: 'me.newtripoli/tech_tree_path' },
  nt_provenance: { compute: provenanceCompute, mandate_type: 'me.newtripoli/provenance' },
  nt_feasibility_crosswalk: { compute: feasibilityCrosswalkCompute, mandate_type: 'me.newtripoli/feasibility_crosswalk' },
  ah_war_finance_default: { compute: warFinanceDefaultCompute, mandate_type: 'me.newtripoli/war_finance_default' },
  ah_nuclear_program_clock: { compute: nuclearProgramClockCompute, mandate_type: 'me.newtripoli/nuclear_program_clock' },
  ah_attribution_decay: { compute: attributionDecayCompute, mandate_type: 'me.newtripoli/attribution_decay' },
  ah_injustice_ledger: { compute: injusticeLedgerCompute, mandate_type: 'me.newtripoli/injustice_ledger' },
  ch_stadium_capacity: { compute: stadiumCapacityCompute, mandate_type: 'me.newtripoli/stadium_capacity' },
};

// ---------------------------------------------------------------------------
// DISCOVERY-SPEC §2.1 — TOOL_META. Presentation-only metadata lifted mechanically
// from each tool's own registerTool block below (title, description first sentence,
// register/guest_legal header comment, audit_signature.permalink/data_sources,
// inputSchema keys, compliance_flags). OUTSIDE every hash preimage — editing this
// block never moves a golden. Consumed only by generate.mjs (never imported at
// request time) to emit data/tools-manifest.json.
// ---------------------------------------------------------------------------
export const TOOL_META = {
  nt_time_dilation: {
    slug: 'time-dilation',
    title: 'New Tripoli time dilation (subjective-year multiplier)',
    description: 'Computes subjective-years-lived multipliers for a given New Tripoli time-dilation rate (subjective years per real calendar year) and Universal Sabbath reset interval.',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/time-dilation.html',
    citations: [
      'Canon - New Tripoli.md §18 (Time Dilation)',
      'Canon - New Tripoli.md §9 (Universal Sabbath)',
      'Feasibility Audit §4.8 (lifespan ceiling)',
    ],
    inputs: ['rate_x', 'reset_months'],
    compliance_flags: ['canon'],
  },
  nt_kinetic_probe: {
    slug: 'kinetic-probe',
    title: 'New Tripoli kinetic probe (relativistic delivery + deceleration lottery)',
    description: 'Computes the cost and survival of an ETI kinetic-probe delivery: travel time, relativistic cruise kinetic energy (γ−1)mc² (with the classical ½mv² reported alongside), and the vaporization margin that gates the deceleration lottery.',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/kinetic-probe.html',
    citations: [
      'Canon - New Tripoli.md (ETI kinetic-probe delivery / probe block)',
      'Feasibility Audit §4.1 (deceleration lottery)',
    ],
    inputs: ['distance_ly', 'cruise_c', 'terminal_approach', 'target'],
    compliance_flags: ['canon', 'feasibility'],
  },
  nt_vat_feasibility: {
    slug: 'feasibility',
    title: 'New Tripoli vat feasibility (Landauer digital-mind pricing vs Sahara cap)',
    description: 'Computes the total power draw of a New Tripoli population split between biological brains (20 W × acceleration × support overhead) and digital minds (Landauer-priced at 10^fidelity irreversible bit-ops/s), then compares it to the Sahara solar cap (~230 TW).',
    register: 'feasibility',
    guest_legal: false,
    permalink_path: 'ch-sims/sims/feasibility.html',
    citations: [
      'Cognitive Husbandry.md — Technical Feasibility (Brain in a Vat)',
      'Canon - New Tripoli.md §26 (90/10 substrate split)',
      'Feasibility Audit §5 (Landauer floor)',
    ],
    inputs: ['pop_billions', 'bio_pct', 'accel', 'aug_stage', 'digital_fidelity_ops'],
    compliance_flags: ['feasibility', 'canon'],
  },
  nt_acceleration_ceiling: {
    slug: 'acceleration-ceiling',
    title: 'New Tripoli acceleration ceiling by augmentation stage',
    description: 'Computes the subjective-time acceleration ceiling for a given New Tripoli augmentation stage (vat / sensory / metabolic / synaptic / hybrid / upload), returning the floor, ceiling, and midpoint of that stage\'s plausible acceleration range, the biological thermal load at the midpoint (20 W × acceleration; null once the stage is non-biological, above 1000×), the subjective years lived at the midpoint over a given wall-clock span, and the stage\'s named bottleneck.',
    register: 'feasibility',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/acceleration-ceiling.html',
    citations: [
      'Cognitive Husbandry.md — Technical Feasibility (augmentation spectrum)',
      'Feasibility Audit §4.8 (acceleration ceiling by substrate)',
    ],
    inputs: ['stage', 'wall_clock_yr'],
    compliance_flags: ['feasibility'],
  },
  nt_comms_lag: {
    slug: 'comms-lag',
    title: 'New Tripoli comms lag between subjective-time rates',
    description: 'Computes round-trip communications lag between two parties running at different subjective-time acceleration rates, given a wall-clock speed-of-light latency.',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/comms-lag.html',
    citations: [
      'Canon - New Tripoli.md §30 (New Centauri — contact-list problem)',
      'Canon - New Tripoli.md §18 (Time Dilation)',
      'Feasibility Audit (alpha-band perceptual frame)',
    ],
    inputs: ['your_rate_x', 'their_rate_x', 'latency_ms'],
    compliance_flags: ['canon', 'feasibility'],
  },
  nt_ring_density: {
    slug: 'ring-density',
    title: 'New Tripoli orbital ring housing density',
    description: 'Computes housing capacity of the New Tripoli orbital ring plus core habitat, given ring depth, per-person area allowance, floor count, and core population.',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/ring-density.html',
    citations: [
      'Canon - New Tripoli.md §5 (ring & housing geometry / population)',
    ],
    inputs: ['ring_depth_m', 'area_per_person_m2', 'floors', 'core_millions'],
    compliance_flags: ['canon'],
  },
  nt_birthday_sacrifice: {
    slug: 'birthday-sacrifice',
    title: 'New Tripoli birthday-sacrifice subjective time cost',
    description: 'Computes the subjective time you and a family member accrue under different simulated dilation rates over a given calendar span, plus the per-year subjective-time cost of the gap and the equivalent number of 6-month Tripoli blocks that cost represents.',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/birthday-sacrifice.html',
    citations: [
      'Canon - New Tripoli.md §18 (Time Dilation / doubling schedules)',
      'Canon - New Tripoli.md §9 (Universal Sabbath cadence)',
    ],
    inputs: ['your_rate_x', 'calendar_yr', 'family_rate_x'],
    compliance_flags: ['canon'],
  },
  nt_synthetic_body: {
    slug: 'synthetic-body',
    title: 'New Tripoli synthetic body mass',
    description: 'Computes the mass (kg and lb), human-mass ratio, and water-buoyancy of a synthetic body skeleton built from a given material, scaled from the canon osmium reference build.',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/synthetic-body.html',
    citations: [
      'Canon - New Tripoli.md §35/§37 (synthetic body / osmium skeleton)',
    ],
    inputs: ['material'],
    compliance_flags: ['canon'],
  },
  nt_selection_cost: {
    slug: 'selection-sorter',
    title: 'New Tripoli selection cost',
    description: 'Computes how many of the 8.1B canon population are excluded (and how many remain) under a named selection criterion for who is offered the mind-upload path (e.g. literacy, wealth, longevity).',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/selection-sorter.html',
    citations: [
      'Cognitive Husbandry.md — The Selection Problem',
      'Canon - New Tripoli.md §5 (population)',
    ],
    inputs: ['criterion'],
    compliance_flags: ['canon'],
  },
  nt_interface_bandwidth: {
    slug: 'interface-bandwidth',
    title: 'New Tripoli brain-interface bandwidth gap',
    description: 'Computes how far a brain-computer interface of a given channel count is from whole-brain bandwidth (~86 billion neurons).',
    register: 'real-science',
    guest_legal: false,
    permalink_path: 'ch-sims/sims/interface-bandwidth.html',
    citations: [
      'Feasibility Audit §4.4 (interface bandwidth / the write problem)',
      'Koch, K. et al. (2006), Current Biology 16(14):1428–1434',
      'Neuralink PRIME study (2024+) — N1, 1,024 electrodes / 64 threads',
    ],
    inputs: ['channels', 'direction'],
    compliance_flags: ['real-science'],
  },
  nt_tech_tree_path: {
    slug: 'tech-tree',
    title: 'New Tripoli post-Wake tech-tree path solver',
    description: 'Solves the post-Wake reindustrialization dependency graph (35 nodes, tiers T0–T9, ending at a femtoscale assembler).',
    register: 'canon',
    guest_legal: true,
    permalink_path: 'ch-sims/sims/tech-tree.html',
    citations: [
      'Canon - New Tripoli.md §34 (resource-management tech tree)',
      'Canon - New Tripoli.md §36 (post-Wake reindustrialization of New Anasis)',
      'Canon - New Tripoli.md §37 (femtoscale assembler)',
    ],
    inputs: ['built', 'target'],
    compliance_flags: ['canon', 'feasibility'],
  },
  nt_provenance: {
    slug: 'about',
    title: 'New Tripoli chaingraph provenance manifest',
    description: 'Emits a tamper-evident ChainGraph provenance manifest for an arbitrary sim run: echoes the declared inputs and canon citations, optionally threads to a parent artifact\'s execution_hash, and reports input/citation counts and parent linkage.',
    register: 'real-science',
    guest_legal: true,
    permalink_path: 'ch-sims/about.html',
    citations: [
      'NEWTRIPOLI-HASHWIRE-SPEC.md §1 (OCG v0.4 artifact envelope)',
      'OpenChainGraph spec v0.4 (chaingraph provenance manifest)',
    ],
    inputs: ['sim_id', 'inputs', 'canon_refs', 'parent_hash'],
    compliance_flags: ['real-science'],
  },
  nt_feasibility_crosswalk: {
    // NOTE: slug is 'feasibility-crosswalk' (NOT the basename of audit_signature.permalink,
    // which is shared with nt_vat_feasibility's feasibility.html — this meta-tool has no page
    // of its own). DISCOVERY-SPEC §5 explicit override to avoid a manifest.tools key collision.
    slug: 'feasibility-crosswalk',
    title: 'New Tripoli feasibility crosswalk (graded D1–D10 claim ledger)',
    description: 'Grades the ten load-bearing feasibility claims (C-D1..C-D10) of the New Tripoli scenario against a single scenario config: delegates to the five physics kernels (kinetic probe, time dilation, vat feasibility, interface bandwidth, comms lag), reads their decision pointers, and emits a ledger of {claim, verdict, driver} plus verdict tallies and the binding (worst) verdict.',
    register: 'feasibility',
    guest_legal: false,
    permalink_path: 'ch-sims/sims/feasibility.html',
    citations: [
      'Feasibility Audit §3 (claim triage), §4 (C-D1..C-D6/D9), §4.8/§5 (C-D7/D10 upload)',
      'Canon - New Tripoli.md §26 (substrate split)',
      'NEWTRIPOLI-CHAINS-SPEC.md §3.2 (locked D1–D10 verdict table)',
    ],
    inputs: [
      'cruise_c', 'terminal_approach', 'target', 'distance_ly', 'rate_x', 'reset_months',
      'pop_billions', 'bio_pct', 'accel', 'aug_stage', 'digital_fidelity_ops', 'channels',
      'direction', 'your_rate_x', 'their_rate_x', 'latency_ms', 'variant',
    ],
    compliance_flags: ['feasibility', 'canon'],
  },
};

// §21.2/§21.4 composite preimage helper — bare-hex SHA-256 over the JCS-
// canonical steps[] definition (used only when the chain has >=1 gate, as the
// route_plan_digest addition to the composite preimage).
async function routePlanDigest(steps) {
  const bytes = new TextEncoder().encode(JSON.stringify(cgCanon(steps)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Named chains (OCG §21.1/§21.4). Mirrored as fixtures under kernels/chains/.
// The six mechanical seq/gated chains (buildplan §2.5 / CHAINS-SPEC §2).
// The meta chain `feasibility-audit-crosswalk` is added by CROSSWALK.build.
// Steps reference KERNEL_REGISTRY tool_ids only; baked `fields` = fixture defaults
// (CHAINS-SPEC §1). Gates read RFC-6901 pointers into the step's output_payload;
// `next`/`default` are forward-only step ids or the 'end' sentinel.
export const CHAINS = {
  // §2.1 — the whole scenario as a 4-step pipeline; no gate, terminal verdict = weakest link.
  'intake-to-arc': {
    title: 'intake-to-arc',
    steps: [
      { id: 'probe',   tool_id: 'nt_kinetic_probe',        fields: { distance_ly: 7500, cruise_c: 0.10, terminal_approach: 'staged', target: 'terrestrial planet' } },
      { id: 'power',   tool_id: 'nt_vat_feasibility',      fields: { pop_billions: 8.1, bio_pct: 10, accel: 1, aug_stage: 'vat', digital_fidelity_ops: 20 } },
      { id: 'dilate',  tool_id: 'nt_time_dilation',        fields: { rate_x: 50, reset_months: 6 } },
      { id: 'thermal', tool_id: 'nt_acceleration_ceiling', fields: { stage: 'vat', wall_clock_yr: 20 } },
    ],
  },

  // §2.2 — the D1 delivery fix as a fast-fail decision. Gate on the kernel's own
  // /branch label (folds in target_is_solid + terminal_approach; do not re-derive).
  'deceleration-lottery': {
    title: 'deceleration-lottery',
    steps: [
      { id: 'probe',  tool_id: 'nt_kinetic_probe', fields: { distance_ly: 7500, cruise_c: 0.10, terminal_approach: 'staged', target: 'terrestrial planet' },
        gate: {
          input: '/branch',
          rules: [
            { op: 'eq', value: 'A_vaporized',          next: 'end' },
            { op: 'eq', value: 'destroyed_no_surface', next: 'end' },
          ],
          default: 'anchor', // B_survives → continue
        } },
      { id: 'anchor', tool_id: 'nt_provenance', fields: { sim_id: 'nt_kinetic_probe', inputs: {}, canon_refs: ['C-D1'], parent_hash: null } },
    ],
  },

  // §2.3 — the D10 → D7 hinge: biological continuity vs upload.
  'substrate-decision': {
    title: 'substrate-decision',
    steps: [
      { id: 'dilate', tool_id: 'nt_time_dilation', fields: { rate_x: 50, reset_months: 6 },
        gate: {
          input: '/upload_required',
          rules: [ { op: 'eq', value: false, next: 'end' } ], // A_biological_holds
          default: 'upload',                                   // true → B_upload_required
        } },
      { id: 'upload', tool_id: 'nt_provenance', fields: { sim_id: 'nt_time_dilation', inputs: {}, canon_refs: ['C-D7', 'C-D10'], parent_hash: null } },
    ],
  },

  // §2.4 — "can it actually run": returns the binding constraint (power vs interface vs thermal).
  'energy-envelope': {
    title: 'energy-envelope',
    steps: [
      { id: 'power',     tool_id: 'nt_vat_feasibility', fields: { pop_billions: 8.1, bio_pct: 10, accel: 1, aug_stage: 'vat', digital_fidelity_ops: 20 },
        gate: {
          input: '/sahara_pct',
          rules: [ { op: 'lte', value: 100, next: 'interface' } ], // feasible → continue
          default: 'end',                                          // over_capacity → binding constraint = POWER
        } },
      { id: 'interface', tool_id: 'nt_interface_bandwidth',  fields: { channels: 1024, direction: 'read' } },
      { id: 'thermal',   tool_id: 'nt_acceleration_ceiling', fields: { stage: 'vat', wall_clock_yr: 20 } },
    ],
  },

  // §2.5 — the physics of friendship: two dilated parties + the comms budget across the gap.
  'friendship-across-tiers': {
    title: 'friendship-across-tiers',
    steps: [
      { id: 'you',   tool_id: 'nt_time_dilation', fields: { rate_x: 50,      reset_months: 6 } },
      { id: 'them',  tool_id: 'nt_time_dilation', fields: { rate_x: 1000000, reset_months: 6 } },
      { id: 'comms', tool_id: 'nt_comms_lag',     fields: { your_rate_x: 50, their_rate_x: 1000000, latency_ms: 50 } },
    ],
  },

  // §2.6 — the OCG backbone every other chain terminates into (any tool → provenance anchor).
  'provenance-anchor': {
    title: 'provenance-anchor',
    steps: [
      { id: 'source', tool_id: 'nt_time_dilation', fields: { rate_x: 50, reset_months: 6 } },
      { id: 'anchor', tool_id: 'nt_provenance',    fields: { sim_id: 'nt_time_dilation', inputs: {}, canon_refs: ['provenance'], parent_hash: null } },
    ],
  },

  // §3.3 — the meta fan-in: grade all D1..D10 claims, then anchor unless the config is Barred.
  'feasibility-audit-crosswalk': {
    title: 'feasibility-audit-crosswalk',
    steps: [
      { id: 'grade', tool_id: 'nt_feasibility_crosswalk',
        fields: { cruise_c: 0.10, terminal_approach: 'staged', target: 'terrestrial planet', distance_ly: 7500,
                  rate_x: 50, reset_months: 6, pop_billions: 8.1, bio_pct: 10, accel: 1, aug_stage: 'vat',
                  digital_fidelity_ops: 20, channels: 1024, direction: 'read',
                  your_rate_x: 50, their_rate_x: 1000000, latency_ms: 50, variant: 'A' },
        gate: {
          input: '/binding_verdict',
          rules: [ { op: 'eq', value: 'Barred', next: 'end' } ], // barred config → stop, do not anchor a "passing" run
          default: 'anchor',
        } },
      { id: 'anchor', tool_id: 'nt_provenance',
        fields: { sim_id: 'nt_feasibility_crosswalk', inputs: {},
                  canon_refs: ['C-D1', 'C-D4', 'C-D5', 'C-D6', 'C-D7', 'C-D9', 'C-D10'], parent_hash: null } },
    ],
  },
};

// ---------------------------------------------------------------------------
// DISCOVERY-SPEC §2.1 — CHAIN_META. Presentation + per-step deep-link overlay for
// the 7 CHAINS above. Do NOT add these fields onto CHAINS steps — routePlanDigest
// hashes JSON.stringify(cgCanon(steps)), so mutating step shape would move frozen
// chain-goldens. `register` = the register of each chain's first step's tool
// (mirrors `entry_tool_id`, a deterministic tie-break — no per-chain judgment call).
// `tier` is 'L2' for the 6 mechanical seq/gated chains, 'meta' for the D1-D10
// crosswalk fan-in. `page` is null for all 7 — no ch-sims page currently embeds a
// live chain widget (that pattern is EXPLAINER-TEMPLATE-SPEC's embedded-live-chain-
// widget track, sequenced separately). OUTSIDE every hash preimage.
// ---------------------------------------------------------------------------
export const CHAIN_META = {
  'intake-to-arc': {
    title: 'Intake to arc',
    description: 'The whole scenario as a 4-step delivery→power→dilation→thermal pipeline; no gate, terminal verdict = weakest link.',
    register: 'canon',
    tier: 'L2',
    page: null,
    steps: [
      { tool_id: 'nt_kinetic_probe',        slug: 'kinetic-probe',        handoff: 'Export the probe result, then open step 2 (power).' },
      { tool_id: 'nt_vat_feasibility',      slug: 'feasibility',          handoff: 'Export the power result, then open step 3 (dilation).' },
      { tool_id: 'nt_time_dilation',        slug: 'time-dilation',        handoff: 'Export the dilation result, then open step 4 (thermal).' },
      { tool_id: 'nt_acceleration_ceiling', slug: 'acceleration-ceiling', handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
  'deceleration-lottery': {
    title: 'Deceleration lottery',
    description: 'The D1 delivery fix as a fast-fail decision: gates on the kinetic probe\'s own /branch label (vaporized/destroyed → end; survives → anchor provenance).',
    register: 'canon',
    tier: 'L2',
    page: null,
    steps: [
      { tool_id: 'nt_kinetic_probe', slug: 'kinetic-probe', handoff: 'If the probe survives (B_survives), export and open step 2 to anchor provenance. A vaporized/destroyed branch ends the chain here.' },
      { tool_id: 'nt_provenance',    slug: 'about',         handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
  'substrate-decision': {
    title: 'Substrate decision',
    description: 'The D10 → D7 hinge: gates on time dilation\'s /upload_required flag (biological holds → end; upload required → anchor provenance).',
    register: 'canon',
    tier: 'L2',
    page: null,
    steps: [
      { tool_id: 'nt_time_dilation', slug: 'time-dilation', handoff: 'If upload_required is true, export and open step 2 to anchor provenance. A_biological_holds ends the chain here.' },
      { tool_id: 'nt_provenance',    slug: 'about',         handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
  'energy-envelope': {
    title: 'Energy envelope',
    description: '"Can it actually run": gates on vat feasibility\'s /sahara_pct (over capacity → end, binding constraint = power; feasible → interface, then thermal).',
    register: 'feasibility',
    tier: 'L2',
    page: null,
    steps: [
      { tool_id: 'nt_vat_feasibility',      slug: 'feasibility',          handoff: 'If Sahara capacity is exceeded, the chain ends here (binding constraint = power). Otherwise export and open step 2 (interface).' },
      { tool_id: 'nt_interface_bandwidth',  slug: 'interface-bandwidth',  handoff: 'Export the interface result, then open step 3 (thermal).' },
      { tool_id: 'nt_acceleration_ceiling', slug: 'acceleration-ceiling', handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
  'friendship-across-tiers': {
    title: 'Friendship across tiers',
    description: 'The physics of friendship: two dilated parties running at different subjective-time rates, plus the comms budget across the gap.',
    register: 'canon',
    tier: 'L2',
    page: null,
    steps: [
      { tool_id: 'nt_time_dilation', slug: 'time-dilation', handoff: 'Export your dilation result, then open step 2 for the other party.' },
      { tool_id: 'nt_time_dilation', slug: 'time-dilation', handoff: 'Export their dilation result, then open step 3 (comms lag).' },
      { tool_id: 'nt_comms_lag',     slug: 'comms-lag',     handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
  'provenance-anchor': {
    title: 'Provenance anchor',
    description: 'The OCG backbone every other chain terminates into: any tool\'s run, threaded to a provenance-manifest anchor.',
    register: 'canon',
    tier: 'L2',
    page: null,
    steps: [
      { tool_id: 'nt_time_dilation', slug: 'time-dilation', handoff: 'Export the source result, then open step 2 to anchor provenance.' },
      { tool_id: 'nt_provenance',    slug: 'about',         handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
  'feasibility-audit-crosswalk': {
    title: 'Feasibility audit crosswalk',
    description: 'The meta fan-in: grades all C-D1..C-D10 claims against a single scenario config, then anchors provenance unless the binding verdict is Barred.',
    register: 'feasibility',
    tier: 'meta',
    page: null,
    steps: [
      { tool_id: 'nt_feasibility_crosswalk', slug: 'feasibility-crosswalk', handoff: 'If the binding_verdict is Barred, the chain ends here (do not anchor a "passing" run). Otherwise export and open step 2 to anchor provenance.' },
      { tool_id: 'nt_provenance',            slug: 'about',                 handoff: 'Final step — export the Policy Mandate for your audit trail.' },
    ],
  },
};

// ---------------------------------------------------------------------------
// runChain — OCG §21 linear-model chain executor with §21.4 decision gates.
// steps: [{ tool_id, id?, fields?, gate? }]
// Returns { steps: perStepResults[], composite_execution_hash, path_taken,
//           decisions, chain_title, step_count }.
// ---------------------------------------------------------------------------
export async function runChain(chainTitle, steps) {
  const hasGate = steps.some((s) => !!s.gate);

  // id -> index map for forward jumps ('end' is a sentinel, not a step id).
  const idToIndex = new Map();
  steps.forEach((s, i) => idToIndex.set(stepId(s, i), i));

  const perStep = new Array(steps.length).fill(null);
  const decisions = [];
  const pathTaken = [];
  const ranToolIds = [];
  const ranArtifacts = []; // { tool_id, mandate_type, execution_hash, output_payload }

  let prevHash = null;
  let prevToolId = null;
  let cursor = 0;
  let stopped = false;

  while (cursor !== null && cursor < steps.length && !stopped) {
    const step = steps[cursor];
    const sId = stepId(step, cursor);
    const entry = KERNEL_REGISTRY[step.tool_id];

    if (!entry) {
      // Unknown tool_id -> status unknown_node; does not advance parent threading.
      perStep[cursor] = {
        id: sId,
        tool_id: step.tool_id,
        status: 'unknown_node',
      };
      cursor = cursor + 1;
      continue;
    }

    // canon_version enters the preimage (HASHWIRE-SPEC §2/§5) so chain-step and
    // single-tool hashes agree for identical inputs.
    const policyParameters = { execution_backend: 'js', canon_version: CANON_VERSION, input_parameters: step.fields ?? {} };
    const { output_payload: outputPayload } = entry.compute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const stepArtifact = {
      tool_id:            step.tool_id,
      mandate_type:       entry.mandate_type,
      execution_hash:     execHash,
      chain: {
        parent_hashes:   prevHash ? [prevHash] : [],
        parent_tool_ids: prevToolId ? [prevToolId] : [],
        chain_depth:     cursor,
      },
      policy_parameters:  policyParameters,
      output_payload:     outputPayload,
    };

    perStep[cursor] = { id: sId, status: 'ok', artifact: stepArtifact };
    pathTaken.push(sId);
    ranToolIds.push(step.tool_id);
    ranArtifacts.push({
      tool_id:        step.tool_id,
      mandate_type:   entry.mandate_type,
      execution_hash: execHash,
      output_payload: outputPayload,
    });

    prevHash = execHash;
    prevToolId = step.tool_id;

    if (step.gate) {
      const decision = evaluateGate(step.gate, outputPayload);
      decision.step_id = sId;
      decisions.push(decision);

      if (decision.next === 'end') {
        stopped = true;
        // Mark all remaining, not-yet-visited steps as skipped_by_gate.
        for (let j = cursor + 1; j < steps.length; j++) {
          if (perStep[j] === null) perStep[j] = { id: stepId(steps[j], j), status: 'skipped_by_gate' };
        }
        cursor = null;
        break;
      }

      const nextIdx = idToIndex.get(decision.next);
      if (nextIdx === undefined) {
        // Should not happen for a validated chain (forward-only next); treat as end.
        stopped = true;
        cursor = null;
        break;
      }
      // Mark every step strictly between cursor and nextIdx (forward-only) as
      // skipped_by_gate — they are jumped over and do NOT run.
      for (let j = cursor + 1; j < nextIdx; j++) {
        if (perStep[j] === null) perStep[j] = { id: stepId(steps[j], j), status: 'skipped_by_gate' };
      }
      cursor = nextIdx;
    } else {
      cursor = cursor + 1;
    }
  }

  // Any steps never visited (e.g. branch not taken, chain ended early without
  // a gate reaching them) are skipped_by_gate too.
  for (let j = 0; j < steps.length; j++) {
    if (perStep[j] === null) perStep[j] = { id: stepId(steps[j], j), status: 'skipped_by_gate' };
  }

  let compositeHash = null;
  if (ranArtifacts.length > 0) {
    const pp = {
      compute_mode: 'server',
      chain: { name: chainTitle, steps },
      chain_title: chainTitle,
      step_count: ranArtifacts.length,
      step_tool_ids: ranToolIds,
    };
    const op = {
      chain: { name: chainTitle, steps },
      steps: ranArtifacts,
    };
    if (hasGate) {
      pp.route_plan_digest = await routePlanDigest(steps);
      op.decisions = decisions;
      op.path_taken = pathTaken;
    }
    compositeHash = await executionHash(pp, op);
  }

  return {
    chain_title: chainTitle,
    step_count: steps.length,
    ran_count: ranArtifacts.length,
    steps: perStep,
    path_taken: pathTaken,
    decisions,
    composite_execution_hash: compositeHash,
  };
}

// Vendored verbatim from AINumbers mcp-apps-poc/worker.mjs (bm25Search @808) —
// DISCOVERY-SPEC §6. Workers-runtime safe (no Node APIs). Scores manifest.search.
// {tools,chains} indexes (built by generate.mjs's buildBM25, same formula).
function bm25Search(query, index, { k1 = 1.2, b = 0.75, topN = 5 } = {}) {
  const terms = query.toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  if (!terms.length) return index.docs.slice(0, topN).map(d => ({ ...d, _score: 0 }));
  const { docs, tfs, docLengths, avgDocLength, idf } = index;
  const scores = new Array(docs.length).fill(0);
  for (const t of terms) {
    const idfScore = idf[t] ?? 0;
    if (!idfScore) continue;
    for (let i = 0; i < docs.length; i++) {
      const tf = tfs[i][t] ?? 0;
      if (!tf) continue;
      scores[i] += idfScore * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLengths[i] / avgDocLength));
    }
  }
  return docs
    .map((doc, i) => ({ ...doc, _score: scores[i] }))
    .filter(d => d._score > 0)
    .sort((a, b2) => b2._score - a._score)
    .slice(0, topN);
}

// ---------------------------------------------------------------------------
// buildServer — called per request; manifest already loaded + cached.
// Registers the generic dispatch/discovery/hash tools only. NT physics tools
// are added by buildplan 1.3.
// ---------------------------------------------------------------------------
function buildServer(manifest) {
  const server = new McpServer({ name: 'newtripoli-mcp', version: VERSION });
  const tools  = manifest.tools  ?? {};
  const chains = manifest.chains ?? {};

  // Flagship tools (those in the manifest) have prefill hooks wired.
  const prefillEnabled = new Set(Object.keys(tools));
  const CHAIN_NAMES    = Object.keys(chains);

  // -------------------------------------------------------------------------
  // list_newtripoli_tools — manifest-backed tool discovery.
  // -------------------------------------------------------------------------
  server.registerTool('list_newtripoli_tools', {
    title: 'List New Tripoli tools',
    description:
      'Search the New Tripoli interactive instrument suite. ' +
      'Returns deep-links to client-side browser tools at newtripoli.xyz. ' +
      'Flagship tools are prefill-enabled: append #in=<base64url(JSON)> to ' +
      'the URL and the tool opens pre-filled with those parameter values. ' +
      'Filter by category or epistemic register. All physics logic runs ' +
      'deterministically in the user\'s browser; zero server-side execution.',
    inputSchema: {
      query:    z.string().optional().describe('Free-text search against tool title and description'),
      category: z.string().optional().describe('Filter by category'),
      register: z.string().optional().describe('Filter by epistemic register'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ query, category, register, limit }) => {
    const q = (query ?? '').toLowerCase();
    const rows = Object.entries(tools)
      .filter(([, t]) => !category || t.category === category)
      .filter(([, t]) => !register  || t.register  === register)
      .filter(([slug, t]) =>
        !q || (t.title + ' ' + t.description).toLowerCase().includes(q)
      )
      .slice(0, limit ?? 20)
      .map(([slug, t]) => ({
        slug,
        tool_id:  t.tool_id,
        mandate:  t.mandate,
        title:    t.title,
        category: t.category,
        register: t.register,
        guest_legal: t.guest_legal,
        prefill:  true,
        url:      BASE_URL + '/' + t.path,
        description: t.description.slice(0, 180),
        inputs:   t.inputs ?? [],
        hashNote: t.hashNote ?? null,
        citations: t.citations ?? [],
      }));
    return {
      content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
      structuredContent: { count: rows.length, tools: rows },
    };
  });

  // -------------------------------------------------------------------------
  // build_workflow_links — manifest-backed deep-link builder.
  // -------------------------------------------------------------------------
  server.registerTool('build_workflow_links', {
    title: 'Build New Tripoli workflow deep-links',
    description:
      'Constructs an ordered set of ready-to-use deep-links for a named New Tripoli scenario or ' +
      'workflow chain, or an ad-hoc sequence of tools. Each link points to the browser tool at ' +
      'newtripoli.xyz. Flagship tools accept #in=<base64url(JSON)> prefill fragments — pass input ' +
      'values as a fields object to receive a pre-filled URL. All physics logic runs ' +
      'deterministically in the user\'s browser; zero server-side execution. ' +
      'Named chains (' + CHAIN_NAMES.length + ' total): ' + CHAIN_NAMES.join(', ') + '.',
    inputSchema: {
      chain: z.string().optional().describe(
        'Name of a pre-defined scenario or workflow chain. ' +
        'One of: ' + CHAIN_NAMES.join(', ') + '. ' +
        'Mutually exclusive with steps.'
      ),
      steps: z.array(z.object({
        tool: z.string().describe('Tool slug'),
        fields: z.record(z.any()).optional().describe(
          'Input values encoded as #in= fragment when the tool is prefill-enabled.'
        ),
      })).optional().describe('Ad-hoc ordered step list. Mutually exclusive with chain.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ chain, steps }) => {
    // Validate mutual exclusivity
    if (chain && steps) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Provide either chain or steps, not both.' }],
      };
    }

    let chainMeta = null;
    let rawSteps;

    if (chain) {
      chainMeta = chains[chain];
      if (!chainMeta) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Unknown chain "' + chain + '". Available: ' + CHAIN_NAMES.join(', ') }],
        };
      }
      rawSteps = chainMeta.steps.map((s) => ({
        tool: s.tool, fields: undefined, _handoff: s.handoff,
      }));
    } else if (steps && steps.length > 0) {
      rawSteps = steps.map((s) => ({ tool: s.tool, fields: s.fields, _handoff: null }));
    } else {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Provide chain (named) or steps (ad-hoc array of {tool, fields?}).' }],
      };
    }

    const warnings = [];
    const result   = [];

    for (let i = 0; i < rawSteps.length; i++) {
      const rs       = rawSteps[i];
      const slug     = rs.tool;
      const toolMeta = tools[slug];

      // Flagship tools use the manifest path; others get the conventional URL
      let url = toolMeta
        ? BASE_URL + '/' + toolMeta.path
        : BASE_URL + '/tools/' + slug + '.html';

      const prefill = prefillEnabled.has(slug);

      if (rs.fields && Object.keys(rs.fields).length > 0) {
        if (!prefill) {
          warnings.push(
            'Step ' + (i + 1) + ' (' + slug + '): fields provided but this tool is ' +
            'not a flagship prefill tool — fields ignored.'
          );
        } else {
          url = url + '#in=' + base64urlEncode(rs.fields);
        }
      }

      const handoff_note = rs._handoff
        ?? (i < rawSteps.length - 1
          ? 'Export results from this tool, then open step ' + (i + 2) + '.'
          : 'Final step.');

      result.push({
        order:       i + 1,
        tool:        slug,
        title:       toolMeta?.title ?? slug,
        url,
        prefill,
        handoff_note,
      });
    }

    const output = {
      chain:      chain ?? null,
      title:      chainMeta?.title  ?? null,
      tier:       chainMeta?.tier   ?? null,
      register:   chainMeta?.register ?? null,
      chain_page: chainMeta?.page   ? BASE_URL + '/' + chainMeta.page : null,
      steps: result,
      warnings,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  });

  // -------------------------------------------------------------------------
  // find_tool / find_chain — DISCOVERY-SPEC §3.2/§3.3. BM25 discovery layer over
  // manifest.search.{tools,chains} (precomputed by generate.mjs). Vendored
  // register shape from AINumbers mcp-apps-poc/worker.mjs find_tool/find_chain
  // @2072-2097, NT-swapped to the tool/chain counts + cross-references.
  // -------------------------------------------------------------------------
  const search = manifest.search ?? { tools: { docs: [] }, chains: { docs: [] } };

  server.registerTool('find_tool', {
    title: 'Find New Tripoli tool',
    description:
      'BM25 search over all ' + Object.keys(tools).length + ' New Tripoli MCP tools. ' +
      'Returns ranked tools with tool_id, mandate, register, guest_legal flag, and deep-link URL. ' +
      'Use to locate a specific instrument (e.g. "time dilation", "kinetic probe delivery", ' +
      '"vat feasibility power draw", "selection cost") before calling it or opening its deep-link. ' +
      'Complements find_chain (chain-level) and list_newtripoli_tools (catalog-level).',
    inputSchema: {
      query: z.string().describe('Natural-language or keyword search (e.g. "time dilation", "brain interface bandwidth", "tech tree").'),
      top_n: z.number().min(1).max(20).optional().describe('Max results to return (default 5).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ query, top_n }) => {
    const results = bm25Search(query, search.tools, { topN: top_n ?? 5 });
    if (!results.length) {
      return {
        content: [{ type: 'text', text: 'No tools matched "' + query + '". Try find_chain for workflow-level search or list_newtripoli_tools for the full catalog.' }],
        structuredContent: { query, result_count: 0, tools: [], hint: 'No matches — try find_chain or list_newtripoli_tools.' },
      };
    }
    const out = results.map(({ _score, ...r }) => ({ ...r, relevance_score: Math.round(_score * 1000) / 1000 }));
    return {
      content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
      structuredContent: { query, result_count: out.length, tools: out },
    };
  });

  server.registerTool('find_chain', {
    title: 'Find New Tripoli workflow chain',
    description:
      'BM25 search over all ' + CHAIN_NAMES.length + ' New Tripoli scenario chains. ' +
      'Returns ranked chains with their full recipe: ordered step sequence, deep-links, and handoff notes. ' +
      'Agent flow: find_chain(query) → read recipe → either call run_chain(chain=<chain_name>) for ' +
      'server-side execution, or open each step\'s url in order (browser tools), threading each step\'s ' +
      'execution_hash into the next as parent_hashes. Verify any artifact with verify_execution_hash.',
    inputSchema: {
      query: z.string().describe('Natural-language or keyword search (e.g. "deceleration lottery", "upload decision", "feasibility crosswalk").'),
      top_n: z.number().min(1).max(20).optional().describe('Max results to return (default 5).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ query, top_n }) => {
    const results = bm25Search(query, search.chains, { topN: top_n ?? 5 });
    if (!results.length) {
      return {
        content: [{ type: 'text', text: 'No chains matched "' + query + '". Try find_tool for individual tool search or list_newtripoli_tools for the full catalog.' }],
        structuredContent: { query, result_count: 0, chains: [], hint: 'No matches — try find_tool or list_newtripoli_tools.' },
      };
    }
    const out = results.map(({ _score, ...r }) => ({ ...r, relevance_score: Math.round(_score * 1000) / 1000 }));
    return {
      content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
      structuredContent: {
        query,
        result_count: out.length,
        chains: out,
        usage: 'Run server-side with run_chain(chain=<chain_name>), or open each step\'s url in order (browser tools); thread each step\'s execution_hash into the next as parent_hashes; verify any artifact with verify_execution_hash.',
      },
    };
  });

  // -------------------------------------------------------------------------
  // nt_time_dilation — buildplan 1.3, NEWTRIPOLI-L1-KERNELS-SPEC.md §1.
  // Register: canon. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_time_dilation', {
    title: 'New Tripoli time dilation (subjective-year multiplier)',
    description:
      'Computes subjective-years-lived multipliers for a given New Tripoli time-dilation rate ' +
      '(subjective years per real calendar year) and Universal Sabbath reset interval. Flags whether ' +
      'the rate exceeds the ~122-yr biological neuronal lifespan ceiling (upload required). Pure ' +
      'multiply/divide/compare arithmetic — deterministic, guest-legal (zk-provable in §18).',
    inputSchema: {
      rate_x: z.number().min(1).max(1e9).default(50).describe(
        'Subjective years lived per real calendar year (New Tripoli series ceiling; canon default 50).'
      ),
      reset_months: z.union([z.literal(6), z.literal(12)]).default(6).describe(
        'Months between Universal Sabbath resets (canon default 6).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ rate_x, reset_months }) => {
    const input_parameters = {
      rate_x:       rate_x ?? 50,
      reset_months: reset_months ?? 6,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = timeDilationCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/time_dilation',
      tool_id: 'nt-time-dilation',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md §18 (Time Dilation)',
          'Canon - New Tripoli.md §9 (Universal Sabbath)',
          'Feasibility Audit §4.8 (lifespan ceiling)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/time-dilation.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_kinetic_probe — buildplan 1.3, NEWTRIPOLI-L1-KERNELS-SPEC.md §2.
  // Register: canon + feasibility. Guest-legal: YES (sqrt-only).
  // Physics = RELATIVISTIC (γ−1)mc²; classical ½mv² reported alongside.
  // -------------------------------------------------------------------------
  server.registerTool('nt_kinetic_probe', {
    title: 'New Tripoli kinetic probe (relativistic delivery + deceleration lottery)',
    description:
      'Computes the cost and survival of an ETI kinetic-probe delivery: travel time, relativistic ' +
      'cruise kinetic energy (γ−1)mc² (with the classical ½mv² reported alongside), and the ' +
      'vaporization margin that gates the deceleration lottery. A passive relativistic impact ' +
      'vaporizes the osmium slug deterministically; only a staged deceleration to ~1 km/s lets it ' +
      'survive a solid-body impact. sqrt-only arithmetic — deterministic, guest-legal (zk-provable in §18).',
    inputSchema: {
      distance_ly: z.number().min(5000).max(10000).default(7500).describe(
        'ETI distance in light-years (canon range 5,000–10,000; default midpoint 7,500).'
      ),
      cruise_c: z.number().gt(0).max(0.90).default(0.10).describe(
        'Cruise speed as a fraction of c (default 0.10).'
      ),
      terminal_approach: z.enum(['passive', 'staged']).default('staged').describe(
        'Terminal approach: passive impact at cruise speed, or staged deceleration to ~1 km/s (canon default staged).'
      ),
      target: z.enum([
        'terrestrial planet', 'moon', 'asteroid', 'dwarf planet', 'gas giant', 'star',
      ]).default('terrestrial planet').describe(
        'Target body class (canon default terrestrial planet).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ distance_ly, cruise_c, terminal_approach, target }) => {
    const input_parameters = {
      distance_ly:       distance_ly ?? 7500,
      cruise_c:          cruise_c ?? 0.10,
      terminal_approach: terminal_approach ?? 'staged',
      target:            target ?? 'terrestrial planet',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = kineticProbeCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/kinetic_probe',
      tool_id: 'nt-kinetic-probe',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon', 'feasibility'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md (ETI kinetic-probe delivery / probe block)',
          'Feasibility Audit §4.1 (deceleration lottery)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/kinetic-probe.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_vat_feasibility — buildplan 1.3, NEWTRIPOLI-L1-KERNELS-SPEC.md §3.
  // Register: feasibility + canon. Guest-legal: NO (Math.pow ⇒ hash-verifiable only).
  // -------------------------------------------------------------------------
  server.registerTool('nt_vat_feasibility', {
    title: 'New Tripoli vat feasibility (Landauer digital-mind pricing vs Sahara cap)',
    description:
      'Computes the total power draw of a New Tripoli population split between biological brains ' +
      '(20 W × acceleration × support overhead) and digital minds (Landauer-priced at 10^fidelity ' +
      'irreversible bit-ops/s), then compares it to the Sahara solar cap (~230 TW). Returns the ' +
      'percentage of Sahara capacity used, the headroom margin, a feasibility verdict, and whether ' +
      'the requested acceleration sits within the augmentation stage ceiling — the canon point that ' +
      'the binding constraint is biology, not power. Uses Math.pow for the Landauer price: ' +
      'hash-verifiable only, not guest-legal / not zk-provable.',
    inputSchema: {
      pop_billions: z.number().min(1).max(10).default(8.1).describe(
        'Total population in billions (canon default 8.1).'
      ),
      bio_pct: z.number().min(0).max(100).default(10).describe(
        'Percentage of the population that is biological (canon default 10 — the 90/10 split).'
      ),
      accel: z.number().int().min(1).max(50).default(1).describe(
        'Subjective-time acceleration factor applied to biological metabolic load (default 1).'
      ),
      aug_stage: z.enum(['vat', 'sensory', 'metabolic', 'synaptic', 'hybrid', 'upload']).default('vat').describe(
        'Augmentation stage whose biological acceleration ceiling is checked (canon default vat).'
      ),
      digital_fidelity_ops: z.number().int().min(18).max(25).default(20).describe(
        'Exponent of 10 for digital-mind irreversible bit-ops per second (default 20).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ pop_billions, bio_pct, accel, aug_stage, digital_fidelity_ops }) => {
    const input_parameters = {
      pop_billions:         pop_billions ?? 8.1,
      bio_pct:              bio_pct ?? 10,
      accel:                accel ?? 1,
      aug_stage:            aug_stage ?? 'vat',
      digital_fidelity_ops: digital_fidelity_ops ?? 20,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = vatFeasibilityCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/vat_feasibility',
      tool_id: 'nt-vat-feasibility',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['feasibility', 'canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'feasibility',
        data_sources: [
          'Cognitive Husbandry.md — Technical Feasibility (Brain in a Vat)',
          'Canon - New Tripoli.md §26 (90/10 substrate split)',
          'Feasibility Audit §5 (Landauer floor)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/feasibility.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_acceleration_ceiling — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §1.
  // Register: feasibility. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_acceleration_ceiling', {
    title: 'New Tripoli acceleration ceiling by augmentation stage',
    description:
      'Computes the subjective-time acceleration ceiling for a given New Tripoli augmentation stage ' +
      '(vat / sensory / metabolic / synaptic / hybrid / upload), returning the floor, ceiling, and ' +
      'midpoint of that stage\'s plausible acceleration range, the biological thermal load at the ' +
      'midpoint (20 W × acceleration; null once the stage is non-biological, above 1000×), the ' +
      'subjective years lived at the midpoint over a given wall-clock span, and the stage\'s named ' +
      'bottleneck. Pure average/multiply/compare — guest-legal, zk-provable.',
    inputSchema: {
      stage: z.enum(['vat', 'sensory', 'metabolic', 'synaptic', 'hybrid', 'upload']).default('vat').describe(
        'Augmentation stage (canon default vat).'
      ),
      wall_clock_yr: z.number().min(1).max(40).default(20).describe(
        'Real (wall-clock) years elapsed (default 20).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ stage, wall_clock_yr }) => {
    const input_parameters = {
      stage:         stage ?? 'vat',
      wall_clock_yr: wall_clock_yr ?? 20,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = accelerationCeilingCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/acceleration_ceiling',
      tool_id: 'nt-acceleration-ceiling',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['feasibility'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'feasibility',
        data_sources: [
          'Cognitive Husbandry.md — Technical Feasibility (augmentation spectrum)',
          'Feasibility Audit §4.8 (acceleration ceiling by substrate)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/acceleration-ceiling.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_comms_lag — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §2.
  // Register: canon + feasibility. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_comms_lag', {
    title: 'New Tripoli comms lag between subjective-time rates',
    description:
      'Computes round-trip communications lag between two parties running at different subjective-time ' +
      'acceleration rates, given a wall-clock speed-of-light latency. Returns round-trip time, each ' +
      'party\'s subjective wait, the worst (larger) subjective wait, which party is slower, and the ' +
      'latency as a percentage of the ~10 Hz alpha-band perceptual frame. Pure multiply/max/compare — ' +
      'guest-legal, zk-provable.',
    inputSchema: {
      your_rate_x: z.number().min(1).max(1e9).default(50).describe(
        'Your subjective-time acceleration rate (default 50, New Tripoli ceiling).'
      ),
      their_rate_x: z.number().min(1).max(1e9).default(1000000).describe(
        'Their subjective-time acceleration rate (default 1,000,000, New Centauri ceiling).'
      ),
      latency_ms: z.number().min(1).max(200).default(50).describe(
        'One-way wall-clock latency in milliseconds (default 50).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ your_rate_x, their_rate_x, latency_ms }) => {
    const input_parameters = {
      your_rate_x:  your_rate_x ?? 50,
      their_rate_x: their_rate_x ?? 1000000,
      latency_ms:   latency_ms ?? 50,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = commsLagCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/comms_lag',
      tool_id: 'nt-comms-lag',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon', 'feasibility'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md §30 (New Centauri — contact-list problem)',
          'Canon - New Tripoli.md §18 (Time Dilation)',
          'Feasibility Audit (alpha-band perceptual frame)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/comms-lag.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_ring_density — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §3.
  // Register: canon. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_ring_density', {
    title: 'New Tripoli orbital ring housing density',
    description:
      'Computes housing capacity of the New Tripoli orbital ring plus core habitat, given ring depth, ' +
      'per-person area allowance, floor count, and core population. Returns ring capacity, core ' +
      'residents, total housed, percent of target population housed, shortfall, density per km², and ' +
      'whether the target population is fully housed. Pure multiply/divide/add/compare — guest-legal, ' +
      'zk-provable.',
    inputSchema: {
      ring_depth_m: z.number().min(200).max(10000).default(200).describe(
        'Ring habitat depth in meters (default 200).'
      ),
      area_per_person_m2: z.number().min(10).max(200).default(70).describe(
        'Floor area allotted per person in square meters (default 70).'
      ),
      floors: z.number().int().min(3).max(24).default(12).describe(
        'Number of stacked floors in the ring habitat (default 12).'
      ),
      core_millions: z.number().min(0).max(400).default(300).describe(
        'Core habitat population, in millions (default 300).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ ring_depth_m, area_per_person_m2, floors, core_millions }) => {
    const input_parameters = {
      ring_depth_m:        ring_depth_m ?? 200,
      area_per_person_m2:  area_per_person_m2 ?? 70,
      floors:               floors ?? 12,
      core_millions:        core_millions ?? 300,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = ringDensityCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/ring_density',
      tool_id: 'nt-ring-density',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md §5 (ring & housing geometry / population)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/ring-density.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_birthday_sacrifice — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §4.
  // Register: canon. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_birthday_sacrifice', {
    title: 'New Tripoli birthday-sacrifice subjective time cost',
    description:
      'Computes the subjective time you and a family member accrue under different simulated dilation ' +
      'rates over a given calendar span, plus the per-year subjective-time cost of the gap and the ' +
      'equivalent number of 6-month Tripoli blocks that cost represents. Pure multiply/subtract/round/' +
      'compare — guest-legal, zk-provable.',
    inputSchema: {
      your_rate_x: z.number().min(1).max(1e9).default(50).describe(
        'Your simulated dilation rate, in multiples of real time (default 50, the New Tripoli ceiling).'
      ),
      calendar_yr: z.number().int().min(1).max(200).default(200).describe(
        'Real (calendar) years elapsed (default 200).'
      ),
      family_rate_x: z.number().min(1).max(1e9).default(200).describe(
        'Family member\'s simulated dilation rate, in multiples of real time (default 200, the New Pluto entry rate).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ your_rate_x, calendar_yr, family_rate_x }) => {
    const input_parameters = {
      your_rate_x:    your_rate_x ?? 50,
      calendar_yr:    calendar_yr ?? 200,
      family_rate_x:  family_rate_x ?? 200,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = birthdaySacrificeCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/birthday_sacrifice',
      tool_id: 'nt-birthday-sacrifice',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md §18 (Time Dilation / doubling schedules)',
          'Canon - New Tripoli.md §9 (Universal Sabbath cadence)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/birthday-sacrifice.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_synthetic_body — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §5.
  // Register: canon. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_synthetic_body', {
    title: 'New Tripoli synthetic body mass',
    description:
      'Computes the mass (kg and lb), human-mass ratio, and water-buoyancy of a synthetic body ' +
      'skeleton built from a given material, scaled from the canon osmium reference build. Pure ' +
      'multiply/divide/compare — guest-legal, zk-provable.',
    inputSchema: {
      material: z.enum(['osmium', 'steel', 'titanium', 'aluminum', 'carbonComposite']).default('osmium').describe(
        'Skeleton material (default osmium, the canon reference build).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ material }) => {
    const input_parameters = {
      material: material ?? 'osmium',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = syntheticBodyCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/synthetic_body',
      tool_id: 'nt-synthetic-body',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md §35/§37 (synthetic body / osmium skeleton)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/synthetic-body.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_selection_cost — buildplan 2.1, NEWTRIPOLI-L2-SIMLIFT-SPEC.md §6.
  // Register: canon. Guest-legal: YES.
  // -------------------------------------------------------------------------
  server.registerTool('nt_selection_cost', {
    title: 'New Tripoli selection cost',
    description:
      'Computes how many of the 8.1B canon population are excluded (and how many remain) under a ' +
      'named selection criterion for who is offered the mind-upload path (e.g. literacy, wealth, ' +
      'longevity). Pure multiply/subtract — guest-legal, zk-provable.',
    inputSchema: {
      criterion: z.enum([
        'all', 'literacy', 'education', 'nocrime', 'creative', 'productive', 'iq', 'health',
        'wealth', 'digital', 'faith', 'english', 'adult', 'nocriminal', 'longevity',
      ]).default('all').describe('Selection criterion id (default all — no exclusion).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ criterion }) => {
    const input_parameters = {
      criterion: criterion ?? 'all',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = selectionCostCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/selection_cost',
      tool_id: 'nt-selection-cost',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Cognitive Husbandry.md — The Selection Problem',
          'Canon - New Tripoli.md §5 (population)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/selection-sorter.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_interface_bandwidth — buildplan 2.2, NEWTRIPOLI-LOG-TECHTREE-SPEC.md §1.
  // Register: real-science. Guest-legal: NO (Math.log10/Math.log2 of runtime channels).
  // -------------------------------------------------------------------------
  server.registerTool('nt_interface_bandwidth', {
    title: 'New Tripoli brain-interface bandwidth gap',
    description:
      'Computes how far a brain-computer interface of a given channel count is from whole-brain ' +
      'bandwidth (~86 billion neurons). Returns the fraction of the brain covered, the "1 in N" ' +
      'reciprocal, the order-of-magnitude gap, the number of channel-count doublings to close it, ' +
      'whether the interface is complete, whether the (harder) write direction is requested, and a ' +
      'verdict string. Uses log10/log2 of a runtime value — hash-verifiable, not zk-provable.',
    inputSchema: {
      channels: z.number().min(1).max(1e11).default(1024).describe(
        'Interface channel count (default 1024, present-day Neuralink-class BCI).'
      ),
      direction: z.enum(['read', 'write']).default('read').describe(
        'Interface direction (default read; write is the unsolved-at-scale problem).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ channels, direction }) => {
    const input_parameters = {
      channels:  channels ?? 1024,
      direction: direction ?? 'read',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = interfaceBandwidthCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/interface_bandwidth',
      tool_id: 'nt-interface-bandwidth',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['real-science'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'real-science',
        data_sources: [
          'Feasibility Audit §4.4 (interface bandwidth / the write problem)',
          'Koch, K. et al. (2006), Current Biology 16(14):1428–1434',
          'Neuralink PRIME study (2024+) — N1, 1,024 electrodes / 64 threads',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/interface-bandwidth.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_tech_tree_path — buildplan 2.3, NEWTRIPOLI-LOG-TECHTREE-SPEC.md §2.
  // Register: canon. Guest-legal: YES (set membership / boolean / integer; §18 zk candidate).
  // -------------------------------------------------------------------------
  server.registerTool('nt_tech_tree_path', {
    title: 'New Tripoli post-Wake tech-tree path solver',
    description:
      'Solves the post-Wake reindustrialization dependency graph (35 nodes, tiers T0–T9, ending at a ' +
      'femtoscale assembler). Given a set of already-built capabilities and a target, returns which ' +
      'nodes are buildable now, the critical path to the target (cheapest prerequisite at each step), ' +
      'the missing prerequisites, the remaining step count, and whether the target is already built or ' +
      'immediately buildable. Pure set membership / integer / boolean — guest-legal.',
    inputSchema: {
      built: z.array(z.string()).default(['solar', 'labor', 'garage', 'knowledge', 'aircraft']).describe(
        'Already-built capability node ids (default the 5 Wake-Day given nodes). Unknown ids are ignored.'
      ),
      target: z.enum([
        'solar', 'labor', 'garage', 'knowledge', 'aircraft', 'survey', 'mining', 'refractory',
        'smelting', 'steel', 'copper', 'lathe', 'precision', 'grid', 'aluminum', 'motors', 'nuclear',
        'chem', 'vacuum', 'optics', 'metrology', 'cleanroom', 'silicon', 'litho', 'restart', 'cmos',
        'compute', 'gaa', 'forksheet', 'cfet', 'angstrom', 'mems', 'nano', 'pico', 'femto',
      ]).default('femto').describe('Target capability node to reach (default femto, the femtoscale assembler).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ built, target }) => {
    const input_parameters = {
      built:  built ?? ['solar', 'labor', 'garage', 'knowledge', 'aircraft'],
      target: target ?? 'femto',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = techTreePathCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/tech_tree_path',
      tool_id: 'nt-tech-tree-path',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['canon', 'feasibility'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'canon',
        data_sources: [
          'Canon - New Tripoli.md §34 (resource-management tech tree)',
          'Canon - New Tripoli.md §36 (post-Wake reindustrialization of New Anasis)',
          'Canon - New Tripoli.md §37 (femtoscale assembler)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/tech-tree.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_provenance — buildplan 2.2, NEWTRIPOLI-LOG-TECHTREE-SPEC.md §3.
  // Register: real-science. Guest-legal: YES (structural copy + count; = emit_chaingraph_artifact
  // specialized; wraps the same HASHWIRE §5 hash path, no new hash logic).
  // -------------------------------------------------------------------------
  server.registerTool('nt_provenance', {
    title: 'New Tripoli chaingraph provenance manifest',
    description:
      'Emits a tamper-evident ChainGraph provenance manifest for an arbitrary sim run: echoes the ' +
      'declared inputs and canon citations, optionally threads to a parent artifact\'s execution_hash, ' +
      'and reports input/citation counts and parent linkage. Meta-tool = emit_chaingraph_artifact ' +
      'specialized; the worker wraps the standard execution-hash path so the manifest is itself ' +
      'hash-bound. Pure structural copy + count — guest-legal.',
    inputSchema: {
      sim_id: z.string().default('nt_time_dilation').describe(
        'The sim/tool id this manifest describes (default nt_time_dilation).'
      ),
      inputs: z.record(z.any()).default({}).describe(
        'The sim\'s declared input_parameters, echoed verbatim into the manifest (default {}).'
      ),
      canon_refs: z.array(z.string()).default([]).describe(
        'Canon/Audit section citations for this run (default []).'
      ),
      parent_hash: z.string().nullable().default(null).describe(
        'Prior artifact\'s execution_hash to thread provenance, or null (default null).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ sim_id, inputs, canon_refs, parent_hash }) => {
    const input_parameters = {
      sim_id:      sim_id ?? 'nt_time_dilation',
      inputs:      inputs ?? {},
      canon_refs:  canon_refs ?? [],
      parent_hash: parent_hash ?? null,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = provenanceCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/provenance',
      tool_id: 'nt-provenance',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['real-science'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'real-science',
        data_sources: [
          'NEWTRIPOLI-HASHWIRE-SPEC.md §1 (OCG v0.4 artifact envelope)',
          'OpenChainGraph spec v0.4 (chaingraph provenance manifest)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/about.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // nt_feasibility_crosswalk — meta-kernel, buildplan §2.5, CHAINS-SPEC §3.
  // Register: feasibility. Guest-legal: NO (transitively Math.pow via vat-feasibility).
  // -------------------------------------------------------------------------
  server.registerTool('nt_feasibility_crosswalk', {
    title: 'New Tripoli feasibility crosswalk (graded D1–D10 claim ledger)',
    description:
      'Grades the ten load-bearing feasibility claims (C-D1..C-D10) of the New Tripoli scenario ' +
      'against a single scenario config: delegates to the five physics kernels (kinetic probe, ' +
      'time dilation, vat feasibility, interface bandwidth, comms lag), reads their decision ' +
      'pointers, and emits a ledger of {claim, verdict, driver} plus verdict tallies and the ' +
      'binding (worst) verdict. Verdict vocabulary: Permitted, Merely-early, Contested, Barred, ' +
      'Unfalsifiable. Transitively uses Math.pow (Landauer price): hash-verifiable only, not ' +
      'guest-legal / not zk-provable.',
    inputSchema: {
      cruise_c: z.number().min(0.001).max(0.99).default(0.10).describe('Probe cruise fraction of c (D1; default 0.10).'),
      terminal_approach: z.enum(['staged', 'passive']).default('staged').describe('Deceleration mode (D1; default staged).'),
      target: z.string().default('terrestrial planet').describe('Delivery target body (D1; default terrestrial planet).'),
      distance_ly: z.number().min(1).default(7500).describe('Target distance in light-years (D1; default 7500).'),
      rate_x: z.number().min(1).default(50).describe('Subjective-time rate multiplier (D5/D7/D10; default 50).'),
      reset_months: z.number().min(1).default(6).describe('Sabbath reset interval in months (default 6).'),
      pop_billions: z.number().min(1).max(10).default(8.1).describe('Population in billions (D6; default 8.1).'),
      bio_pct: z.number().min(0).max(100).default(10).describe('Biological fraction percent (D6; default 10).'),
      accel: z.number().int().min(1).max(50).default(1).describe('Biological acceleration factor (D5; default 1).'),
      aug_stage: z.enum(['vat', 'sensory', 'metabolic', 'synaptic', 'hybrid', 'upload']).default('vat').describe('Augmentation stage (D5; default vat).'),
      digital_fidelity_ops: z.number().int().min(18).max(25).default(20).describe('Digital-mind ops exponent (D6; default 20).'),
      channels: z.number().min(1).default(1024).describe('BCI channel count (D4; default 1024).'),
      direction: z.enum(['read', 'write']).default('read').describe('Interface direction (D4; default read).'),
      your_rate_x: z.number().min(1).default(50).describe('Your subjective rate (D9; default 50).'),
      their_rate_x: z.number().min(1).default(1000000).describe('Their subjective rate (D9; default 1000000).'),
      latency_ms: z.number().min(0).default(50).describe('One-way link latency in ms (D9; default 50).'),
      variant: z.enum(['A', 'B']).default('A').describe('Latency regime (D9): A = tolerable, B = networked real-time (default A).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args) => {
    const input_parameters = {
      cruise_c:             args.cruise_c ?? 0.10,
      terminal_approach:    args.terminal_approach ?? 'staged',
      target:               args.target ?? 'terrestrial planet',
      distance_ly:          args.distance_ly ?? 7500,
      rate_x:               args.rate_x ?? 50,
      reset_months:         args.reset_months ?? 6,
      pop_billions:         args.pop_billions ?? 8.1,
      bio_pct:              args.bio_pct ?? 10,
      accel:                args.accel ?? 1,
      aug_stage:            args.aug_stage ?? 'vat',
      digital_fidelity_ops: args.digital_fidelity_ops ?? 20,
      channels:             args.channels ?? 1024,
      direction:            args.direction ?? 'read',
      your_rate_x:          args.your_rate_x ?? 50,
      their_rate_x:         args.their_rate_x ?? 1000000,
      latency_ms:           args.latency_ms ?? 50,
      variant:              args.variant ?? 'A',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = feasibilityCrosswalkCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/feasibility_crosswalk',
      tool_id: 'nt-feasibility-crosswalk',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['feasibility', 'canon'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'feasibility',
        data_sources: [
          'Feasibility Audit §3 (claim triage), §4 (C-D1..C-D6/D9), §4.8/§5 (C-D7/D10 upload)',
          'Canon - New Tripoli.md §26 (substrate split)',
          'NEWTRIPOLI-CHAINS-SPEC.md §3.2 (locked D1–D10 verdict table)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/sims/feasibility.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // ah_war_finance_default — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §1.
  // Register: alt-history. Guest-legal: YES (arithmetic + HORIZON-bounded loop).
  // -------------------------------------------------------------------------
  server.registerTool('ah_war_finance_default', {
    title: 'Alt-history war-finance default (treasury drain → default year → act-of-war clause)',
    description:
      'Computes an accounting identity over stipulated war finances: a HORIZON-bounded year loop ' +
      'drains reserves by (war cost + debt interest − revenue), financing each deficit with debt, ' +
      'and reports the first year reserves fall below the default threshold, the default calendar ' +
      'year, terminal reserves, compounded debt, and whether an act-of-war clause is tripped. ' +
      'Calibration figures are illustrative WW1-Allied-scale parameters, not asserted history. ' +
      'Arithmetic + bounded loop + compare — deterministic, guest-legal (zk-provable in §18).',
    inputSchema: {
      annual_revenue: z.number().min(0).max(1e9).default(200).describe(
        'Annual treasury revenue (£M order; calibration default 200).'
      ),
      war_cost_per_year: z.number().min(0).max(1e9).default(1000).describe(
        'War spend per year (£M/yr order; calibration default 1000).'
      ),
      starting_reserves: z.number().min(0).max(1e9).default(165).describe(
        'Starting gold/cash reserves (£M order; calibration default 165).'
      ),
      starting_debt: z.number().min(0).max(1e9).default(0).describe(
        'Starting debt principal (£M order; default 0).'
      ),
      debt_service_rate: z.number().min(0).max(1).default(0.05).describe(
        'Annual interest fraction on outstanding debt (default 0.05).'
      ),
      default_threshold: z.number().min(-1e9).max(1e9).default(0).describe(
        'Reserve level below which the treasury defaults (default 0).'
      ),
      act_of_war_clause: z.boolean().default(false).describe(
        'Whether a default trips a contractual act-of-war clause (default false).'
      ),
      start_year: z.number().min(1000).max(3000).default(1914).describe(
        'Calendar year the horizon starts (calibration default 1914).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ annual_revenue, war_cost_per_year, starting_reserves, starting_debt, debt_service_rate, default_threshold, act_of_war_clause, start_year }) => {
    const input_parameters = {
      annual_revenue:    annual_revenue ?? 200,
      war_cost_per_year: war_cost_per_year ?? 1000,
      starting_reserves: starting_reserves ?? 165,
      starting_debt:     starting_debt ?? 0,
      debt_service_rate: debt_service_rate ?? 0.05,
      default_threshold: default_threshold ?? 0,
      act_of_war_clause: act_of_war_clause ?? false,
      start_year:        start_year ?? 1914,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = warFinanceDefaultCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/war_finance_default',
      tool_id: 'ah-war-finance-default',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['alt-history'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'alt-history',
        data_sources: [
          'Alt History - What if WW1 had been avoided.md (Big Six war-finance thread)',
          'Inter-Allied war debts + 1917 Liberty Loans (calibration)',
          '1932 Lausanne Conference default / gold-standard suspensions (calibration)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/demos/war-finance-default.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // ah_nuclear_program_clock — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §2.
  // Register: alt-history. Guest-legal: NO (Math.log10 seismic magnitude).
  // -------------------------------------------------------------------------
  server.registerTool('ah_nuclear_program_clock', {
    title: 'Alt-history nuclear program clock (enrichment → first-device date + detection signature)',
    description:
      'Computes a program timeline from stipulated fissile inputs: time-to-critical-mass plus a fixed ' +
      'engineering lead gives the first-device calendar year, and the standard yield→body-wave-magnitude ' +
      'relation (mb = 4.0 + 0.75·log10 kt) plus test medium gives the detection signature. ' +
      'Calibration figures are illustrative Manhattan/RDS-1-scale parameters, not asserted history. ' +
      'Uses Math.log10 — deterministic and hash-verifiable, but NOT guest-legal / zk-provable in §18.',
    inputSchema: {
      program_start_year: z.number().min(1900).max(3000).default(1942).describe(
        'Calendar year the program starts (calibration default 1942).'
      ),
      critical_mass_kg: z.number().min(0.1).max(1000).default(6.0).describe(
        'Fissile critical mass required (kg; calibration default 6.0, Pu device order).'
      ),
      fissile_production_kg_yr: z.number().min(0.01).max(1e4).default(4.0).describe(
        'Fissile production rate (kg/yr; calibration default 4.0).'
      ),
      engineering_lead_months: z.number().min(0).max(600).default(18).describe(
        'Design/assembly overhead beyond fissile accumulation (months; default 18).'
      ),
      yield_kt: z.number().min(0.001).max(1e5).default(20).describe(
        'Device yield (kt; calibration default 20, Trinity order).'
      ),
      test_medium: z.enum(['atmospheric', 'underground']).default('atmospheric').describe(
        'Test medium — atmospheric fallout is directly detectable; underground relies on seismic mb.'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ program_start_year, critical_mass_kg, fissile_production_kg_yr, engineering_lead_months, yield_kt, test_medium }) => {
    const input_parameters = {
      program_start_year:       program_start_year ?? 1942,
      critical_mass_kg:         critical_mass_kg ?? 6.0,
      fissile_production_kg_yr: fissile_production_kg_yr ?? 4.0,
      engineering_lead_months:  engineering_lead_months ?? 18,
      yield_kt:                 yield_kt ?? 20,
      test_medium:              test_medium ?? 'atmospheric',
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = nuclearProgramClockCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/nuclear_program_clock',
      tool_id: 'ah-nuclear-program-clock',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['alt-history'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'alt-history',
        data_sources: [
          'Alt History - The Undisclosed Program.md (program-clock thread)',
          'Smyth Report (1945) / Frisch-Peierls memo (1940) (calibration)',
          'Soviet RDS-1 test 1949 + Vela/AFTAC detection record (calibration)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/demos/nuclear-program-clock.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // ah_attribution_decay — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §3.
  // Register: alt-history. Guest-legal: YES (integer-power decay loops + compare).
  // -------------------------------------------------------------------------
  server.registerTool('ah_attribution_decay', {
    title: 'Alt-history attribution decay (evidence age + censorship → attribution-confidence curve)',
    description:
      'Computes an attribution-confidence curve from stipulated inputs: an initial confidence decays ' +
      'geometrically per year (accelerated by a censorship factor), while corroborating tests pull it back ' +
      'toward certainty, and a bounded scan reports the year confidence first crosses the deniability ' +
      'threshold. Calibration figures are illustrative nuclear-forensics-scale parameters, not asserted ' +
      'history. Uses only integer-power multiply loops + compare (no transcendentals) — guest-legal / §18 zk candidate.',
    inputSchema: {
      initial_confidence: z.number().min(0).max(1).default(0.95).describe(
        'Attribution confidence at year zero (0..1; calibration default 0.95).'
      ),
      decay_per_year: z.number().min(0).max(1).default(0.15).describe(
        'Fractional confidence lost per year before censorship (0..1; default 0.15).'
      ),
      years_elapsed: z.number().int().min(0).max(100).default(5).describe(
        'Whole years elapsed since the event (0..100 horizon).'
      ),
      censorship_factor: z.number().min(0).max(1).default(0).describe(
        'Extra fractional acceleration of decay from active censorship (0..1).'
      ),
      corroborating_tests: z.number().int().min(0).max(100).default(0).describe(
        'Number of corroborating tests pulling confidence back toward certainty (0..100).'
      ),
      threshold: z.number().min(0).max(1).default(0.5).describe(
        'Plausible-deniability line — confidence below this is DENIABLE (0..1; default 0.5).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ initial_confidence, decay_per_year, years_elapsed, censorship_factor, corroborating_tests, threshold }) => {
    const input_parameters = {
      initial_confidence:  initial_confidence ?? 0.95,
      decay_per_year:      decay_per_year ?? 0.15,
      years_elapsed:       years_elapsed ?? 5,
      censorship_factor:   censorship_factor ?? 0,
      corroborating_tests: corroborating_tests ?? 0,
      threshold:           threshold ?? 0.5,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = attributionDecayCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/attribution_decay',
      tool_id: 'ah-attribution-decay',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['alt-history'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'alt-history',
        data_sources: [
          'Alt History - The Undisclosed Program.md (attribution thread)',
          'Nuclear forensics + Vela/AFTAC detection record (calibration)',
          'Cold War censorship / plausible-deniability historiography (calibration)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/demos/attribution-decay.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // ah_injustice_ledger — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §4.
  // Register: alt-history. Guest-legal: YES (sum/multiply/compare/sort over a bounded branch array).
  // -------------------------------------------------------------------------
  server.registerTool('ah_injustice_ledger', {
    title: 'Alt-history injustice ledger (branch tolls → unstable-ranking verdict)',
    description:
      'Scores each alt-history branch two ways — direct battle-deaths only, and full-weighted (adding ' +
      'indirect deaths, displacement, and lost sovereignty) — then compares the least-unjust leaders. The ' +
      'thesis is unstable ranking: which branch is "least unjust" flips under defensible counting rules, so ' +
      'the accounting is the exposed, adjustable argument. Branch tolls and weights are illustrative ' +
      'conflict-coding-scale parameters, not asserted history. Uses only sum/multiply/compare/sort (no ' +
      'transcendentals) — guest-legal / §18 zk candidate.',
    inputSchema: {
      branches: z.array(z.object({
        id:               z.string(),
        direct_deaths:    z.number(),
        indirect_deaths:  z.number(),
        refugees:         z.number(),
        idps:             z.number(),
        sovereignty_lost: z.number().min(0).max(1),
      })).min(1).max(20).default([
        { id: 'branch_A', direct_deaths: 500000,  indirect_deaths: 3000000, refugees: 1000000, idps: 500000, sovereignty_lost: 0.2 },
        { id: 'branch_B', direct_deaths: 1200000, indirect_deaths: 800000,  refugees: 300000,  idps: 200000, sovereignty_lost: 0.5 },
        { id: 'branch_C', direct_deaths: 800000,  indirect_deaths: 1500000, refugees: 600000,  idps: 400000, sovereignty_lost: 0.3 },
      ]).describe('Alt-history branches to grade (1..20 entries; calibration default is 3 illustrative branches).'),
      indirect_multiplier: z.number().min(0).max(100).default(3.5).describe(
        'Indirect:direct deaths multiplier (Geneva Declaration 3–4× band; default 3.5).'
      ),
      include_indirect: z.boolean().default(true).describe(
        'Whether the active accounting counts indirect deaths (the toggle that flips the ranking).'
      ),
      displacement_weight: z.number().min(0).max(1e6).default(0.1).describe(
        'Injustice units per displaced person (refugees + IDPs; default 0.1).'
      ),
      sovereignty_weight: z.number().min(0).max(1e12).default(1e6).describe(
        'Injustice units per unit of sovereignty lost (0..1 per branch; default 1e6).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ branches, indirect_multiplier, include_indirect, displacement_weight, sovereignty_weight }) => {
    const input_parameters = {
      branches: branches ?? [
        { id: 'branch_A', direct_deaths: 500000,  indirect_deaths: 3000000, refugees: 1000000, idps: 500000, sovereignty_lost: 0.2 },
        { id: 'branch_B', direct_deaths: 1200000, indirect_deaths: 800000,  refugees: 300000,  idps: 200000, sovereignty_lost: 0.5 },
        { id: 'branch_C', direct_deaths: 800000,  indirect_deaths: 1500000, refugees: 600000,  idps: 400000, sovereignty_lost: 0.3 },
      ],
      indirect_multiplier: indirect_multiplier ?? 3.5,
      include_indirect:    include_indirect ?? true,
      displacement_weight: displacement_weight ?? 0.1,
      sovereignty_weight:  sovereignty_weight ?? 1e6,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = injusticeLedgerCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/injustice_ledger',
      tool_id: 'ah-injustice-ledger',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['alt-history'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'alt-history',
        data_sources: [
          'NEWTRIPOLI-ALTHIST-REFRAME-TRIAGE.md #12 (unstable-ranking thesis)',
          'UCDP/PRIO + COW conflict-coding methodology (calibration)',
          'Geneva Declaration Global Burden of Armed Violence — indirect:direct band (calibration)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/demos/injustice-ledger.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // ch_stadium_capacity — NEWTRIPOLI-ALTHIST-CHAINS-SPEC.md §5.
  // Register: alt-history. Guest-legal: NO (Math.cos irradiance — hash-verifiable only).
  // -------------------------------------------------------------------------
  server.registerTool('ch_stadium_capacity', {
    title: 'Stadium-capacity geometry (population/irradiance → footprint, fits_single_stadium)',
    description:
      'Sizes the New Tripoli "single stadium civilization" image: physical substrate footprint ' +
      '(population × per-mind area) against a large-stadium footprint, alongside the solar-panel area the ' +
      'matching power supply would need (population × per-mind watts ÷ latitude irradiance). The honest ' +
      'tension is that the substrate fits a stadium while the power needs a desert. Irradiance uses ' +
      'GHI ≈ 5·cos(lat); calibration figures are illustrative, tunable parameters cited to the record. ' +
      'Uses Math.cos — hash-verifiable only, not a §18 zk candidate.',
    inputSchema: {
      population: z.number().min(1).max(1e11).default(8.1e9).describe(
        'Hosted population / minds (default 8.1e9 = canon.js population.humans).'
      ),
      latitude: z.number().min(0).max(89).default(45).describe(
        'Panel-field latitude in degrees (0..89; GHI ≈ 5·cos(lat); default 45).'
      ),
      power_per_capita_w: z.number().min(0).max(1e6).default(20).describe(
        'Continuous power per hosted mind in watts (default 20).'
      ),
      panel_efficiency: z.number().min(1e-9).max(1).default(0.22).describe(
        'PV panel efficiency fraction (modern PV ~0.22; default 0.22).'
      ),
      stadium_area_m2: z.number().min(1).max(1e7).default(200000).describe(
        'Reference large-stadium footprint in m² incl. grounds (default 200000).'
      ),
      area_per_capita_m2: z.number().min(1e-9).max(1e3).default(1e-6).describe(
        'Substrate footprint per hosted mind in m² (default 1e-6).'
      ),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ population, latitude, power_per_capita_w, panel_efficiency, stadium_area_m2, area_per_capita_m2 }) => {
    const input_parameters = {
      population:          population ?? 8.1e9,
      latitude:            latitude ?? 45,
      power_per_capita_w:  power_per_capita_w ?? 20,
      panel_efficiency:    panel_efficiency ?? 0.22,
      stadium_area_m2:     stadium_area_m2 ?? 200000,
      area_per_capita_m2:  area_per_capita_m2 ?? 1e-6,
    };
    const policyParameters = {
      execution_backend: 'js',
      canon_version:      CANON_VERSION,
      input_parameters,
    };
    const { output_payload: outputPayload } = stadiumCapacityCompute(policyParameters);
    const execHash = await executionHash(policyParameters, outputPayload);

    const artifact = {
      '@context': 'https://openchain.graph/spec/v0.3/context.jsonld',
      chaingraph_version: '0.4.0',
      buildType: 'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      mandate_type: 'me.newtripoli/stadium_capacity',
      tool_id: 'ch-stadium-capacity',
      tool_version: '1.0.0',
      generated_at: new Date().toISOString(),
      execution_hash: execHash,
      chain: { parent_hashes: [], parent_tool_ids: [], chain_depth: 0 },
      policy_parameters: policyParameters,
      output_payload: outputPayload,
      compliance_flags: ['alt-history'],
      audit_signature: {
        client_side_executed: true,
        zero_pii_verified:    true,
        deterministic_run:    true,
        register:             'alt-history',
        data_sources: [
          'Canon - New Tripoli.md §Stadium (single-stadium civilization image)',
          'GHI ≈ 5·cos(lat) irradiance model (ENHANCEMENTS §7, calibration)',
          'Modern PV efficiency ~22% (calibration)',
        ],
        schema_version:     'nt-chaingraph-0.4.0',
        newtripoli_version: NT_ARTIFACT_VERSION,
        permalink:           BASE_URL + '/ch-sims/demos/stadium-capacity.html',
      },
    };
    artifact.audit_signature.build_identity = {
      kernel_digest: KERNEL_DIGEST,
      buildType:     'https://openchain.graph/spec/v0.2#WebCryptoSHA256',
      source_ref:    'worker.mjs',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(artifact, null, 2) }],
      structuredContent: artifact,
    };
  });

  // -------------------------------------------------------------------------
  // verify_execution_hash — ChainGraph Standard §4 (JCS execution hash)
  // Recompute an artifact's execution hash so any agent can independently
  // verify a New Tripoli (or any ChainGraph) artifact rather than trust it. Uses
  // the §4 JCS canonicalizer over the same snake_case preimage the artifacts are
  // hashed over; tolerant of a legacy 'sha256:' prefix on the claimed hash.
  // -------------------------------------------------------------------------
  server.registerTool('verify_execution_hash', {
    title: 'Verify a ChainGraph execution hash',
    description:
      'Independently verify a ChainGraph artifact (ChainGraph Standard §4 JCS). ' +
      'Recomputes SHA-256 over the canonical (RFC 8785 JCS, sorted-key, whitespace-stripped) JSON of ' +
      '{policy_parameters, output_payload} and compares it to the claimed execution_hash ' +
      '(bare hex or legacy sha256:-prefixed). ' +
      'Pass a full artifact, or policy_parameters + output_payload + claimed_hash. ' +
      'Works on artifacts from any ChainGraph vendor (New Tripoli, AINumbers, ApexLogics).',
    inputSchema: {
      artifact:          z.record(z.any()).optional().describe('A full ChainGraph artifact (with policy_parameters, output_payload, execution_hash).'),
      policy_parameters: z.record(z.any()).optional().describe('Artifact policy_parameters (if not passing a full artifact).'),
      output_payload:    z.record(z.any()).optional().describe('Artifact output_payload (if not passing a full artifact).'),
      claimed_hash:      z.string().optional().describe('execution_hash to check against (if not passing a full artifact).'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ artifact, policy_parameters, output_payload, claimed_hash }) => {
    const pp = policy_parameters ?? artifact?.policy_parameters;
    const op = output_payload ?? artifact?.output_payload;
    const claimed = claimed_hash ?? artifact?.execution_hash ?? null;
    if (pp === undefined || op === undefined) {
      return { isError: true, content: [{ type: 'text', text: 'Provide a full artifact, or policy_parameters + output_payload (+ claimed_hash).' }] };
    }
    // Bare lowercase hex (OCG §4). Accept a claimed hash with or without a
    // legacy 'sha256:' prefix: strip it from both sides before comparing so
    // previously exported (sha256:-prefixed) artifacts still verify.
    const stripPfx = (h) => (typeof h === 'string' && h.startsWith('sha256:')) ? h.slice(7) : h;
    const computed = await executionHash(pp, op);
    const valid = claimed != null && stripPfx(computed) === stripPfx(claimed);
    const out = {
      valid,
      computed_hash: computed,
      claimed_hash:  claimed,
      tool_id:            artifact?.tool_id ?? null,
      chaingraph_version: artifact?.chaingraph_version ?? null,
      note: claimed == null
        ? 'No claimed hash supplied — returning the computed hash only.'
        : (valid ? 'Verified: recomputed hash matches the artifact.' : 'MISMATCH: treat the artifact as unverified.'),
      spec: 'ChainGraph Standard §4',
    };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out };
  });

  // -------------------------------------------------------------------------
  // run_chain — OCG Standard §21 server-side chain EXECUTION (not deeplinks).
  // Executes registered kernels in sequence, threading each step's
  // execution_hash as the next step's chain.parent_hashes, with optional
  // §21.4 decision gates. Returns a composite_execution_hash over the RAN
  // (status ok) steps only. KERNEL_REGISTRY / CHAINS are populated by 1.3/2.5.
  // -------------------------------------------------------------------------
  const CHAIN_KEYS = Object.keys(CHAINS);
  server.registerTool('run_chain', {
    title: 'Run a New Tripoli ChainGraph chain (server-side kernel execution)',
    description:
      'Executes a ChainGraph chain server-side (OCG Standard §21) — runs the actual registered ' +
      'kernels in sequence, NOT deep-links. Supports §21.4 decision gates: an RFC 6901 pointer ' +
      'into a step\'s output_payload is matched against ordered rules (eq/neq/gt/gte/lt/lte/in/' +
      'present/absent) to pick the next step id, falling through to a mandatory default when no ' +
      'rule matches. Named chains: ' + (CHAIN_KEYS.length ? '"' + CHAIN_KEYS.join('", "') + '"' : '(none registered yet)') + '. ' +
      'Returns a composite hash over the executed (RAN) steps, the decision record(s), and the path_taken.',
    inputSchema: {
      chain: z.string().optional().describe(
        'Name of a pre-defined chain to execute. One of: ' + CHAIN_KEYS.join(', ') + '. ' +
        'Mutually exclusive with steps.'
      ),
      steps: z.array(z.object({
        id: z.string().optional().describe('Explicit step id (defaults to tool_id if omitted).'),
        tool_id: z.string().describe('Kernel tool_id to execute.'),
        fields: z.record(z.any()).optional().describe('Input parameters passed to the kernel as input_parameters.'),
        gate: z.object({
          input: z.string().describe('RFC 6901 JSON Pointer into this step\'s output_payload.'),
          rules: z.array(z.object({
            op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'present', 'absent']),
            value: z.any().optional(),
            next: z.string().describe('Forward-only step id, or "end".'),
          })),
          default: z.string().describe('Mandatory fallback step id, or "end", when no rule matches.'),
        }).optional().describe('Optional §21.4 decision gate evaluated after this step runs.'),
      })).optional().describe('Ad-hoc ordered step list. Mutually exclusive with chain.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ chain, steps }) => {
    if (chain && steps) {
      return { isError: true, content: [{ type: 'text', text: 'Provide either chain or steps, not both.' }] };
    }

    let chainTitle, chainSteps;
    if (chain) {
      const chainMeta = CHAINS[chain];
      if (!chainMeta) {
        return { isError: true, content: [{ type: 'text', text: 'Unknown chain "' + chain + '". Available: ' + (CHAIN_KEYS.join(', ') || '(none)') }] };
      }
      chainTitle = chainMeta.title;
      chainSteps = chainMeta.steps;
    } else if (steps && steps.length > 0) {
      chainTitle = 'ad-hoc';
      chainSteps = steps;
    } else {
      return { isError: true, content: [{ type: 'text', text: 'Provide chain (named) or steps (ad-hoc array). No chains are registered yet.' }] };
    }

    const result = await runChain(chainTitle, chainSteps);
    const output = { chain: chain ?? 'ad-hoc', ...result };

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  });

  return server;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  'https://newtripoli.xyz',
  'https://www.newtripoli.xyz',
  'https://claude.ai',
  'https://app.claude.ai',
  'http://localhost:3000',
  'http://localhost:8787',
]);

// ---------------------------------------------------------------------------
// Cloudflare Workers entry point
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://newtripoli.xyz',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return Response.json(
        { status: 'ok', server: 'newtripoli-mcp', version: VERSION, mcp_endpoint: 'https://mcp.newtripoli.xyz/mcp' },
        { headers: corsHeaders }
      );
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      // Parse body once — needed by both the MCP handler and telemetry extraction.
      const body = await request.json().catch(() => undefined);

      // Telemetry fields from tools/call requests only — structural metadata,
      // never payloads, parameters, or outputs.
      const isToolCall = body?.method === 'tools/call';
      const toolName   = isToolCall ? (body?.params?.name ?? 'unknown') : null;
      const chainDepth = isToolCall ? (body?.params?.arguments?.chain_depth ?? 0) : null;

      const t0        = Date.now();
      const manifest  = await loadData(env);
      const server    = buildServer(manifest);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const { req, res } = toReqRes(request);
      await server.connect(transport);
      const handled = transport.handleRequest(req, res, body);
      ctx.waitUntil(handled);
      const response = await toFetchResponse(res);
      for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v);

      // Fire-and-forget Analytics Engine telemetry — never blocks the response.
      // Structural metadata only: tool name, salted (non-reversible, no-PII) caller hash,
      // ok/error, latency, chain depth. Mirrors ainumbers-mcp / apexlogics-mcp.
      if (isToolCall && env.ANALYTICS) {
        const latencyMs = Date.now() - t0;
        const success   = response.status < 500;
        const callerRaw = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? '';
        const callerBuf = await crypto.subtle.digest('SHA-256',
          new TextEncoder().encode('newtripoli-mcp-v1:' + callerRaw));
        const callerHash = 'sha256:' + Array.from(new Uint8Array(callerBuf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
        ctx.waitUntil(Promise.resolve().then(() => {
          try {
            env.ANALYTICS.writeDataPoint({
              blobs:   [toolName, callerHash, success ? 'ok' : 'error'],
              doubles: [latencyMs, chainDepth ?? 0],
              indexes: [toolName],
            });
          } catch (_) { /* telemetry is best-effort; never affect the response */ }
        }));
      }

      return response;
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
