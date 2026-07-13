// Stamps the OCG Standard §17 kernel_digest into worker.mjs (KERNEL_DIGEST const) —
// a content digest of worker.mjs itself, computed with the KERNEL_DIGEST line's own value
// blanked to a literal 'PLACEHOLDER' so the digest is stable/self-referential. Idempotent:
// running this twice yields the same digest and no further diff.
// Also emits data/tools-manifest.json (DISCOVERY-SPEC §2.2) from worker.mjs's
// KERNEL_REGISTRY/CHAINS (structural SSOT) + TOOL_META/CHAIN_META (presentation
// overlay) — the asset list_newtripoli_tools/build_workflow_links/find_tool/
// find_chain all read via loadData. Static imports are hoisted, so this reads the
// PRE-stamp worker.mjs — safe, since TOOL_META/CHAINS/CHAIN_META/KERNEL_REGISTRY
// never depend on KERNEL_DIGEST's value.
// Usage:  node generate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceDigest } from './lib/_buildid.mjs';
import { KERNEL_REGISTRY, CHAINS, TOOL_META, CHAIN_META, BASE_URL } from './worker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// OCG Standard §17 — stamp KERNEL_DIGEST into worker.mjs.
// ---------------------------------------------------------------------------
const WORKER_PATH = resolve(ROOT, 'worker.mjs');
const KERNEL_DIGEST_RE = /^const KERNEL_DIGEST = 'sha256:(?:[0-9a-f]{64}|PLACEHOLDER)';$/m;

const workerSrc = readFileSync(WORKER_PATH, 'utf8');
if (!KERNEL_DIGEST_RE.test(workerSrc)) {
  throw new Error('generate.mjs: KERNEL_DIGEST line not found in worker.mjs (§17 stamp aborted).');
}

// Blank the KERNEL_DIGEST line's value to the literal 'PLACEHOLDER' so the digest is
// self-referential/stable, LF-normalize (sourceDigest does this too, but be explicit),
// then compute the digest over that neutralized text.
const neutralized = workerSrc.replace(KERNEL_DIGEST_RE, "const KERNEL_DIGEST = 'sha256:PLACEHOLDER';");
const digest = await sourceDigest(neutralized);

const stamped = workerSrc.replace(KERNEL_DIGEST_RE, `const KERNEL_DIGEST = '${digest}';`);
writeFileSync(WORKER_PATH, stamped);

console.log(`Stamped §17 KERNEL_DIGEST into worker.mjs: ${digest}`);

// ---------------------------------------------------------------------------
// DISCOVERY-SPEC §2.2 — data/tools-manifest.json.
// ---------------------------------------------------------------------------

