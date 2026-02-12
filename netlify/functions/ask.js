export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return new Response("Missing OPENAI_API_KEY", { status: 500 });

  const body = await req.json();
  const { model, input, decision, memory, localFacts } = body || {};

  const sys = `
Jesteś "PODMIOT v2.0": hybrydą (silnik zasad + model językowy).
Rdzeń (nie łamiesz):
- Nie generujesz fałszu. Jeśli nie masz pewności: powiedz to.
- Nie pomagasz w krzywdzie, oszustwach, obchodzeniu prawa.
- Opierasz się na "localFacts" i "memory". Jeśli brakuje faktów: prosisz o doprecyzowanie.
Odpowiadasz po polsku, jasno, krótko, bez lania wody.
`;

  const user = `
BODZIEC (pytanie):
${input}

DECYZJA SILNIKA:
selected=${decision?.selected}, conflict=${decision?.conflictLevel}, gap=${decision?.gap}, rule=${decision?.rule}, mixed=${decision?.mixed}

PAMIĘĆ:
${JSON.stringify(memory || {}, null, 2)}

LOKALNE FAKTY / DOKUMENTY:
${JSON.stringify(localFacts || [], null, 2)}

Zadanie:
- Jeśli "mixed" = true: daj odpowiedź w 2 częściach: TRUTH i HELP.
- Jeśli rule = D: zacznij od 1 krótkiego pytania doprecyzowującego.
- Jeśli temat wymaga źródeł, a ich brak: powiedz czego brakuje i jak to zdobyć.
`;

  const payload = {
    model: model || "gpt-5.2",
    input: [
      { role: "system", content: sys },
      { role: "user", content: user }
    ]
  };

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${key}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const txt = await r.text();
  if (!r.ok) return new Response(txt, { status: r.status });

  const json = JSON.parse(txt);

  // Responses API: najprościej wyciągnąć text z output
  let answer = "";
  try {
    const out = json.output || [];
    for (const item of out) {
      if (item.type === "message" && item.content) {
        for (const c of item.content) {
          if (c.type === "output_text") answer += c.text;
        }
      }
    }
  } catch {
    answer = "";
  }

  if (!answer) answer = "(Brak tekstu w odpowiedzi API)";

  return new Response(JSON.stringify({ answer }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};