// Chain composite-golden drift gate (CHAIN-GOLD-SPEC §2). CI job. Recomputes every
// chain-branch composite vs the frozen kernels/chains/*.fixtures.json and FAILS red on:
//   • a null/missing expected_composite_hash (unfrozen),
//   • recomputed composite != frozen (silent drift / intentional canon bump w/o re-freeze),
//   • recomputed path_taken != expected_path_taken (a gate re-route),
//   • two branch cases within one chain collapsing to the same composite (broken gate).
// Intentional canon bump → re-run freeze-chain-goldens.mjs in the same commit → green.
//
// Usage: node scripts/check-chain-goldens.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAINS, runChain } from '../worker.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHAINS_DIR = resolve(ROOT, 'kernels', 'chains');
const HEX64 = /^[0-9a-f]{64}$/;

function pathEq(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
}

function buildSteps(chainKey, stepOverrides = {}) {
  return CHAINS[chainKey].steps.map((s) => ({
    ...s,
    fields: { ...(s.fields ?? {}), ...(stepOverrides[s.id] ?? {}) },
  }));
}

async function runCase(chainKey, c) {
  const steps = buildSteps(chainKey, c.step_overrides);
  const res = await runChain(CHAINS[chainKey].title, steps);
  return { composite: res.composite_execution_hash, path: res.path_taken, steps: res.steps };
}

// step id -> per-step execution_hash (RAN steps only), for the structural-rhyme
// partial-hash proof (ALTHIST-CHAINS-SPEC §5.1 / §8B.2). runChain does NOT fold the
// parent hash into a step preimage, so two steps rhyme iff their knobs are identical.
function stepHashMap(steps) {
  const m = new Map();
  for (const s of steps ?? []) {
    if (s?.status === 'ok' && s.artifact?.execution_hash) m.set(s.id, s.artifact.execution_hash);
  }
  return m;
}

// Assert a case's expected_rhyme against the 4 structural-rhyme step hashes.
// clock rhyme = a_clock.hash === b_clock.hash; decay rhyme = a_decay.hash === b_decay.hash.
function checkRhyme(file, c, steps) {
  const h = stepHashMap(steps);
  const need = ['a_clock', 'a_decay', 'b_clock', 'b_decay'];
  const missing = need.filter((id) => !h.has(id));
  if (missing.length) return [`${file} [${c.branch}]: rhyme steps missing hashes: ${missing.join(',')}`];
  const clock = h.get('a_clock') === h.get('b_clock');
  const decay = h.get('a_decay') === h.get('b_decay');
  const out = [];
  if (clock !== c.expected_rhyme.clock) out.push(`${file} [${c.branch}]: clock rhyme=${clock} != expected ${c.expected_rhyme.clock} (a_clock vs b_clock hash)`);
  if (decay !== c.expected_rhyme.decay) out.push(`${file} [${c.branch}]: decay rhyme=${decay} != expected ${c.expected_rhyme.decay} (a_decay vs b_decay hash)`);
  return out;
}

const files = readdirSync(CHAINS_DIR).filter((f) => f.endsWith('.fixtures.json')).sort();
const diffs = [];
let ok = 0;

for (const file of files) {
  const fixture = JSON.parse(readFileSync(resolve(CHAINS_DIR, file), 'utf8'));
  const chainKey = fixture.chain;
  if (!CHAINS[chainKey]) { diffs.push(`${file}: chain '${chainKey}' not in worker CHAINS`); continue; }

  const seen = new Map(); // composite -> branch (within-chain distinctness)
  for (const c of fixture.cases) {
    let composite, taken, stepsRan;
    try {
      ({ composite, path: taken, steps: stepsRan } = await runCase(chainKey, c));
    } catch (e) {
      diffs.push(`${file} [${c.branch}]: runChain THREW — ${e.message}`);
      continue;
    }
    const want = c.expected_composite_hash;
    if (want == null) { diffs.push(`${file} [${c.branch}]: expected_composite_hash is null (unfrozen)`); continue; }
    if (!HEX64.test(composite ?? '')) { diffs.push(`${file} [${c.branch}]: recomputed not 64-hex — ${composite}`); continue; }
    if (composite !== want) { diffs.push(`${file} [${c.branch}]: committed=${want} recomputed=${composite}`); continue; }
    if (!pathEq(taken, c.expected_path_taken)) {
      diffs.push(`${file} [${c.branch}]: path_taken ${JSON.stringify(taken)} != expected ${JSON.stringify(c.expected_path_taken)}`);
      continue;
    }
    if (c.expected_rhyme) {
      const rhymeDiffs = checkRhyme(file, c, stepsRan);
      if (rhymeDiffs.length) { diffs.push(...rhymeDiffs); continue; }
    }
    if (seen.has(composite)) {
      diffs.push(`${file} [${c.branch}]: composite collides with branch '${seen.get(composite)}' (gate not distinguishing)`);
      continue;
    }
    seen.set(composite, c.branch);
    ok++;
  }
}

if (diffs.length) {
  console.error(`FAIL: chain-golden drift (${diffs.length} issue(s)):`);
  for (const d of diffs) console.error(`  ${d}`);
  console.error('  → intentional canon/chain change? re-run `node scripts/freeze-chain-goldens.mjs`.');
  process.exitCode = 1;
} else {
  console.log(`PASS: ${ok} chain-branch composites fresh across ${files.length} chains.`);
}
