#!/usr/bin/env node
import fs from "node:fs";

const input = process.argv.slice(2).join(" ").trim();
if (!input) {
  console.error("Usage: node scripts/parse-event.mjs \"matika test 5.12. 9:30\"");
  process.exit(1);
}

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Missing GROQ_API_KEY");
  process.exit(1);
}

const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const now = new Date();
const tz = process.env.TZ_NAME || "Europe/Prague";
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const weekday = new Intl.DateTimeFormat("cs-CZ", { timeZone: tz, weekday: "long" }).format(now);

const system = `Jsi parser školních událostí pro studenta SPŠE Ječná. Dnes je ${weekday} ${today} (Europe/Prague).
Z uživatelského textu extrahuj jednu událost a vrať POUZE validní JSON objekt bez markdownu.
Schéma:
{
  "title": "krátký název",
  "subject": "předmět nebo prázdný řetězec",
  "type": "test|ukol|zkouseni|projekt|akce|jine",
  "date": "YYYY-MM-DD",
  "time": "HH:MM nebo null",
  "description": "původní/zkrácený popis",
  "confidence": 0.0-1.0
}
Pravidla:
- Rozuměj českým zkratkám: mat/matika=Matematika, čj/cej=Český jazyk, aj/ang=Angličtina, fyz=Fyzika, prg/programko=Programování, web=Webové aplikace, db/databaze=Databáze, sit/sitě=Počítačové sítě, hw=Hardware, sw=Software, tv=tělocvik, dej=dějepis, zj=základy elektrotechniky apod.
- "test", "pisemka", "zkouseni" => type test/zkouseni; "ukol", "du", "odevzdat" => ukol; "projekt" => projekt.
- Pokud rok chybí, zvol nejbližší budoucí datum v kontextu dneška.
- Pokud čas chybí, dej time null.
- Pokud datum nelze určit, dej date null a confidence <= 0.4.
- Nepřidávej žádný další text.`;

const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input }
    ]
  })
});

if (!resp.ok) {
  const err = await resp.text();
  console.error(`Groq API error ${resp.status}: ${err}`);
  process.exit(1);
}

const data = await resp.json();
const content = data.choices?.[0]?.message?.content?.trim() || "";
const jsonStr = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
let parsed;
try {
  parsed = JSON.parse(jsonStr);
} catch {
  console.error("Model did not return valid JSON:", content);
  process.exit(1);
}

const allowed = new Set(["test", "ukol", "zkouseni", "projekt", "akce", "jine"]);
const event = {
  title: String(parsed.title || input).slice(0, 120),
  subject: String(parsed.subject || "").slice(0, 80),
  type: allowed.has(parsed.type) ? parsed.type : "jine",
  date: typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
  time: typeof parsed.time === "string" && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : null,
  description: String(parsed.description || input).slice(0, 500),
  confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
};

process.stdout.write(JSON.stringify(event));
