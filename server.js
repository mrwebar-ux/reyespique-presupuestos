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

        // ESQUEMA: Incluye todas las columnas de márgenes independientes solicitadas
        db.run(`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS presupuestos (
            id TEXT PRIMARY KEY, num TEXT, cliente TEXT, fecha TEXT,
            mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL,
            net REAL, iva REAL, tot REAL
        );`);

        // INYECCIÓN DE PARÁMETROS INICIALES (CONFIDENCIALES)
        db.run(`INSERT OR IGNORE INTO config VALUES ('correlativo', '3001');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('val_he', '34000');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('m_mat', '45');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('m_sub', '35');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('p_gg', '12');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('p_imp', '5');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('p_util', '13');`);

        saveDB();
        console.log("Servidor STRP SpA: Base de Datos Inicializada.");
    } catch (e) { console.error("Fallo crítico en Base de Datos:", e); }
}

function saveDB() { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }

// ENDPOINTS API
app.get('/api/config', (req, res) => {
    const r = db.exec("SELECT * FROM config");
    res.json(r.length ? r[0].values.reduce((acc, v) => ({...acc, [v[0]]: v[1]}), {}) : {});
});

app.post('/api/config', (req, res) => {
    Object.entries(req.body).forEach(([k, v]) => db.run("INSERT OR REPLACE INTO config VALUES (?,?)", [k, v]));
    saveDB(); res.json({success:true});
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`Online en puerto ${PORT}`)));