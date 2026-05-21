const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Data helpers ---
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Feil ved lasting av data:', e);
  }
  return { people: defaultPeople(), periods: {} };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Feil ved lagring av data:', e);
  }
}

function defaultPeople() {
  return [
    'Eva', 'Benjamin', 'Bjarte', 'Kristine', 'Madelen', 'Morten', 'David',
    'Lyubka', 'Estera', 'Marianne', 'Monica', 'Silje', 'Sylwia',
    'Janine', 'Anne', 'Marte', 'Ann Elin', 'KL eller Møte'
  ];
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// --- Routes ---

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET aktiv periode — styrt av servertid, ikke klientens klokke
app.get('/api/period/current', (req, res) => {
  const d = new Date();
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  res.json({ period });
});

// GET alle ansatte
app.get('/api/people', (req, res) => {
  const data = loadData();
  res.json(data.people);
});

// POST oppdater ansattelisten (erstatter hele listen)
app.post('/api/people', (req, res) => {
  const { people } = req.body;
  if (!Array.isArray(people)) {
    return res.status(400).json({ error: 'people må være en array' });
  }
  const data = loadData();
  data.people = people;
  saveData(data);
  res.json({ ok: true, people: data.people });
});

// GET alle perioder
app.get('/api/periods', (req, res) => {
  const data = loadData();
  res.json(Object.keys(data.periods).sort((a, b) => b.localeCompare(a)));
});

// GET tellere for en periode
app.get('/api/counts/:period', (req, res) => {
  const data = loadData();
  const period = req.params.period;
  res.json(data.periods[period] || {});
});

// POST registrer mineralvann
app.post('/api/counts/:period', (req, res) => {
  const { person, delta } = req.body;
  const period = req.params.period;

  if (!person || typeof delta !== 'number') {
    return res.status(400).json({ error: 'person og delta er påkrevd' });
  }

  const data = loadData();
  if (!data.periods[period]) data.periods[period] = {};

  const current = data.periods[period][person] || 0;
  const next = current + delta;

  if (next < 0) {
    return res.status(400).json({ error: 'Kan ikke gå under 0' });
  }

  data.periods[period][person] = next;
  saveData(data);
  res.json({ ok: true, person, period, count: next });
});

// POST sett direkte verdi (for admin-synkronisering)
app.put('/api/counts/:period/:person', (req, res) => {
  const { count } = req.body;
  const { period, person } = req.params;

  if (typeof count !== 'number' || count < 0) {
    return res.status(400).json({ error: 'count må være et ikke-negativt tall' });
  }

  const data = loadData();
  if (!data.periods[period]) data.periods[period] = {};
  data.periods[period][person] = count;
  saveData(data);
  res.json({ ok: true, person, period, count });
});

// DELETE nullstill en periode
app.delete('/api/counts/:period', (req, res) => {
  const data = loadData();
  data.periods[req.params.period] = {};
  saveData(data);
  res.json({ ok: true });
});

// POST rename person (oppdaterer alle perioder)
app.post('/api/people/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'oldName og newName er påkrevd' });
  }

  const data = loadData();

  // Oppdater i people-listen
  const idx = data.people.indexOf(oldName);
  if (idx !== -1) data.people[idx] = newName;

  // Oppdater i alle perioder
  Object.keys(data.periods).forEach(period => {
    if (data.periods[period][oldName] !== undefined) {
      data.periods[period][newName] = data.periods[period][oldName];
      delete data.periods[period][oldName];
    }
  });

  saveData(data);
  res.json({ ok: true });
});

// DELETE fjern person
app.delete('/api/people/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const data = loadData();
  data.people = data.people.filter(p => p !== name);
  saveData(data);
  res.json({ ok: true });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Kjøleskap backend kjører på port ${PORT}`);
  // Seed data.json hvis den ikke finnes
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      people: defaultPeople(),
      periods: {
        '2026-03': {
          'Eva': 7, 'Benjamin': 4, 'Bjarte': 13, 'Kristine': 2, 'Madelen': 4,
          'Morten': 6, 'David': 4, 'Lyubka': 3, 'Estera': 1,
          'Marianne': 6, 'Monica': 1, 'Silje': 1, 'KL eller Møte': 16, 'Sylwia': 2
        },
        '2026-04': {
          'Bjarte': 13, 'Morten': 5, 'David': 6, 'Sylwia': 1, 'Eva': 4,
          'Marianne': 5, 'Estera': 4, 'Kristine': 4, 'Madelen': 3, 'Janine': 1,
          'Anne': 1, 'Lyubka': 2, 'Marte': 1, 'Ann Elin': 1, 'Benjamin': 1, 'KL eller Møte': 8
        }
      }
    };
    saveData(initial);
    console.log('Seed-data skrevet til data.json');
  }
});
