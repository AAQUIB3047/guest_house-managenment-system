const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8888;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(express.json());
// Serve static client assets
app.use(express.static(__dirname));

const defaultState = {
  version: 1,
  rooms: [],
  services: [],
  expenses: [],
  incomes: [],
  activities: [
    {
      id: 'act_init',
      type: 'system',
      text: 'System initialized. Add rooms to get started!',
      time: new Date().toISOString()
    }
  ]
};

// Helper to load state from db.json
function loadState() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading database file, using defaults:', err);
  }
  return defaultState;
}

// Helper to save state to db.json
function saveState(state) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving database file:', err);
    return false;
  }
}

// GET API: Retrieve current state
app.get('/api/state', (req, res) => {
  const state = loadState();
  res.json(state);
});

// POST API: Update state and trigger version change
app.post('/api/state', (req, res) => {
  const newState = req.body;
  if (!newState || !newState.rooms) {
    return res.status(400).json({ error: 'Invalid state structure.' });
  }

  // Increment version timestamp to notify other clients of changes
  newState.version = Date.now();
  
  if (saveState(newState)) {
    res.json(newState);
  } else {
    res.status(500).json({ error: 'Failed to write to database file.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` StaySync server is running locally!`);
  console.log(` Port: ${PORT}`);
  console.log(` Access locally: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
