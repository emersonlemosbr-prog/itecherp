module.exports = function migrateServiceOrderPhotos(db) {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(service_order_photos)').all();
    for (const name of ['url', 'public_id']) {
      if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE service_order_photos ADD COLUMN ${name} TEXT`);
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_service_order_photos_order ON service_order_photos(service_order_id, id)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_photos_public_id ON service_order_photos(public_id) WHERE public_id IS NOT NULL');
    db.exec(`CREATE TRIGGER IF NOT EXISTS service_order_photos_require_cloudinary
      BEFORE INSERT ON service_order_photos WHEN NEW.url IS NULL OR NEW.url NOT LIKE 'https://res.cloudinary.com/%' OR NEW.public_id IS NULL
      BEGIN SELECT RAISE(ABORT, 'Cloudinary URL and public_id required'); END`);
  })();
};
