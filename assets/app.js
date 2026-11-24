const TYPE_LABELS = {
  test: 'Test', ukol: 'Úkol', zkouseni: 'Zkoušení', projekt: 'Projekt', akce: 'Akce', jine: 'Jiné'
};

const state = {
  events: [],
  month: startOfMonth(new Date()),
  selectedDate: isoDate(new Date()),
  type: 'all',
  search: '',
  repo: detectRepo(),
};

const els = {
  monthLabel: document.getElementById('monthLabel'),
  calendarGrid: document.getElementById('calendarGrid'),
  agendaList: document.getElementById('agendaList'),
  agendaTitle: document.getElementById('agendaTitle'),
  agendaSubtitle: document.getElementById('agendaSubtitle'),
  statusText: document.getElementById('statusText'),
  typeFilter: document.getElementById('typeFilter'),
  searchInput: document.getElementById('searchInput'),
  repoLink: document.getElementById('repoLink'),
  newIssueLink: document.getElementById('newIssueLink'),
  composerForm: document.getElementById('composerForm'),
  eventInput: document.getElementById('eventInput'),
  configWarning: document.getElementById('configWarning'),
};

init();

async function init() {
  wireUI();
  configureLinks();
  await loadEvents();
  render();
}

function wireUI() {
  document.getElementById('prevMonth').addEventListener('click', () => { state.month = addMonths(state.month, -1); render(); });
  document.getElementById('nextMonth').addEventListener('click', () => { state.month = addMonths(state.month, 1); render(); });
  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    state.month = startOfMonth(now);
    state.selectedDate = isoDate(now);
    render();
  });
  els.typeFilter.addEventListener('change', e => { state.type = e.target.value; render(); });
  els.searchInput.addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); render(); });
  els.composerForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = els.eventInput.value.trim();
    if (!text) return;
    openIssue(text);
  });
  document.querySelectorAll('[data-example]').forEach(btn => {
    btn.addEventListener('click', () => { els.eventInput.value = btn.dataset.example; els.eventInput.focus(); });
  });
}

function detectRepo() {
  const host = location.hostname;
  const path = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    const owner = host.replace('.github.io', '');
    const repo = path[0] || `${owner}.github.io`;
    return { owner, repo };
  }
  return null;
}

function configureLinks() {
  if (state.repo) {
    const base = `https://github.com/${state.repo.owner}/${state.repo.repo}`;
    els.repoLink.href = base;
    els.newIssueLink.href = `${base}/issues/new?template=pridat-udalost.yml&labels=event`;
  } else {
    els.repoLink.href = '#';
    els.repoLink.addEventListener('click', e => e.preventDefault());
    els.newIssueLink.href = '#';
    els.configWarning.classList.remove('hidden');
    els.configWarning.innerHTML = 'Aplikace běží mimo GitHub Pages. Pro přidávání přes Issue ji nasaď na GitHub Pages, nebo uprav <code>detectRepo()</code> v <code>assets/app.js</code>.';
  }
}

function openIssue(text) {
  if (!state.repo) {
    alert('Repozitář nebyl rozpoznán. Nasaď aplikaci na GitHub Pages.');
    return;
  }
  const url = new URL(`https://github.com/${state.repo.owner}/${state.repo.repo}/issues/new`);
  url.searchParams.set('template', 'pridat-udalost.yml');
  url.searchParams.set('labels', 'event');
  url.searchParams.set('title', `[Událost] ${text.slice(0, 60)}`);
  url.searchParams.set('body', `### Co se děje?\n\n${text}\n`);
  window.open(url.toString(), '_blank', 'noopener');
}

