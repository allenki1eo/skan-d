import fs from 'fs';
import path from 'path';
import { db } from './pool';

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).sort();

  for (const file of files) {
    const { rows } = await db.query('SELECT 1 FROM _migrations WHERE name=$1', [file]);
    if (rows.length) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    await db.query(sql);
    await db.query('INSERT INTO _migrations(name) VALUES($1)', [file]);
    console.log(`Done: ${file}`);
  }

  await db.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
