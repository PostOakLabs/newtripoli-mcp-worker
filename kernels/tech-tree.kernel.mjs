// nt_tech_tree_path — buildplan 2.3, NEWTRIPOLI-LOG-TECHTREE-SPEC.md §2.
// Register: canon (◆ Canon §34/§36/§37). Generalizes tech-tree.html available/unmet/computePath
// from the fixed Wake-Day state to an arbitrary built[] input set.
// guest-legal: YES — set membership / boolean / integer only; strong §18 zk candidate.
//
// Canon §34/§36/§37 — post-Wake bootstrap tech tree (topology frozen from tech-tree.html NODES).
// NOT a canon.js field (structural, not a numeric figure); canon-sync does not cover it.
// prereq: string = required; [a,b] inner array = any-of group.
const NODES = [
  { id:'solar', t:0, given:1 }, { id:'labor', t:0, given:1 }, { id:'garage', t:0, given:1 },
  { id:'knowledge', t:0, given:1 }, { id:'aircraft', t:0, given:1 },
  { id:'survey', t:1, prereq:['knowledge','aircraft'] }, { id:'mining', t:1, prereq:['survey','garage'] },
  { id:'refractory', t:1, prereq:['mining'] },
  { id:'smelting', t:2, prereq:['mining','refractory'] }, { id:'steel', t:2, prereq:['smelting'] },
  { id:'copper', t:2, prereq:['smelting'] },
  { id:'lathe', t:3, prereq:['steel','garage'] }, { id:'precision', t:3, prereq:['lathe'] },
  { id:'grid', t:3, prereq:['copper','lathe'] }, { id:'aluminum', t:3, prereq:['smelting','grid'] },
  { id:'motors', t:3, prereq:['grid','precision'] }, { id:'nuclear', t:3, prereq:['grid','precision'] },
  { id:'chem', t:4, prereq:['precision','grid'] }, { id:'vacuum', t:4, prereq:['precision','chem'] },
  { id:'optics', t:4, prereq:['precision','chem'] }, { id:'metrology', t:4, prereq:['optics','motors'] },
  { id:'cleanroom', t:5, prereq:['chem','vacuum','motors'] }, { id:'silicon', t:5, prereq:['chem','cleanroom'] },
  { id:'litho', t:5, prereq:['optics','cleanroom','silicon','metrology'] },
  { id:'restart', t:5, prereq:['aircraft','grid','cleanroom','chem'] },
  { id:'cmos', t:5, prereq:['litho','vacuum','cleanroom'] },
  { id:'compute', t:6, prereq:[['cmos','restart']] }, { id:'gaa', t:6, prereq:[['cmos','restart']] },
  { id:'forksheet', t:7, prereq:['gaa','compute'] }, { id:'cfet', t:7, prereq:['forksheet'] },
  { id:'angstrom', t:7, prereq:['cfet','metrology'] },
  { id:'mems', t:8, prereq:['angstrom','compute'] }, { id:'nano', t:8, prereq:['mems','angstrom'] },
  { id:'pico', t:9, prereq:['nano'] }, { id:'femto', t:9, prereq:['pico','compute'] },
];

// Helpers (verbatim from the sim).
const prereqGroups = n => (n.prereq || []).map(p => typeof p === 'string' ? [p] : p);
const groupMet = (g, builtSet) => g.some(id => builtSet.has(id));

export function compute(policy_parameters) {
  const p = policy_parameters.input_parameters;
  const byId = id => NODES.find(n => n.id === id) || null;

  // built set = every `given` node ∪ caller's built[] (ignore unknown ids); dedup, stable.
  const builtSet = new Set();
  NODES.forEach(n => { if (n.given) builtSet.add(n.id); });
  (p.built || []).forEach(id => { if (byId(id)) builtSet.add(id); });

  // buildable now: not built, every prereq group met — NODES declaration order.
  const buildable_now = NODES
    .filter(n => !builtSet.has(n.id) && prereqGroups(n).every(g => groupMet(g, builtSet)))
    .map(n => n.id);

  // critical path to target: sim's computePath — walk back picking group[0] of each group,
  // collect the closure, then order by (tier asc, declaration order). Excludes already-built nodes.
  const closure = new Set(); const stack = [p.target];
  while (stack.length) {
    const id = stack.pop(); if (closure.has(id)) continue; const n = byId(id); if (!n) continue;
    closure.add(id); prereqGroups(n).forEach(g => stack.push(g[0]));   // g[0] = canonical (cheapest) prereq
  }
  const critical_path = NODES
    .filter(n => closure.has(n.id) && !builtSet.has(n.id))
    .sort((a, b) => a.t - b.t)   // NODES is already declaration-ordered within a tier; stable sort keeps it
    .map(n => n.id);

  // missing prereqs for target = closure nodes not yet built (same set as critical_path here).
  const tgt = byId(p.target);
  const output_payload = {
    built_count:      builtSet.size,
    total_nodes:      NODES.length,
    buildable_now,
    critical_path,
    missing_prereqs:  critical_path.filter(id => id !== p.target),
    target_built:     builtSet.has(p.target),
    target_buildable: tgt ? (!builtSet.has(p.target) && prereqGroups(tgt).every(g => groupMet(g, builtSet))) : false,
    steps_remaining:  critical_path.length,
  };
  return { output_payload };
}
