const TYPE_LABELS = {
  test: 'Test', ukol: 'Úkol', zkouseni: 'Zkoušení', projekt: 'Projekt', akce: 'Akce', jine: 'Jiné'
};
const TYPE_SET = new Set(Object.keys(TYPE_LABELS));
const AUTH_HASH = 'IWquzRgKeTu2yYksDC9RytvjpJBQB0DaF7B7CjMo6OY='; // SHA-256 base64 for "negr"
const AUTH_KEY = 'calendar_auth_ok';

const CFG = window.APP_CONFIG || {};
const state = {
  events: [],
  month: startOfMonth(new Date()),
  selectedDate: isoDate(new Date()),
  type: 'all',
  search: '',
  repo: detectRepo(),
  groqKey: localStorage.getItem('groq_api_key') || CFG.groqKey || '',
  groqModel: localStorage.getItem('groq_model') || CFG.groqModel || 'llama-3.3-70b-versatile',
  ghToken: localStorage.getItem('gh_token') || '',
  keySource: localStorage.getItem('groq_api_key') ? 'local' : (CFG.groqKey ? 'config' : 'none'),
};

const els = {};

boot();

async function boot() {
  cacheEls();
  wireAuth();
  if (sessionStorage.getItem(AUTH_KEY) === '1') await unlock();
}

function cacheEls() {
  els.monthLabel = document.getElementById('monthLabel');
  els.calendarGrid = document.getElementById('calendarGrid');
  els.agendaList = document.getElementById('agendaList');
  els.agendaTitle = document.getElementById('agendaTitle');
  els.agendaSubtitle = document.getElementById('agendaSubtitle');
  els.statusText = document.getElementById('statusText');
  els.typeFilter = document.getElementById('typeFilter');
  els.searchInput = document.getElementById('searchInput');
  els.repoLink = document.getElementById('repoLink');
  els.newIssueLink = document.getElementById('newIssueLink');
  els.composerForm = document.getElementById('composerForm');
  els.eventInput = document.getElementById('eventInput');
  els.submitBtn = document.getElementById('submitBtn');
  els.configWarning = document.getElementById('configWarning');
  els.settingsBtn = document.getElementById('settingsBtn');
  els.settingsDialog = document.getElementById('settingsDialog');
  els.settingsForm = document.getElementById('settingsForm');
  els.groqKeyInput = document.getElementById('groqKeyInput');
  els.groqModelInput = document.getElementById('groqModelInput');
  els.ghTokenInput = document.getElementById('ghTokenInput');
  els.clearKeyBtn = document.getElementById('clearKeyBtn');
  els.modeBadge = document.getElementById('modeBadge');
}

function wireAuth() {
  const form = document.getElementById('authForm');
  const input = document.getElementById('authPassword');
  const err = document.getElementById('authError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const ok = await checkPassword(input.value);
    if (ok) {
      sessionStorage.setItem(AUTH_KEY, '1');
      input.value = '';
      await unlock();
    } else {
      err.classList.remove('hidden');
      input.focus(); input.select();
    }
  });
}

async function checkPassword(value) {
  try {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
    if (b64 !== AUTH_HASH) return false;
    await tryUnlockStoredToken(value);
    return true;
  } catch { return false; }
}

async function tryUnlockStoredToken(password) {
  const cfg = window.APP_CONFIG || {};
  await decryptIntoState(password, cfg.encryptedGhToken, 'ghToken', 'gh_token');
  await decryptIntoState(password, cfg.encryptedGroqKey, 'groqKey', 'groq_api_key');
  if (state.groqKey) state.keySource = localStorage.getItem('groq_api_key') ? 'local' : 'password';
}

async function decryptIntoState(password, enc, stateKey, storageKey) {
  if (!enc || state[stateKey]) return;
  try {
    const pwKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(enc.s), iterations: 200000, hash: 'SHA-256' },
      pwKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const cipherBytes = b64ToBytes(enc.c);
    const tagBytes = b64ToBytes(enc.t);
    const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
    combined.set(cipherBytes, 0); combined.set(tagBytes, cipherBytes.length);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(enc.i) }, key, combined);
    const val = new TextDecoder().decode(plainBuf);
    if (val) { state[stateKey] = val; localStorage.setItem(storageKey, val); }
  } catch (e) { console.warn('Decrypt failed', stateKey, e); }
}

