import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs';

let db: Database | undefined;

export async function initDb(): Promise<Database> {
  if (db) return db;

  const USER_DATA_DIR = path.join(os.homedir(), 'Documents', 'VRRookieDownloader');
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }
  const dbPath = path.join(USER_DATA_DIR, 'database.sqlite');
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      translated_description TEXT,
      magnet TEXT,
      post_url TEXT UNIQUE,
      tags TEXT,
      size TEXT,
      image_url TEXT,
      seeds INTEGER DEFAULT 0,
      leeches INTEGER DEFAULT 0,
      registered_at TEXT,
      torrent_downloads INTEGER DEFAULT 0,
      wishlist INTEGER DEFAULT 0,
      translated_title TEXT,
      genre TEXT,
      developer TEXT,
      publisher TEXT,
      version TEXT,
      languages TEXT,
      play_modes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY DEFAULT 1,
      cookies TEXT
    );

    CREATE TABLE IF NOT EXISTS failed_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_url TEXT UNIQUE,
      size TEXT,
      error_message TEXT,
      attempts INTEGER DEFAULT 0,
      last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Simple migrations for new columns
  const newColumns = [
    'ALTER TABLE games ADD COLUMN seeds INTEGER DEFAULT 0',
    'ALTER TABLE games ADD COLUMN leeches INTEGER DEFAULT 0',
    'ALTER TABLE games ADD COLUMN registered_at TEXT',
    'ALTER TABLE games ADD COLUMN torrent_downloads INTEGER DEFAULT 0',
    'ALTER TABLE games ADD COLUMN wishlist INTEGER DEFAULT 0',
    'ALTER TABLE games ADD COLUMN translated_title TEXT',
    'ALTER TABLE games ADD COLUMN genre TEXT',
    'ALTER TABLE games ADD COLUMN developer TEXT',
    'ALTER TABLE games ADD COLUMN publisher TEXT',
    'ALTER TABLE games ADD COLUMN version TEXT',
    'ALTER TABLE games ADD COLUMN languages TEXT',
    'ALTER TABLE games ADD COLUMN play_modes TEXT'
  ];

  for (const query of newColumns) {
    try {
      await db.exec(query);
    } catch(e) {
      // Column probably already exists, ignore
    }
  }
  
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export async function closeDb() {
  if (db) {
    await db.close();
    db = undefined;
  }
}
