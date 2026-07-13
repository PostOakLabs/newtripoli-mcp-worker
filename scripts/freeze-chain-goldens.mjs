// Freeze chain composite goldens (CHAIN-GOLD-SPEC §2). HUMAN-RUN, not in CI.
// For each kernels/chains/*.fixtures.json, per branch case: clone the named chain's
// steps, apply the case's step_overrides (shallow merge into each step's `fields`),
// run runChain (async), and write the resulting composite_execution_hash into the
// case's `expected_composite_hash` slot IN PLACE. Idempotent.
//
// Run ONLY after the chains + kernels are settled; freeze moves every composite on a
// canon bump (canon_version is transitively in each step preimage — CHAIN-GOLD-SPEC §0 D2).
//
// Usage: node scripts/freeze-chain-goldens.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS, runChain } from '../worker.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAINS_DIR = resolve(ROOT, 'kernels', 'chains');
const HEX64 = /^[0-9a-f]{64}$/;

// Deep-equal for arrays of primitives (path_taken).
function pathEq(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
}

// Apply a case's step_overrides onto a clone of the chain's steps.
// Overrides keyed by step id; each is a SHALLOW merge into that step's `fields`.
function buildSteps(chainKey, stepOverrides = {}) {
  return CHAINS[chainKey].steps.map((s) => ({
    ...s,
    fields: { ...(s.fields ?? {}), ...(stepOverrides[s.id] ?? {}) },
  }));
}

async function runCase(chainKey, c) {
  const steps = buildSteps(chainKey, c.step_overrides);
  const res = await runChain(CHAINS[chainKey].title, steps);
  return { composite: res.composite_execution_hash, path: res.path_taken };
}

const files = readdirSync(CHAINS_DIR).filter((f) => f.endsWith('.fixtures.json')).sort();
let total = 0;

for (const file of files) {
  const path = resolve(CHAINS_DIR, file);
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  const chainKey = fixture.chain;
  if (!CHAINS[chainKey]) throw new Error(`${file}: chain '${chainKey}' not found in worker CHAINS`);

  console.log(`${file} (chain=${chainKey}):`);
  for (const c of fixture.cases) {
    const { composite, path: taken } = await runCase(chainKey, c);
    if (!HEX64.test(composite ?? '')) {
      throw new Error(`${file} [${c.branch}]: composite not 64-hex — got ${composite}`);
    }
    if (!pathEq(taken, c.expected_path_taken)) {
      throw new Error(`${file} [${c.branch}]: path_taken ${JSON.stringify(taken)} != expected ${JSON.stringify(c.expected_path_taken)}`);
    }
    c.expected_composite_hash = composite;
    total++;
    console.log(`  ${c.branch}: ${composite}  path=${JSON.stringify(taken)}`);
  }

  writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n');
}

console.log(`Froze ${total} chain-branch composite goldens across ${files.length} chains.`);