function b64ToBytes(b64) { const bin = atob(b64); return Uint8Array.from(bin, c => c.charCodeAt(0)); }

async function unlock() {
  document.getElementById('authGate').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  if (!window.__calendarInit) { window.__calendarInit = true; await init(); }
}

async function init() {
  wireUI();
  configureLinks();
  syncSettingsUI();
  await loadEvents();
  render();
}

function wireUI() {
  document.getElementById('prevMonth').addEventListener('click', () => { state.month = addMonths(state.month, -1); render(); });
  document.getElementById('nextMonth').addEventListener('click', () => { state.month = addMonths(state.month, 1); render(); });
  document.getElementById('todayBtn').addEventListener('click', () => { const now = new Date(); state.month = startOfMonth(now); state.selectedDate = isoDate(now); render(); });
  els.typeFilter.addEventListener('change', e => { state.type = e.target.value; render(); });
  els.searchInput.addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); render(); });
  els.composerForm.addEventListener('submit', onSubmit);
  document.querySelectorAll('[data-example]').forEach(btn => btn.addEventListener('click', () => { els.eventInput.value = btn.dataset.example; els.eventInput.focus(); }));
  els.settingsBtn.addEventListener('click', () => els.settingsDialog.showModal());
  els.settingsDialog.addEventListener('click', e => { if (e.target === els.settingsDialog) els.settingsDialog.close(); });
  els.settingsForm.addEventListener('submit', e => {
    e.preventDefault();
    const k = els.groqKeyInput.value.trim();
    const gh = els.ghTokenInput.value.trim();
    state.groqModel = els.groqModelInput.value.trim() || 'llama-3.3-70b-versatile';
    if (k) { localStorage.setItem('groq_api_key', k); state.groqKey = k; state.keySource = 'local'; }
    else { localStorage.removeItem('groq_api_key'); state.groqKey = CFG.groqKey || ''; state.keySource = CFG.groqKey ? 'config' : 'none'; }
    if (gh) { localStorage.setItem('gh_token', gh); state.ghToken = gh; }
    else { localStorage.removeItem('gh_token'); state.ghToken = ''; }
    localStorage.setItem('groq_model', state.groqModel);
    syncSettingsUI();
    els.settingsDialog.close();
    setStatus('Nastavení uloženo.');
  });
  els.clearKeyBtn.addEventListener('click', () => {
    localStorage.removeItem('groq_api_key');
    localStorage.removeItem('gh_token');
    state.groqKey = CFG.groqKey || '';
    state.keySource = CFG.groqKey ? 'config' : 'none';
    state.ghToken = '';
    syncSettingsUI();
    setStatus('Lokální klíče odstraněny.');
  });
}

function syncSettingsUI() {
  els.groqKeyInput.value = localStorage.getItem('groq_api_key') || '';
  els.groqModelInput.value = state.groqModel;
  els.ghTokenInput.value = state.ghToken || '';
  const canCloud = !!state.ghToken && !!state.repo;
  const direct = !!state.groqKey;
  let mode = 'Režim: lokální';
  if (canCloud) mode = direct ? 'Režim: cloud GitHub + AI parsing' : 'Režim: cloud GitHub (přes Issue/Action)';
  else if (direct) mode = 'Režim: lokální + AI parsing';
  els.modeBadge.textContent = mode;
  els.modeBadge.className = 'mode-badge ' + (canCloud ? 'mode-direct' : 'mode-issue');
  els.submitBtn.textContent = canCloud ? 'Přidat do cloudu' : (direct ? 'Přidat lokálně' : 'Vytvořit Issue');
}

function detectRepo() {
  const host = location.hostname;
  const path = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    const owner = host.replace('.github.io', '');
    const repo = path[0] || `${owner}.github.io`;
    return { owner, repo };
  }
  return { owner: 'KyblikPlnejCeleru', repo: 'spse-jecna-kalendar' };
}

function configureLinks() {
  const base = `https://github.com/${state.repo.owner}/${state.repo.repo}`;
  els.repoLink.href = base;
  els.newIssueLink.href = `${base}/issues/new?template=pridat-udalost.yml&labels=event`;
}

