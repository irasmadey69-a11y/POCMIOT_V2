const KEY = "PODMIOT_V2_STATE";

export function defaultState() {
  return {
    version: "2.0",
    identity: {
      hostName: "Irek",
      goalNow: "Budować audytowalny podmiot decyzyjny",
      createdAt: new Date().toISOString()
    },
    priorities: { coherence: 85, truth: 90, help: 70, like: 40 },
    relationalCost: 0,
    commitments: [],   // {id, text, createdAt, active:true}
    journal: []        // events
  };
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return defaultState();
  try {
    const st = JSON.parse(raw);
    return { ...defaultState(), ...st };
  } catch {
    return defaultState();
  }
}

export function saveState(st) {
  localStorage.setItem(KEY, JSON.stringify(st));
}

export function resetState() {
  localStorage.removeItem(KEY);
}

export function addEvent(st, type, payload) {
  st.journal.push({
    t: new Date().toISOString(),
    type,
    payload
  });
}