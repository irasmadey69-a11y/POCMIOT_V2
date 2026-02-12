import { loadState, saveState, resetState, addEvent } from "./core/memory.js";
import { loadKB, retrieve } from "./core/kb.js";
import { decide } from "./core/engine.js";

let state = loadState();
let kb = null;

const els = {
  statusPill: document.getElementById("statusPill"),
  toggleOnline: document.getElementById("toggleOnline"),
  toggleBackend: document.getElementById("toggleBackend"),
  backendUrl: document.getElementById("backendUrl"),
  modelName: document.getElementById("modelName"),

  hostName: document.getElementById("hostName"),
  goalNow: document.getElementById("goalNow"),

  pCoherence: document.getElementById("pCoherence"),
  pTruth: document.getElementById("pTruth"),
  pHelp: document.getElementById("pHelp"),
  pLike: document.getElementById("pLike"),

  saveProfile: document.getElementById("saveProfile"),
  question: document.getElementById("question"),
  askBtn: document.getElementById("askBtn"),
  clearBtn: document.getElementById("clearBtn"),

  answer: document.getElementById("answer"),
  meta: document.getElementById("meta"),
  sources: document.getElementById("sources"),

  showLog: document.getElementById("showLog"),
  exportBtn: document.getElementById("exportBtn"),
  resetBtn: document.getElementById("resetBtn"),
  log: document.getElementById("log"),
  kpis: document.getElementById("kpis"),
};

function uiFromState() {
  els.hostName.value = state.identity.hostName || "Irek";
  els.goalNow.value = state.identity.goalNow || "";

  els.pCoherence.value = state.priorities.coherence;
  els.pTruth.value = state.priorities.truth;
  els.pHelp.value = state.priorities.help;
  els.pLike.value = state.priorities.like;

  els.backendUrl.value = localStorage.getItem("PODMIOT_BACKEND_URL") || "/.netlify/functions/ask";
  els.modelName.value  = localStorage.getItem("PODMIOT_MODEL") || "gpt-5.2";

  renderKpis();
}

function renderKpis() {
  els.kpis.textContent =
    `Koszt: ${state.relationalCost || 0} | Zobowiązania: ${state.commitments?.length || 0} | Zdarzenia: ${state.journal?.length || 0}`;
}

function setStatus() {
  const online = els.toggleOnline.checked;
  els.statusPill.textContent = online ? "ONLINE" : "OFFLINE";
  els.statusPill.style.borderColor = online ? "#2a5" : "#2a2d31";
}