async function loadEvents() {
  try {
    const res = await fetch('./data/events.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.events = Array.isArray(data.events) ? data.events : [];
    els.statusText.textContent = `Načteno ${state.events.length} událostí`;
  } catch (err) {
    console.error(err);
    state.events = [];
    els.statusText.textContent = 'Nepodařilo se načíst data/events.json';
  }
}

function getFilteredEvents() {
  return state.events.filter(e => {
    if (state.type !== 'all' && e.type !== state.type) return false;
    if (state.search) {
      const hay = `${e.title} ${e.subject} ${e.description} ${e.type}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  }).sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')));
}

function render() {
  const events = getFilteredEvents();
  renderCalendar(events);
  renderAgenda(events);
  const monthFmt = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' });
  els.monthLabel.textContent = monthFmt.format(state.month);
}

function renderCalendar(events) {
  els.calendarGrid.innerHTML = '';
  const map = new Map();
  for (const e of events) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }

  const first = startOfMonth(state.month);
  const startOffset = (first.getDay() + 6) % 7; // Monday start
  const gridStart = addDays(first, -startOffset);
  const today = isoDate(new Date());

  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    const iso = isoDate(date);
    const dayEvents = map.get(iso) || [];
    const cell = document.createElement('div');
    cell.className = 'day';
    if (date.getMonth() !== state.month.getMonth()) cell.classList.add('other-month');
    if (iso === today) cell.classList.add('today');
    if (iso === state.selectedDate) cell.classList.add('selected');
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', `${iso}, ${dayEvents.length} událostí`);

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = String(date.getDate());
    cell.appendChild(num);

    const wrap = document.createElement('div');
    wrap.className = 'day-events';
    dayEvents.slice(0, 3).forEach(e => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `event-pill type-${cssType(e.type)}`;
      pill.textContent = `${e.time ? e.time + ' ' : ''}${e.title}`;
      pill.title = `${TYPE_LABELS[e.type] || e.type}: ${e.title}`;
      pill.addEventListener('click', ev => { ev.stopPropagation(); state.selectedDate = iso; renderAgenda(getFilteredEvents()); highlightSelected(); scrollAgendaTo(iso); });
      wrap.appendChild(pill);
    });
    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'more-count';
      more.textContent = `+${dayEvents.length - 3} další`;
      wrap.appendChild(more);
    }
    cell.appendChild(wrap);

    cell.addEventListener('click', () => { state.selectedDate = iso; renderAgenda(getFilteredEvents()); highlightSelected(); });
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); } });
    els.calendarGrid.appendChild(cell);
  }
}

function highlightSelected() {
  document.querySelectorAll('.day.selected').forEach(n => n.classList.remove('selected'));
  const idx = dayIndex(state.selectedDate);
  if (idx >= 0 && els.calendarGrid.children[idx]) els.calendarGrid.children[idx].classList.add('selected');
}

function dayIndex(iso) {
  const first = startOfMonth(state.month);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const target = new Date(iso + 'T00:00:00');
  const diff = Math.round((target - gridStart) / 86400000);
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
  if (list.length === 0) {
    els.agendaList.innerHTML = '<div class="agenda-empty">Žádné události. Přidej první přes formulář nahoře.</div>';
    return;
  }
  for (const e of list) {
    const item = document.createElement('article');
    item.className = 'agenda-item';
    item.dataset.date = e.date;
    const type = cssType(e.type);
    item.innerHTML = `
      <div class="meta">
        <span class="badge type-${type}">${escapeHtml(TYPE_LABELS[e.type] || e.type)}</span>
        <span class="date">${escapeHtml(formatHumanDate(e.date))}${e.time ? ' · ' + escapeHtml(e.time) : ''}</span>
      </div>
      <div class="title">${escapeHtml(e.title)}</div>
      <div class="sub">${escapeHtml(e.subject || 'Bez předmětu')}${e.description && e.description !== e.title ? ' — ' + escapeHtml(e.description) : ''}</div>
    `;
    els.agendaList.appendChild(item);
  }
}

function scrollAgendaTo(iso) {
  const el = els.agendaList.querySelector(`[data-date="${iso}"]`);
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function cssType(type) { return TYPE_LABELS[type] ? type : 'jine'; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) { const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function formatHumanDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(d);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
