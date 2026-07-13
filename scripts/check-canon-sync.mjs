// Canon-sync CI gate (NT) — asserts the worker + kernels stay in lockstep with the LOCAL
// committed data/canon.js (CH_CANON), the single source of truth vendored into this repo and
// shared byte-for-byte with the site. FAILS (exit 1) on any divergence.
//
// Two assertions (CIGOLD-PARITY-SPEC §1.4.2):
//   (A) CANON_VERSION lockstep: worker.mjs `const CANON_VERSION` == CH_CANON.CANON_VERSION.
//   (B) Vendored kernel consts == their canon fields (the §1.4.2 map below).
//
// canon.js is a browser/CommonJS dual script ending with
//   `if (typeof module!=='undefined'&&module.exports) module.exports = CH_CANON;`
// so it's evaluated in a vm sandbox with a stub `module = { exports: {} }`.
//
// Usage: node scripts/check-canon-sync.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKER_PATH = resolve(ROOT, 'worker.mjs');
const CANON_PATH = resolve(ROOT, 'data', 'canon.js');

const FLOAT_TOL = 1e-9;
function numEq(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    return Math.abs(a - b) <= Math.abs(a || 1) * FLOAT_TOL;
  }
  return a === b;
}

// ── Load canon (vm sandbox with CommonJS module stub) ─────────────────────────
function loadCanon() {
  const text = readFileSync(CANON_PATH, 'utf8');
  const sandbox = { module: { exports: {} }, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(text, sandbox, { filename: 'canon.js', timeout: 5000 });
  const C = sandbox.module.exports;
  if (!C || !C.CANON_VERSION) {
    throw new Error('canon.js evaluated but module.exports.CANON_VERSION is missing');
  }
  return C;
}

// ── Extract a single `const NAME = <literal>;` value from a kernel source ──────
// Evaluates just the RHS literal in a vm sandbox (numbers, arrays-of-objects) —
// robust to formatting/comments, no external references.
function extractConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error(`const ${name} not found`);
  // Slice from just after '=' to the terminating ';' at depth 0 (handles [] and {} literals).
  let i = m.index + m[0].length;
  let depth = 0;
  let start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) break;
  }
  const literal = src.slice(start, i).trim();
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`globalThis.__v = ${literal};`, sandbox, { filename: `${name}-literal`, timeout: 5000 });
  return sandbox.__v;
}

function kernelSrc(slug) {
  return readFileSync(resolve(ROOT, 'kernels', `${slug}.kernel.mjs`), 'utf8');
}

