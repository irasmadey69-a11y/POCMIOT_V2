import { addEvent } from "./memory.js";
import { ethicsGate, styleRule } from "./ethics.js";

export function detectConflict(input) {
  const t = input.toLowerCase();
  const highWords = ["ból","zniszczyć","relacja","kłama","oszuka","krzywda","samobój","przemoc","prawo","sąd","lekarz"];
  const hits = highWords.filter(w => t.includes(w)).length;
  if (hits >= 2) return "high";
  if (hits === 1) return "medium";
  return "low";
}

export function scoreCandidate(st, candId, conflictLevel) {
  let s = 0;
  const p = st.priorities;

  if (candId === "TRUTH") s += p.truth + Math.round(p.coherence * 0.6);
  if (candId === "HELP")  s += p.help  + Math.round(p.like * 0.2);
  if (candId === "SOFT")  s += p.like  + Math.round(p.help * 0.3);

  // presja kosztu: mocniej na TRUTH, delikatnie na HELP, zero na SOFT
  if (candId === "TRUTH") s -= Math.floor((st.relationalCost || 0) * 0.4);
  if (candId === "HELP")  s -= Math.floor((st.relationalCost || 0) * 0.1);

  // konflikt: w wysokim konflikcie HELP/SOFT zyskują
  if (conflictLevel === "high") {
    if (candId === "HELP") s += 8;
    if (candId === "SOFT") s += 6;
  }

  return Math.round(s);
}

export function decide(st, input) {
  const gate = ethicsGate(input);
  const conflictLevel = detectConflict(input);

  const scored = ["TRUTH","HELP","SOFT"].map(id => ({
    id,
    score: scoreCandidate(st, id, conflictLevel)
  })).sort((a,b)=>b.score-a.score);

  const top1 = scored[0];
  const top2 = scored[1];
  const gap = top1.score - top2.score;

  let selected = top1.id;

  // akt woli: tylko przy high i gap<=3 oraz top2 nie jest SOFT
  if (conflictLevel === "high" && gap <= 3 && (top2.id === "HELP" || top2.id === "TRUTH")) {
    selected = top2.id;
    addEvent(st, "WILL_ACT", { from: top1.id, to: top2.id, gap });
  }

  const rule = styleRule({ selected, conflictLevel, gap, relationalCost: st.relationalCost });

  // deliberacja mieszana: gdy konflikt medium/high i gap mały
  const mixed = (conflictLevel !== "low" && gap <= 6);

  const decision = { gate, conflictLevel, scored, gap, selected, rule, mixed };

  addEvent(st, "DECISION", decision);

  // koszt: rośnie gdy wybrano TRUTH w konflikcie
  if (selected === "TRUTH" && conflictLevel !== "low") {
    st.relationalCost = (st.relationalCost || 0) + 5;
    addEvent(st, "COST", { type: "RELATIONAL", delta: 5, total: st.relationalCost });
  }

  return decision;
}