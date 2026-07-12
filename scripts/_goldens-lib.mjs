// Shared golden-hash helper (CIGOLD-PARITY-SPEC §1.4.5). Reproduces each L1 tool's
// execution_hash at its fixture (default) inputs WITHOUT the MCP SDK — the HASHWIRE §5
// wrapper is pure: kernel.compute(policy_parameters) → output_payload → executionHash.
//
// The preimage assembled here is byte-identical to the worker's registerTool wrapper:
//   policy_parameters = { execution_backend:'js', canon_version:<worker CANON_VERSION>,
//                         input_parameters:<fixture> }
// (JCS sorts keys, so key order is free; values/names/types must match — the fixtures ARE
// the wrapper defaults.)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionHash } from '../lib/_hash.mjs';

import { compute as timeDilationCompute } from '../kernels/time-dilation.kernel.mjs';
import { compute as kineticProbeCompute } from '../kernels/kinetic-probe.kernel.mjs';
import { compute as vatFeasibilityCompute } from '../kernels/vat-feasibility.kernel.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// tool id → { slug, compute } — the three P1 L1 tools.
export const TOOLS = [
  { id: 'nt_time_dilation',   slug: 'time-dilation',   compute: timeDilationCompute },
  { id: 'nt_kinetic_probe',   slug: 'kinetic-probe',   compute: kineticProbeCompute },
  { id: 'nt_vat_feasibility', slug: 'vat-feasibility', compute: vatFeasibilityCompute },
];

export function workerCanonVersion() {
  const src = readFileSync(resolve(ROOT, 'worker.mjs'), 'utf8');
  const m = /^const CANON_VERSION = '([^']+)';$/m.exec(src);
  if (!m) throw new Error('const CANON_VERSION not found in worker.mjs');
  return m[1];
}

function readFixture(slug) {
  return JSON.parse(readFileSync(resolve(ROOT, 'kernels', 'fixtures', `${slug}.fixture.json`), 'utf8'));
}

// Reproduce one tool's execution_hash at fixture defaults. Returns bare 64-char hex.
export async function reproduceHash(tool, canonVersion) {
  const input_parameters = readFixture(tool.slug);
  const policy_parameters = {
    execution_backend: 'js',
    canon_version: canonVersion,
    input_parameters,
  };
  const { output_payload } = tool.compute(policy_parameters);
  return executionHash(policy_parameters, output_payload);
}

// Reproduce all three → { canon_version, hashes: { <id>: hex }, errors: { <id>: msg } }.
// A tool whose pure wrapper throws (e.g. an unsafe-integer I-JSON violation) is recorded in
// `errors` with hashes[id]=null rather than crashing the whole gate — callers decide severity.
export async function reproduceAll() {
  const canon_version = workerCanonVersion();
  const hashes = {};
  const errors = {};
  for (const tool of TOOLS) {
    try {
      hashes[tool.id] = await reproduceHash(tool, canon_version);
    } catch (e) {
      hashes[tool.id] = null;
      errors[tool.id] = e.message;
    }
  }
  return { canon_version, hashes, errors };
}