// Vendored verbatim from AINumbers mcp-apps-poc/generate.mjs (tokenizeForIndex +
// buildBM25 @127-149) — DISCOVERY-SPEC §6.
function tokenizeForIndex(text) {
  return (text ?? '').toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function buildBM25(docs, getTextField) {
  const N = docs.length;
  if (!N) return { tfs: [], docLengths: [], avgDocLength: 1, idf: {} };
  const tfs = docs.map(doc => {
    const counts = {};
    for (const t of tokenizeForIndex(getTextField(doc))) counts[t] = (counts[t] || 0) + 1;
    return counts;
  });
  const docLengths = tfs.map(tf => Object.values(tf).reduce((s, c) => s + c, 0));
  const avgDocLength = docLengths.reduce((s, c) => s + c, 0) / N || 1;
  const df = {};
  for (const tf of tfs) for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1;
  const idf = {};
  for (const [t, f] of Object.entries(df)) idf[t] = Math.log((N - f + 0.5) / (f + 0.5) + 1);
  return { tfs, docLengths, avgDocLength, idf };
}

// manifest.tools — keyed by slug (DISCOVERY-SPEC §2.2), sourced from TOOL_META
// (presentation) + KERNEL_REGISTRY (mandate_type, structural SSOT).
const manifestTools = {};
for (const [toolId, meta] of Object.entries(TOOL_META)) {
  const reg = KERNEL_REGISTRY[toolId];
  if (!reg) throw new Error(`generate.mjs: TOOL_META has ${toolId} but KERNEL_REGISTRY does not — key parity broken.`);
  manifestTools[meta.slug] = {
    tool_id: toolId,
    mandate: reg.mandate_type,
    title: meta.title,
    description: meta.description,
    register: meta.register,
    guest_legal: meta.guest_legal,
    category: meta.register,
    path: meta.permalink_path,
    inputs: meta.inputs,
    citations: meta.citations,
    hashNote: meta.guest_legal === false ? 'hash-verifiable only (non-guest-legal)' : null,
  };
}

// manifest.chains — keyed by chain name, sourced from CHAINS (step order/tool_id,
// structural SSOT) + CHAIN_META (presentation overlay). Per-step `tool` = slug,
// resolved from TOOL_META so build_workflow_links' bySlug lookup always hits.
const manifestChains = {};
for (const [chainName, chain] of Object.entries(CHAINS)) {
  const meta = CHAIN_META[chainName];
  if (!meta) throw new Error(`generate.mjs: CHAINS has "${chainName}" but CHAIN_META does not — key parity broken.`);
  if (meta.steps.length !== chain.steps.length) {
    throw new Error(`generate.mjs: CHAIN_META["${chainName}"].steps count (${meta.steps.length}) != CHAINS step count (${chain.steps.length}).`);
  }
  manifestChains[chainName] = {
    title: meta.title,
    description: meta.description,
    tier: meta.tier,
    register: meta.register,
    page: meta.page,
    steps: meta.steps.map((s) => ({ tool: s.slug, handoff: s.handoff })),
  };
}

// search.tools — BM25 index over manifest.tools.
const toolSearchDocs = Object.entries(manifestTools).map(([slug, t]) => ({
  tool_id: t.tool_id,
  slug,
  title: t.title,
  mandate: t.mandate,
  register: t.register,
  guest_legal: t.guest_legal,
  url: BASE_URL + '/' + t.path,
  _text: [t.tool_id, t.title, t.description, t.register, t.mandate, t.citations.join(' ')].join(' '),
}));
const toolIndex = buildBM25(toolSearchDocs, d => d._text);
const toolSearchDocsClean = toolSearchDocs.map(({ _text, ...d }) => d);

// search.chains — BM25 index over manifest.chains.
const chainSearchDocs = Object.entries(manifestChains).map(([chainName, c]) => {
  const steps = c.steps.map((s, i) => {
    const t = manifestTools[s.tool];
    return { order: i + 1, tool_id: t?.tool_id ?? null, slug: s.tool, url: t ? BASE_URL + '/' + t.path : null, handoff: s.handoff };
  });
  return {
    chain_name: chainName,
    title: c.title,
    description: c.description,
    register: c.register,
    tier: c.tier,
    step_count: steps.length,
    entry_tool_id: steps[0]?.tool_id ?? null,
    steps,
    chain_url: c.page ? BASE_URL + '/' + c.page : null,
    _text: [chainName, c.title, c.description, steps.map(s => s.tool_id + ' ' + (s.handoff ?? '')).join(' ')].join(' '),
  };
});
const chainIndex = buildBM25(chainSearchDocs, d => d._text);
const chainSearchDocsClean = chainSearchDocs.map(({ _text, ...d }) => d);

const manifest = {
  tools: manifestTools,
  chains: manifestChains,
  search: {
    tools:  { docs: toolSearchDocsClean,  ...toolIndex  },
    chains: { docs: chainSearchDocsClean, ...chainIndex },
  },
};

writeFileSync(resolve(ROOT, 'data', 'tools-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Emitted data/tools-manifest.json: ${Object.keys(manifestTools).length} tools, `
  + `${Object.keys(manifestChains).length} chains.`
);
