"use strict";

// Migrasi untuk membuat tabel galeri karya proyek Scratch komunitas
module.exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Games',
      grade TEXT NOT NULL DEFAULT 'SD',
      author_user_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      project_data_json TEXT NOT NULL DEFAULT '{}',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      views_count INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      stars_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gallery_project_likes (
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY(project_id) REFERENCES gallery_projects(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_gallery_projects_status ON gallery_projects(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_gallery_projects_author ON gallery_projects(author_user_id);
    CREATE INDEX IF NOT EXISTS idx_gallery_projects_category ON gallery_projects(category);
  `);
};
