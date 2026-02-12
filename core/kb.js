export async function loadKB() {
  const res = await fetch("./data/kb.json", { cache: "no-store" });
  if (!res.ok) throw new Error("KB load failed");
  return res.json();
}

function norm(s) {
  return (s || "").toLowerCase();
}

export function retrieve(kb, query, limit = 3) {
  const q = norm(query);
  const scored = (kb.items || []).map(it => {
    const hay = norm([it.title, it.text, ...(it.tags || [])].join(" "));
    let score = 0;
    for (const token of q.split(/\s+/).filter(Boolean)) {
      if (hay.includes(token)) score += 2;
    }
    if (hay.includes(q)) score += 4;
    return { it, score };
  }).sort((a,b)=>b.score-a.score);

  return scored.filter(x=>x.score>0).slice(0, limit).map(x=>x.it);
}