async function onSubmit(e) {
  e.preventDefault();
  const text = els.eventInput.value.trim();
  if (!text) return;
  if (state.ghToken && state.repo) await addToCloud(text);
  else if (state.groqKey) await addDirect(text);
  else openIssue(text);
}

function openIssue(text) {
  const url = new URL(`https://github.com/${state.repo.owner}/${state.repo.repo}/issues/new`);
  url.searchParams.set('template', 'pridat-udalost.yml');
  url.searchParams.set('labels', 'event');
  url.searchParams.set('title', `[Událost] ${text.slice(0, 60)}`);
  url.searchParams.set('body', `### Co se děje?\n\n${text}\n`);
  window.open(url.toString(), '_blank', 'noopener');
  setStatus('Otevřeno GitHub Issue. Po odeslání ho Action zpracuje.');
}

async function addToCloud(text) {
  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Ukládám na GitHub…';
  try {
    let event = null;
    if (state.groqKey) {
      setStatus('Parsuji přes Groq…');
      event = await parseWithGroq(text);
      if (!event.date) throw new Error('AI neurčila datum. Napiš datum explicitně.');
    }
    setStatus('Ukládám na GitHub…');
    await saveEventToGitHub(event, text);
    if (event) {
      const record = createRecord(event, 'web-cloud');
      upsertLocal(record);
      state.selectedDate = record.date;
      state.month = startOfMonth(new Date(record.date + 'T00:00:00'));
    }
    els.eventInput.value = '';
    render();
    setStatus(event ? `Uloženo na GitHub: ${event.title} (${formatHumanDate(event.date)}${event.time ? ' ' + event.time : ''}).` : 'Odesláno na GitHub. Action to zpracuje a přidá do kalendáře.');
    // refresh remote data shortly after action may run
    setTimeout(() => loadEvents().then(render), 15000);
    setTimeout(() => loadEvents().then(render), 45000);
  } catch (err) {
    console.error(err);
    setStatus('Chyba: ' + (err.message || err));
    alert('Nepodařilo se uložit: ' + (err.message || err));
  } finally {
    els.submitBtn.disabled = false;
    syncSettingsUI();
  }
}

async function saveEventToGitHub(event, rawText) {
  // If we have parsed event, commit directly to data/events.json via GitHub Contents API.
  // Otherwise, create an issue and let the existing Action parse it.
  if (event && event.date) {
    await commitEventToRepo(event);
  } else {
    await createIssue(rawText);
  }
}

async function githubApi(path, opts = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${state.ghToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {})
    }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`GitHub API ${resp.status}: ${txt.slice(0, 200)}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

async function commitEventToRepo(event) {
  const path = `repos/${state.repo.owner}/${state.repo.repo}/contents/data/events.json`;
  // read current file
  let file;
  try { file = await githubApi(`/${path}`); }
  catch (e) { throw new Error('Nelze načíst data/events.json z GitHubu. Zkontroluj token oprávnění (Contents: Read/Write). ' + e.message); }
  const content = decodeBase64Utf8(file.content);
  const data = JSON.parse(content);
  if (!Array.isArray(data.events)) data.events = [];
  const record = createRecord(event, 'web-cloud');
  const dup = data.events.find(e => e.title === record.title && e.date === record.date && e.time === record.time && e.type === record.type);
  if (dup) { setStatus('Tahle událost už je v GitHubu.'); return; }
  data.events.push(record);
  data.events.sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
  const newContent = encodeBase64Utf8(JSON.stringify(data, null, 2) + '\n');
  await githubApi(`/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Add event: ${record.title} (${record.date})`,
      content: newContent,
      sha: file.sha
    })
  });
}

async function createIssue(text) {
  await githubApi(`/repos/${state.repo.owner}/${state.repo.repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[Událost] ${text.slice(0, 60)}`,
      body: `### Co se děje?\n\n${text}\n`,
      labels: ['event']
    })
  });
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function decodeBase64Utf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function addDirect(text) {
  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Přidávám…';
  try {
    setStatus('Parsuji přes Groq…');
    const event = await parseWithGroq(text);
    if (!event.date) throw new Error('AI neurčila datum. Napiš datum explicitně (např. 5.12.2026).');
    const record = createRecord(event, 'web-local');
    upsertLocal(record);
    state.selectedDate = record.date;
    state.month = startOfMonth(new Date(record.date + 'T00:00:00'));
    els.eventInput.value = '';
    render();
    setStatus(`Přidáno lokálně: ${record.title} (${formatHumanDate(record.date)}${record.time ? ' ' + record.time : ''}).`);
  } catch (err) {
    console.error(err);
    setStatus('Chyba: ' + (err.message || err));
    alert('Nepodařilo se přidat událost: ' + (err.message || err));
  } finally { els.submitBtn.disabled = false; syncSettingsUI(); }
}