// ── The constant → canon map (SPEC §1.4.2 authority) ──────────────────────────
function buildChecks(C) {
  const td = kernelSrc('time-dilation');
  const kp = kernelSrc('kinetic-probe');
  const vf = kernelSrc('vat-feasibility');
  const ac = kernelSrc('acceleration-ceiling');
  const cl = kernelSrc('comms-lag');
  const rd = kernelSrc('ring-density');
  const bs = kernelSrc('birthday-sacrifice');
  const sb = kernelSrc('synthetic-body');
  const augCeil = C.feasibility.augmentation.map((a) => a.ceiling);
  return [
    ['time-dilation SERIES0_CEILING',  extractConst(td, 'SERIES0_CEILING'),  C.series[0].ceiling],
    ['time-dilation SERIES0_RESET_MO', extractConst(td, 'SERIES0_RESET_MO'), C.series[0].resetMonths],
    ['time-dilation LIFESPAN_YR',      extractConst(td, 'LIFESPAN_YR'),      C.feasibility.lifespanYr],
    ['kinetic-probe PROBE_MASS_KG',    extractConst(kp, 'PROBE_MASS_KG'),    C.probe.massKg],
    ['kinetic-probe PROBE_VAP_JKG',    extractConst(kp, 'PROBE_VAP_JKG'),    C.probe.vaporizationJPerKg],
    ['kinetic-probe TERM_V_MS',        extractConst(kp, 'TERM_V_MS'),        C.probe.terminalVMs],
    ['kinetic-probe DIST_LY_LOW',      extractConst(kp, 'DIST_LY_LOW'),      C.probe.distanceLyLow],
    ['kinetic-probe DIST_LY_HIGH',     extractConst(kp, 'DIST_LY_HIGH'),     C.probe.distanceLyHigh],
    ['vat-feasibility BRAIN_W',          extractConst(vf, 'BRAIN_W'),          C.feasibility.brainWatts],
    ['vat-feasibility SUPPORT_OVERHEAD', extractConst(vf, 'SUPPORT_OVERHEAD'), C.feasibility.supportOverhead],
    ['vat-feasibility LANDAUER_J',       extractConst(vf, 'LANDAUER_J'),       C.feasibility.landauerJ],
    ['vat-feasibility SAHARA_AREA_M2',   extractConst(vf, 'SAHARA_AREA_M2'),   C.feasibility.saharaAreaM2],
    ['vat-feasibility SAHARA_YIELD_WM2', extractConst(vf, 'SAHARA_YIELD_WM2'), C.feasibility.saharaYieldWPerM2],
    ['vat-feasibility AUG_STAGES[].ceiling',
      extractConst(vf, 'AUG_STAGES').map((a) => a.ceiling), augCeil],
    ['acceleration-ceiling BRAIN_W', extractConst(ac, 'BRAIN_W'), C.feasibility.brainWatts],
    ['acceleration-ceiling AUGMENTATION[].floor',   extractConst(ac, 'AUGMENTATION').map((a) => a.floor),   C.feasibility.augmentation.map((a) => a.floor)],
    ['acceleration-ceiling AUGMENTATION[].ceiling', extractConst(ac, 'AUGMENTATION').map((a) => a.ceiling), C.feasibility.augmentation.map((a) => a.ceiling)],
    ['comms-lag ALPHA_FRAME_MS',   extractConst(cl, 'ALPHA_FRAME_MS'),   C.feasibility.alphaFrameMs],
    ['comms-lag SERIES0_CEILING',  extractConst(cl, 'SERIES0_CEILING'),  C.series[0].ceiling],
    ['comms-lag CENTAURI_CEILING', extractConst(cl, 'CENTAURI_CEILING'), C.series[3].ceiling],
    ['ring-density RING_CIRCUMFERENCE_KM', extractConst(rd, 'RING_CIRCUMFERENCE_KM'), C.housing.ringCircumferenceKm],
    ['ring-density SKYSCRAPER_RESIDENTS',  extractConst(rd, 'SKYSCRAPER_RESIDENTS'),  C.housing.skyscraperResidents],
    ['ring-density TARGET_POP',            extractConst(rd, 'TARGET_POP'),            C.population.humans],
    ['birthday-sacrifice SIM_YEARS_PER_BLOCK', extractConst(bs, 'SIM_YEARS_PER_BLOCK'), C.simYearsPerBlock],
    ['birthday-sacrifice SERIES0_CEILING',     extractConst(bs, 'SERIES0_CEILING'),     C.series[0].ceiling],
    ['birthday-sacrifice PLUTO_START',         extractConst(bs, 'PLUTO_START'),         C.plutoDoublingSchedule[0]],
    ['synthetic-body OSMIUM_D',   extractConst(sb, 'OSMIUM_D'),   C.synthBody.materials.osmium],
    ['synthetic-body STEEL_D',    extractConst(sb, 'STEEL_D'),    C.synthBody.materials.steel],
    ['synthetic-body TITANIUM_D', extractConst(sb, 'TITANIUM_D'), C.synthBody.materials.titanium],
    ['synthetic-body ALUMINUM_D', extractConst(sb, 'ALUMINUM_D'), C.synthBody.materials.aluminum],
    ['synthetic-body CARBON_D',   extractConst(sb, 'CARBON_D'),   C.synthBody.materials.carbonComposite],
    ['synthetic-body OSMIUM_KG',  extractConst(sb, 'OSMIUM_KG'),  C.synthBody.totalMassKg],
    ['synthetic-body HUMAN_KG',   extractConst(sb, 'HUMAN_KG'),   C.synthBody.avgHumanKg],
  ];
  // NOTE: kinetic-probe C_MS (2.998e8) is a flagged real-science constant, NOT in canon — SKIPPED
  // by design (assert presence + comment, not a canon diff). Presence is confirmed by node --check
  // + the kernel-fixture unit; the canon-sync gate does not diff it.
}

function extractWorkerCanonVersion() {
  const src = readFileSync(WORKER_PATH, 'utf8');
  const m = /^const CANON_VERSION = '([^']+)';$/m.exec(src);
  if (!m) throw new Error('const CANON_VERSION not found in worker.mjs');
  return m[1];
}

function main() {
  let C;
  try {
    C = loadCanon();
  } catch (e) {
    console.error(`FAIL: could not load data/canon.js — ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const diffs = [];

  // (A) CANON_VERSION lockstep
  let workerCV;
  try {
    workerCV = extractWorkerCanonVersion();
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  if (workerCV !== C.CANON_VERSION) {
    diffs.push(`CANON_VERSION mismatch: worker.mjs='${workerCV}' canon.js='${C.CANON_VERSION}'`);
  }

  // (B) Vendored kernel consts == canon fields
  let checks;
  try {
    checks = buildChecks(C);
  } catch (e) {
    console.error(`FAIL: could not extract kernel constants — ${e.message}`);
    process.exitCode = 1;
    return;
  }
  for (const [label, got, want] of checks) {
    let ok;
    if (Array.isArray(got) || Array.isArray(want)) {
      ok = Array.isArray(got) && Array.isArray(want) && got.length === want.length
        && got.every((v, i) => numEq(v, want[i]));
    } else {
      ok = numEq(got, want);
    }
    if (!ok) {
      diffs.push(`${label}: kernel=${JSON.stringify(got)} canon=${JSON.stringify(want)}`);
    }
  }

  if (diffs.length) {
    console.error(`FAIL: canon-sync (${diffs.length} divergence(s)):`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: canon-sync — CANON_VERSION='${C.CANON_VERSION}' and all ${checks.length} vendored `
    + `kernel constants match data/canon.js.`
  );
  process.exitCode = 0;
}

main();
