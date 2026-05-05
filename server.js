const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

let db;
const DB_FILE = path.join(__dirname, 'database.sqlite');

initSqlJs().then(function(SQL) {
    if (fs.existsSync(DB_FILE)) {
        const filebuffer = fs.readFileSync(DB_FILE);
        db = new SQL.Database(filebuffer);
    } else {
        db = new SQL.Database();
        db.run(`
            CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT);
            CREATE TABLE clientes (id TEXT PRIMARY KEY, razon TEXT, rut TEXT, giro TEXT, planta TEXT, dir TEXT, contacto TEXT, email TEXT, tel TEXT);
            CREATE TABLE catalogo (id TEXT PRIMARY KEY, desc TEXT, tipo TEXT, und TEXT, precio REAL);
            CREATE TABLE presupuestos (
                id TEXT PRIMARY KEY, num TEXT, desc TEXT, cliente_id TEXT, fecha TEXT, estado TEXT, tipo TEXT, validez TEXT,
                mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL, net REAL, iva REAL, tot REAL, created_at TEXT
            );
            CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, pres_id TEXT, orden INTEGER, desc TEXT, tipo TEXT, und TEXT, cant REAL, tarifa REAL);
        `);
        db.run(`INSERT INTO config (clave, valor) VALUES ('correlativo', '3100'), ('he', '34000'), ('emergencia', '47905'), ('base', '143716'), ('margen_mat', '0.45'), ('margen_sub', '0.35'), ('gg', '0.12'), ('imp', '0.05'), ('util', '0.13'), ('iva', '0.19')`);
        saveDatabase();
    }
    console.log("Base de datos inicializada.");
});

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
}

app.get('/api/config', (req, res) => {
    try {
        const result = db.exec("SELECT * FROM config");
        let config = {};
        if (result.length > 0) result[0].values.forEach(row => config[row[0]] = row[1]);
        res.json(config);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/config', (req, res) => {
    try {
        for (const [key, value] of Object.entries(req.body)) {
            db.run("INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)", [key, value]);
        }
        saveDatabase();
        res.json({success: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/siguiente', (req, res) => {
    try {
        const result = db.exec("SELECT valor FROM config WHERE clave = 'correlativo'");
        res.json({num: result.length > 0 ? parseInt(result[0].values[0][0]) : 3100});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/clientes', (req, res) => {
    try {
        const result = db.exec("SELECT * FROM clientes");
        res.json(result.length > 0 ? result[0].values.map(v => ({id: v[0], razon: v[1], rut: v[2], giro: v[3], planta: v[4], dir: v[5], contacto: v[6], email: v[7], tel: v[8]})) : []);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/clientes', (req, res) => {
    try {
        const { id, razon, rut, giro, planta, dir, contacto, email, tel } = req.body;
        db.run("INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)", [id || Date.now().toString(), razon, rut, giro, planta, dir, contacto, email, tel]);
        saveDatabase();
        res.json({success: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/catalogo', (req, res) => {
    try {
        const result = db.exec("SELECT * FROM catalogo");
        res.json(result.length > 0 ? result[0].values.map(v => ({id: v[0], desc: v[1], tipo: v[2], und: v[3], precio: v[4]})) : []);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/presupuestos', (req, res) => {
    try {
        const { id, num, desc, cliente_id, fecha, estado, tipo, validez, mo, mat, sub, gg, imp, util, net, iva, tot, items } = req.body;
        db.run(`INSERT INTO presupuestos (id, num, desc, cliente_id, fecha, estado, tipo, validez, mo, mat, sub, gg, imp, util, net, iva, tot, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
                [id, num, desc, cliente_id, fecha, estado, tipo, validez, mo, mat, sub, gg, imp, util, net, iva, tot, new Date().toISOString()]);
        
        if (items && items.length > 0) {
            items.forEach((it, idx) => db.run(`INSERT INTO items (pres_id, orden, desc, tipo, und, cant, tarifa) VALUES (?,?,?,?,?,?,?)`, [id, idx, it.desc, it.tipo, it.und, it.cant, it.tarifa]));
        }
        if (!req.query.noincrement) db.run("UPDATE config SET valor = valor + 1 WHERE clave = 'correlativo'");
        
        saveDatabase();
        res.json({success: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get('/api/presupuestos', (req, res) => {
    try {
        const result = db.exec("SELECT id, num, desc, fecha, tot FROM presupuestos ORDER BY created_at DESC LIMIT 50");
        res.json(result.length > 0 ? result[0].values.map(v => ({id: v[0], num: v[1], desc: v[2], fecha: v[3], tot: v[4]})) : []);
    } catch(e) { res.status(500).json({error: e.message}); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));