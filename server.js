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

        // CREACIÓN DE TABLAS CON COLUMNAS CRÍTICAS
        db.run(`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (id TEXT PRIMARY KEY, razon TEXT, rut TEXT, planta TEXT, contacto TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS catalogo (id TEXT PRIMARY KEY, desc TEXT, tipo TEXT, precio REAL);`);
        db.run(`CREATE TABLE IF NOT EXISTS presupuestos (
            id TEXT PRIMARY KEY, num TEXT, desc TEXT, cliente_id TEXT, fecha TEXT,
            mo REAL, mat REAL, sub REAL, 
            gg REAL, imp REAL, util REAL, -- COLUMNAS SOLICITADAS
            net REAL, iva REAL, tot REAL, created_at TEXT
        );`);

        // INYECCIÓN DE PARÁMETROS INICIALES
        db.run(`INSERT OR IGNORE INTO config VALUES ('correlativo', '3001');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('pct_gg', '12');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('pct_imp', '5');`);
        db.run(`INSERT OR IGNORE INTO config VALUES ('pct_util', '13');`);
        
        // Inyectar Clientes CMSC [cite: 21, 22, 23]
        db.run(`INSERT OR IGNORE INTO clientes VALUES 
            ('c1', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Santiago', 'Sr. Williams Moya'),
            ('c2', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Maipú', 'Sr. Luis Gómez'),
            ('c3', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Casablanca', 'Sr. Cristian Mora');`);

        saveDB();
        console.log("Base de datos STRP lista con parámetros GG, IMP y Utilidad.");
    } catch (e) { console.error("Fallo BD:", e); }
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
initDB().then(() => app.listen(PORT, () => console.log("Servidor Online")));