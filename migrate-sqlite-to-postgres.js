// migrate-sqlite-to-postgres.js
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { Pool } = require("pg");

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️ DATABASE_URL não existe. Adicione PostgreSQL no Railway (Variables).");
    return;
  }

  // 1) abre Postgres (Railway geralmente precisa de SSL)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // 2) garante a tabela no Postgres
  await pool.query(`
    CREATE TABLE IF NOT EXISTS milestones (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (guild_id, key)
    );
  `);

  // 3) abre SQLite (arquivo local)
  const sqlitePath = path.join(__dirname, "milestones.db");

  // abre via pacote "sqlite" (que usa sqlite3 por baixo)
  const db = await open({
    filename: sqlitePath,
    driver: sqlite3.Database,
  });

  // 4) descobrir tabelas (pra gente não chutar errado)
  const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table'`);
  console.log("🧠 Tabelas no SQLite:", tables.map(t => t.name));

  // Tenta achar uma tabela “milestones” primeiro
  let tableName = tables.find(t => t.name === "milestones")?.name;

  // Se não existir, pega a primeira tabela que não seja sqlite internal
  if (!tableName) {
    tableName = tables.find(t => !t.name.startsWith("sqlite_"))?.name;
  }

  if (!tableName) {
    console.log("⚠️ Não achei tabela no SQLite. Nada pra migrar.");
    await db.close();
    await pool.end();
    return;
  }

  console.log("✅ Usando tabela do SQLite:", tableName);

  // 5) tenta ler colunas esperadas
  const columns = await db.all(`PRAGMA table_info(${tableName})`);
  const colNames = columns.map(c => c.name);
  console.log("🧱 Colunas:", colNames);

  // Tentativas comuns de nomes
  const guildCol = colNames.includes("guild_id") ? "guild_id" : (colNames.includes("guildId") ? "guildId" : null);
  const keyCol = colNames.includes("key") ? "key" : (colNames.includes("meta_key") ? "meta_key" : null);

  if (!guildCol || !keyCol) {
    console.log("❌ Não encontrei colunas guild_id e key no SQLite.");
    console.log("➡️ Me manda o print dessas colunas acima que eu ajusto em 1 minuto.");
    await db.close();
    await pool.end();
    return;
  }

  // 6) puxa tudo do SQLite
  const rows = await db.all(`SELECT ${guildCol} as guild_id, ${keyCol} as key FROM ${tableName}`);
  console.log(`📦 Linhas no SQLite: ${rows.length}`);

  // 7) insere no Postgres (idempotente)
  let inserted = 0;
  for (const r of rows) {
    const res = await pool.query(
      `INSERT INTO milestones (guild_id, key) VALUES ($1, $2)
       ON CONFLICT (guild_id, key) DO NOTHING`,
      [String(r.guild_id), String(r.key)]
    );
    inserted += res.rowCount;
  }

  console.log(`✅ Migração concluída. Inseridos no Postgres: ${inserted}`);

  await db.close();
  await pool.end();
}

module.exports = { migrate };