function upsertLocal(record) {
  const dup = state.events.find(e => e.title === record.title && e.date === record.date && e.time === record.time && e.type === record.type);
  if (dup) { setStatus('Tahle událost už v kalendáři je.'); return; }
  state.events.push(record);
  state.events.sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
  saveLocalEvents();
}

async function parseWithGroq(input) {
  const now = new Date();
  const tz = 'Europe/Prague';
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const weekday = new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, weekday: 'long' }).format(now);
  const system = `Jsi parser školních událostí pro studenta SPŠE Ječná. Dnes je ${weekday} ${today} (Europe/Prague).
Z uživatelského textu extrahuj jednu událost a vrať POUZE validní JSON objekt bez markdownu.
Schéma: {"title":"krátký název","subject":"předmět nebo prázdný řetězec","type":"test|ukol|zkouseni|projekt|akce|jine","date":"YYYY-MM-DD","time":"HH:MM nebo null","description":"původní/zkrácený popis","confidence":0.0}
Pravidla: Rozuměj českým zkratkám mat/čj/aj/fyz/prg/web/db/sit/hw/sw/tv/dej/zj apod. test/pisemka/zkouseni=>test/zkouseni; ukol/du/odevzdat=>ukol; projekt=>projekt. Rok chybí => nejbližší budoucí datum. Čas chybí => null. Datum nejasné => date null, confidence <= 0.4. Jen JSON.`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: state.groqModel, temperature: 0.1, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] })
  });
  if (!resp.ok) { const err = await resp.text(); throw new Error(`Groq API ${resp.status}: ${err.slice(0, 200)}`); }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  const jsonStr = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return normalizeEvent(JSON.parse(jsonStr), input);
}

function normalizeEvent(parsed, input) {
  return {
    title: String(parsed.title || input).slice(0, 120),
    subject: String(parsed.subject || '').slice(0, 80),
    type: TYPE_SET.has(parsed.type) ? parsed.type : 'jine',
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    time: typeof parsed.time === 'string' && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : null,
    description: String(parsed.description || input).slice(0, 500),
  };
}

function createRecord(event, source) {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    title: event.title || 'Událost', subject: event.subject || '', type: event.type || 'jine',
    date: event.date, time: event.time || null, description: event.description || '',
    source, createdAt: new Date().toISOString()
  };
}

function saveLocalEvents() { localStorage.setItem('calendar_events', JSON.stringify({ events: state.events })); }
function loadLocalEvents() {
  try { const raw = localStorage.getItem('calendar_events'); if (!raw) return []; const data = JSON.parse(raw); return Array.isArray(data.events) ? data.events : []; } catch { return []; }
}

