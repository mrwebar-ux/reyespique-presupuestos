const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname))); 

const DB_FILE = path.join(__dirname, 'database.sqlite');
let db;

async function initDB() {
    try {
        const SQL = await initSqlJs();
        db = new SQL.Database(fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE) : undefined);

        // ESQUEMA: Todas las columnas de márgenes solicitadas son obligatorias
        db.run(`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS presupuestos (
            id TEXT PRIMARY KEY, num TEXT, cliente TEXT, fecha TEXT,
            mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL,
            net REAL, iva REAL, tot REAL
        );`);

        // INYECCIÓN DE PARÁMETROS BASE
        db.run(`INSERT OR IGNORE INTO config VALUES ('correlativo', '3001');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('p_gg', '12');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('p_imp', '5');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('p_util', '13');`);

        saveDB();
        console.log("Servidor STRP SpA en línea.");
    } catch (e) { console.error("Fallo crítico BD:", e); }
}

function saveDB() { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }

app.get('/api/config', (req, res) => {
    const r = db.exec("SELECT * FROM config");
    res.json(r.length ? r[0].values.reduce((acc, v) => ({...acc, [v[0]]: v[1]}), {}) : {});
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log("Servidor Online")));