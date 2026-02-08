const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'milestones.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS processed (
      milestone TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS eligible (
      milestone TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (milestone, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS milestone_roles (
      milestone TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
});

function qGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function qAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function qRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

async function wasProcessed(key) {
  const row = await qGet(`SELECT milestone FROM processed WHERE milestone = ?`, [key]);
  return !!row;
}

async function markProcessed(key) {
  await qRun(`INSERT OR REPLACE INTO processed (milestone, processed_at) VALUES (?, ?)`, [key, Date.now()]);
}

async function unmarkProcessed(key) {
  await qRun(`DELETE FROM processed WHERE milestone = ?`, [key]);
}

async function addEligible(key, userId) {
  await qRun(
    `INSERT OR IGNORE INTO eligible (milestone, user_id, created_at) VALUES (?, ?, ?)`,
    [key, userId, Date.now()]
  );
}

async function listEligible(key) {
  const rows = await qAll(`SELECT user_id FROM eligible WHERE milestone = ?`, [key]);
  return rows.map(r => r.user_id);
}

async function deleteEligible(key) {
  await qRun(`DELETE FROM eligible WHERE milestone = ?`, [key]);
}

async function countEligible(key) {
  const row = await qGet(`SELECT COUNT(*) AS c FROM eligible WHERE milestone = ?`, [key]);
  return row?.c ?? 0;
}

async function getRoleId(key) {
  const row = await qGet(`SELECT role_id FROM milestone_roles WHERE milestone = ?`, [key]);
  return row?.role_id ?? null;
}

async function setRoleId(key, roleId) {
  await qRun(
    `INSERT OR REPLACE INTO milestone_roles (milestone, role_id, created_at) VALUES (?, ?, ?)`,
    [key, roleId, Date.now()]
  );
}

async function deleteRoleId(key) {
  await qRun(`DELETE FROM milestone_roles WHERE milestone = ?`, [key]);
}

module.exports = {
  wasProcessed,
  markProcessed,
  unmarkProcessed,
  addEligible,
  listEligible,
  deleteEligible,
  countEligible,
  getRoleId,
  setRoleId,
  deleteRoleId,
};