async function loadEvents() {
  try {
    const res = await fetch('./data/events.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const remote = Array.isArray(data.events) ? data.events : [];
    state.events = mergeEvents(remote, loadLocalEvents());
    setStatus(`Načteno ${state.events.length} událostí`);
  } catch (err) {
    console.error(err);
    state.events = mergeEvents([], loadLocalEvents());
    setStatus(state.events.length ? `Načteno ${state.events.length} lokálních událostí` : 'Nepodařilo se načíst data/events.json');
  }
}

function mergeEvents(remote, local) {
  const map = new Map();
  for (const e of remote) map.set(eventKey(e), e);
  for (const e of local) map.set(eventKey(e), e);
  return [...map.values()].sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
}
function eventKey(e) { return e.id || `${e.date}|${e.time||''}|${e.type}|${e.title}`.toLowerCase(); }

function getFilteredEvents() {
  return state.events.filter(e => {
    if (state.type !== 'all' && e.type !== state.type) return false;
    if (state.search) { const hay = `${e.title} ${e.subject} ${e.description} ${e.type}`.toLowerCase(); if (!hay.includes(state.search)) return false; }
    return true;
  }).sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
}

function render() {
  const events = getFilteredEvents();
  renderCalendar(events);
  renderAgenda(events);
  els.monthLabel.textContent = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(state.month);
}

function renderCalendar(events) {
  els.calendarGrid.innerHTML = '';
  const map = new Map();
  for (const e of events) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date).push(e); }
  const first = startOfMonth(state.month);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const today = isoDate(new Date());
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    const iso = isoDate(date);
    const dayEvents = map.get(iso) || [];
    const cell = document.createElement('div');
    cell.className = 'day' + (date.getMonth() !== state.month.getMonth() ? ' other-month' : '') + (iso === today ? ' today' : '') + (iso === state.selectedDate ? ' selected' : '');
    cell.tabIndex = 0;
    cell.innerHTML = `<div class="day-num">${date.getDate()}</div><div class="day-events"></div>`;
    const wrap = cell.querySelector('.day-events');
    dayEvents.slice(0, 3).forEach(e => {
      const pill = document.createElement('button');
      pill.type = 'button'; pill.className = `event-pill type-${cssType(e.type)}`;
      pill.textContent = `${e.time ? e.time + ' ' : ''}${e.title}`;
      pill.addEventListener('click', ev => { ev.stopPropagation(); state.selectedDate = iso; renderAgenda(getFilteredEvents()); highlightSelected(); });
      wrap.appendChild(pill);
    });
    if (dayEvents.length > 3) { const more = document.createElement('div'); more.className = 'more-count'; more.textContent = `+${dayEvents.length - 3} další`; wrap.appendChild(more); }
    cell.addEventListener('click', () => { state.selectedDate = iso; renderAgenda(getFilteredEvents()); highlightSelected(); });
    els.calendarGrid.appendChild(cell);
  }
}

function highlightSelected() {
  document.querySelectorAll('.day.selected').forEach(n => n.classList.remove('selected'));
  const idx = dayIndex(state.selectedDate);
  if (idx >= 0 && els.calendarGrid.children[idx]) els.calendarGrid.children[idx].classList.add('selected');
}
function dayIndex(iso) {
  const first = startOfMonth(state.month); const startOffset = (first.getDay() + 6) % 7; const gridStart = addDays(first, -startOffset);
  const target = new Date(iso + 'T00:00:00'); const diff = Math.round((target - gridStart) / 86400000);
  return diff >= 0 && diff < 42 ? diff : -1;
}

function renderAgenda(events) {
  const selected = state.selectedDate;
  const selectedEvents = events.filter(e => e.date === selected);
  const today = isoDate(new Date());
  const upcoming = events.filter(e => e.date >= today).slice(0, 12);
  const showSelected = selectedEvents.length > 0;
  const list = showSelected ? selectedEvents : upcoming;
  els.agendaTitle.textContent = showSelected ? formatHumanDate(selected) : 'Nadcházející';
  els.agendaSubtitle.textContent = showSelected ? `${selectedEvents.length} událost${selectedEvents.length === 1 ? '' : selectedEvents.length < 5 ? 'i' : 'í'}` : 'Nejbližší testy a úkoly';
  els.agendaList.innerHTML = '';
  if (!list.length) { els.agendaList.innerHTML = '<div class="agenda-empty">Žádné události.</div>'; return; }
  for (const e of list) {
    const item = document.createElement('article');
    item.className = 'agenda-item';
    const type = cssType(e.type);
    item.innerHTML = `<div class="meta"><span class="badge type-${type}">${escapeHtml(TYPE_LABELS[e.type] || e.type)}</span><span class="date">${escapeHtml(formatHumanDate(e.date))}${e.time ? ' · ' + escapeHtml(e.time) : ''}</span></div><div class="title">${escapeHtml(e.title)}</div><div class="sub">${escapeHtml(e.subject || 'Bez předmětu')}${e.description && e.description !== e.title ? ' — ' + escapeHtml(e.description) : ''}</div>`;
    els.agendaList.appendChild(item);
  }
}

function setStatus(msg) { els.statusText.textContent = msg; }
function cssType(type) { return TYPE_LABELS[type] ? type : 'jine'; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) { const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function formatHumanDate(iso) { return new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso + 'T00:00:00')); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

window.exportCalendarEvents = () => {
  const blob = new Blob([JSON.stringify({ events: state.events }, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'events.json'; a.click(); URL.revokeObjectURL(a.href);
};
