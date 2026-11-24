#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const [eventsPath, eventJson, source = "manual"] = process.argv.slice(2);
if (!eventsPath || !eventJson) {
  console.error("Usage: node scripts/add-event.mjs <events.json> <event-json> [source]");
  process.exit(1);
}

const raw = fs.readFileSync(eventsPath, "utf8");
const data = JSON.parse(raw);
if (!Array.isArray(data.events)) data.events = [];

const event = JSON.parse(eventJson);
if (!event.date) {
  console.error("Event missing date; refusing to add.");
  process.exit(2);
}

const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
const record = {
  id,
  title: event.title || "Událost",
  subject: event.subject || "",
  type: event.type || "jine",
  date: event.date,
  time: event.time || null,
  description: event.description || "",
  source,
  createdAt: new Date().toISOString()
};

const dup = data.events.find(e => e.title === record.title && e.date === record.date && e.time === record.time && e.type === record.type);
if (dup) {
  console.log(JSON.stringify({ added: false, reason: "duplicate", event: dup }));
  process.exit(0);
}

data.events.push(record);
data.events.sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")));
fs.writeFileSync(eventsPath, JSON.stringify(data, null, 2) + "\n");
console.log(JSON.stringify({ added: true, event: record }));
