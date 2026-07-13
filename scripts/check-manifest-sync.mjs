// Manifest-sync CI gate (NT) — DISCOVERY-SPEC §2.3. Asserts the generated
// data/tools-manifest.json stays in lockstep with worker.mjs's structural SSOTs
// (KERNEL_REGISTRY, CHAINS) so the manifest can never silently drift from the
// tools/chains it's supposed to describe. FAILS (exit 1) on any divergence.
//
// Four assertions (DISCOVERY-SPEC §2.3):
//   1. manifest.tools' tool_ids set === KERNEL_REGISTRY keys (all 13, no extras/missing).
//   2. manifest.chains keys set === CHAINS keys (all 7).
//   3. every manifest.chains[c].steps[i].tool resolves to a manifest.tools[*].slug,
//      and its count === CHAINS[c].steps.length (per-step order parity).
//   4. every manifest.tools[s].mandate === KERNEL_REGISTRY[tool_id].mandate_type.
//
// Usage: node scripts/check-manifest-sync.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KERNEL_REGISTRY, CHAINS } from '../worker.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = resolve(ROOT, 'data', 'tools-manifest.json');

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function main() {
  let manifest;
  try {
    manifest = loadManifest();
  } catch (e) {
    console.error(`FAIL: could not load data/tools-manifest.json — ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const diffs = [];
  const tools = manifest.tools ?? {};
  const chains = manifest.chains ?? {};

  // (1) manifest.tools' tool_id set === KERNEL_REGISTRY keys.
  const manifestToolIds = new Set(Object.values(tools).map((t) => t.tool_id));
  const registryToolIds = new Set(Object.keys(KERNEL_REGISTRY));
  for (const id of registryToolIds) if (!manifestToolIds.has(id)) diffs.push(`manifest.tools missing tool_id "${id}" (present in KERNEL_REGISTRY)`);
  for (const id of manifestToolIds) if (!registryToolIds.has(id)) diffs.push(`manifest.tools has extra tool_id "${id}" (not in KERNEL_REGISTRY)`);

  // (2) manifest.chains keys === CHAINS keys.
  const manifestChainNames = new Set(Object.keys(chains));
  const chainNames = new Set(Object.keys(CHAINS));
  for (const name of chainNames) if (!manifestChainNames.has(name)) diffs.push(`manifest.chains missing chain "${name}" (present in CHAINS)`);
  for (const name of manifestChainNames) if (!chainNames.has(name)) diffs.push(`manifest.chains has extra chain "${name}" (not in CHAINS)`);

  // Slug -> tool_id lookup for step resolution.
  const slugToToolId = {};
  for (const [slug, t] of Object.entries(tools)) slugToToolId[slug] = t.tool_id;

  // (3) every chain step's tool resolves to a manifest.tools slug, and step counts match.
  for (const [name, chain] of Object.entries(chains)) {
    const liveChain = CHAINS[name];
    if (!liveChain) continue; // already flagged by (2)
    if ((chain.steps?.length ?? 0) !== liveChain.steps.length) {
      diffs.push(`manifest.chains["${name}"].steps count (${chain.steps?.length ?? 0}) != CHAINS["${name}"].steps count (${liveChain.steps.length})`);
      continue;
    }
    chain.steps.forEach((s, i) => {
      if (!(s.tool in slugToToolId)) {
        diffs.push(`manifest.chains["${name}"].steps[${i}].tool "${s.tool}" does not resolve to any manifest.tools slug`);
        return;
      }
      const expectedToolId = liveChain.steps[i].tool_id;
      const gotToolId = slugToToolId[s.tool];
      if (gotToolId !== expectedToolId) {
        diffs.push(`manifest.chains["${name}"].steps[${i}].tool "${s.tool}" resolves to tool_id "${gotToolId}", expected "${expectedToolId}" (CHAINS["${name}"].steps[${i}].tool_id) — order/identity mismatch`);
      }
    });
  }

  // (4) every manifest.tools[s].mandate === KERNEL_REGISTRY[tool_id].mandate_type.
  for (const [slug, t] of Object.entries(tools)) {
    const reg = KERNEL_REGISTRY[t.tool_id];
    if (!reg) continue; // already flagged by (1)
    if (t.mandate !== reg.mandate_type) {
      diffs.push(`manifest.tools["${slug}"].mandate "${t.mandate}" != KERNEL_REGISTRY["${t.tool_id}"].mandate_type "${reg.mandate_type}"`);
    }
  }

  if (diffs.length) {
    console.error(`FAIL: manifest-sync (${diffs.length} divergence(s)):`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: manifest-sync — ${registryToolIds.size} tools and ${chainNames.size} chains `
    + `in data/tools-manifest.json match worker.mjs's KERNEL_REGISTRY/CHAINS.`
  );
  process.exitCode = 0;
}

main();