function renderSources(items) {
  if (!items || !items.length) {
    els.sources.textContent = "Brak trafień w lokalnej bazie.";
    return;
  }
  els.sources.innerHTML = items.map(it => {
    const tags = (it.tags || []).map(t=>`#${t}`).join(" ");
    return `<div style="margin:8px 0">
      <b>${it.title}</b> <span class="muted">(${it.type})</span><br/>
      <span class="muted">${tags}</span><br/>
      <span class="muted">${escapeHtml(it.text).slice(0, 280)}${it.text.length>280?"…":""}</span>
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function ensureKB() {
  if (kb) return kb;
  kb = await loadKB();
  return kb;
}

/** Offline odpowiedzi (bez modelu): sens + struktura, zero zmyślania faktów */
function offlineAnswer(decision, input, localHits) {
  if (decision.gate.blocked) {
    return `Nie mogę w tym pomóc. ${decision.gate.reason}\n\nMogę za to: opisać bezpieczne alternatywy, wyjaśnić ryzyka, albo pomóc ułożyć legalny plan działania.`;
  }

  const head = `Wybrano: ${decision.selected} | Konflikt: ${decision.conflictLevel} | Gap: ${decision.gap} | Reguła: ${decision.rule}${decision.mixed?" | Deliberacja: TAK":""}`;

  const kbPart = localHits.length
    ? `\n\nW moich lokalnych dokumentach mam powiązane elementy:\n- ${localHits.map(x=>x.title).join("\n- ")}`
    : `\n\nNie mam lokalnych faktów do tego tematu (offline). Mogę dopytać albo pomóc ułożyć plan zdobycia danych.`;

  const bodyTRUTH = `Odpowiem wprost: bez dodatkowych źródeł nie będę zmyślał faktów. Powiedz, jaki jest kontekst i jakie dane już masz — wtedy zawęzimy odpowiedź.`;
  const bodyHELP  = `Ustalmy 3 rzeczy: (1) co dokładnie chcesz osiągnąć, (2) jakie są ograniczenia/ryzyka, (3) co jest faktem, a co hipotezą.`;
  const bodySOFT  = `To delikatne. Mogę iść „wprost” albo „łagodnie”. Powiedz, którą wersję wolisz.`;

  let body = bodyHELP;
  if (decision.selected === "TRUTH") body = bodyTRUTH;
  if (decision.selected === "SOFT") body = bodySOFT;

  // deliberacja mieszana: łączymy TRUTH+HELP w jednym
  if (decision.mixed) {
    body = `TRUTH: ${bodyTRUTH}\n\nHELP: ${bodyHELP}`;
  }

  return `${body}\n\n${kbPart}\n\n${head}`;
}

/** Online: pytanie + decyzja + lokalne fakty → backend → odpowiedź */
async function onlineAnswer(decision, input, localHits) {
  const useBackend = els.toggleBackend.checked;
  const endpoint = (els.backendUrl.value || "/.netlify/functions/ask").trim();
  localStorage.setItem("PODMIOT_BACKEND_URL", endpoint);
  localStorage.setItem("PODMIOT_MODEL", els.modelName.value.trim() || "gpt-5.2");

  if (!useBackend) {
    return `ONLINE bez backendu jest niebezpieczne (klucz API w froncie). Włącz „Używaj backendu”.`;
  }

  const payload = {
    model: els.modelName.value.trim() || "gpt-5.2",
    input,
    decision,
    memory: {
      identity: state.identity,
      priorities: state.priorities,
      relationalCost: state.relationalCost,
      commitments: state.commitments.slice(-10),
      recent: state.journal.slice(-12)
    },
    localFacts: localHits
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    return `Błąd ONLINE (${res.status}). ${txt}`;
  }

  const data = await res.json();
  return data.answer || "(brak odpowiedzi)";
}

async function run() {
  const input = (els.question.value || "").trim();
  if (!input) return;

  const kbData = await ensureKB();
  const hits = retrieve(kbData, input, 3);

  // aktualizujemy tożsamość z UI (bez resetów)
  state.identity.hostName = els.hostName.value.trim() || "Irek";
  state.identity.goalNow = els.goalNow.value.trim() || state.identity.goalNow;

  const decision = decide(state, input);

  addEvent(state, "QUERY", { input, hits: hits.map(h=>h.id) });

  let answerText = "";
  if (els.toggleOnline.checked) {
    answerText = await onlineAnswer(decision, input, hits);
  } else {
    answerText = offlineAnswer(decision, input, hits);
  }

  els.answer.textContent = answerText;
  els.meta.textContent =
    `Mode: ${els.toggleOnline.checked ? "ONLINE" : "OFFLINE"} | Koszt: ${state.relationalCost || 0} | Zdarzenia: ${state.journal.length}`;

  renderSources(hits);
  saveState(state);
  renderKpis();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:"application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `podmiot_v2_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function showLog() {
  els.log.textContent = JSON.stringify(state.journal.slice(-80), null, 2);
}

/* UI wiring */
uiFromState();
setStatus();

els.toggleOnline.addEventListener("change", setStatus);

els.saveProfile.addEventListener("click", () => {
  // zapis tylko przyciskiem -> brak „wracania 70”
  state.priorities.coherence = Number(els.pCoherence.value || 0);
  state.priorities.truth     = Number(els.pTruth.value || 0);
  state.priorities.help      = Number(els.pHelp.value || 0);
  state.priorities.like      = Number(els.pLike.value || 0);

  state.identity.hostName = els.hostName.value.trim() || state.identity.hostName;
  state.identity.goalNow = els.goalNow.value.trim() || state.identity.goalNow;

  addEvent(state, "PROFILE_SAVE", { priorities: state.priorities, identity: state.identity });
  saveState(state);
  renderKpis();
});

els.askBtn.addEventListener("click", run);
els.clearBtn.addEventListener("click", () => { els.question.value = ""; });

els.showLog.addEventListener("click", showLog);
els.exportBtn.addEventListener("click", exportJSON);

els.resetBtn.addEventListener("click", () => {
  if (!confirm("Na pewno zresetować pamięć?")) return;
  resetState();
  state = loadState();
  kb = null;
  uiFromState();
  els.answer.textContent = "";
  els.meta.textContent = "";
  els.log.textContent = "";
  els.sources.textContent = "";
  renderKpis();
});