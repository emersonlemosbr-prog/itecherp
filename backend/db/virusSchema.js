const db = require('./database');

// As tabelas de antivírus (virus_threat_signatures, virus_scans, virus_scan_results)
// agora fazem parte integrante do esquema oficial PostgreSQL (postgresSchema.sql).

module.exports = db;
