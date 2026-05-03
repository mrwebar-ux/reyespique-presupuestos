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

        // CREACIÓN DE TABLAS DESDE CERO
        db.run(`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (id TEXT PRIMARY KEY, razon TEXT, rut TEXT, giro TEXT, planta TEXT, dir TEXT, contacto TEXT, email TEXT, tel TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS catalogo (id TEXT PRIMARY KEY, desc TEXT, tipo TEXT, und TEXT, precio REAL);`);
        db.run(`CREATE TABLE IF NOT EXISTS presupuestos (id TEXT PRIMARY KEY, num TEXT, desc TEXT, cliente_id TEXT, fecha TEXT, estado TEXT, tipo TEXT, validez TEXT, mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL, net REAL, iva REAL, tot REAL, created_at TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, pres_id TEXT, orden INTEGER, desc TEXT, tipo TEXT, und TEXT, cant REAL, tarifa REAL);`);

        // INYECCIÓN DE DATOS REALES 2025/2026
        db.run(`INSERT OR IGNORE INTO config VALUES ('correlativo', '3001');`);
        
        // Clientes extraídos de Drive
        db.run(`INSERT OR IGNORE INTO clientes VALUES 
            ('c1', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Molinera', 'Planta Santiago', 'Obispo Vásquez Valencia 3104', 'Sr. Williams Moya', 'mrwebar@gmail.com', '+56 9 94577868'),
            ('c2', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Molinera', 'Planta Maipú', 'Av. Pajaritos 1234', 'Sr. Luis Gómez / Gonzalo Arévalo', '', ''),
            ('c3', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Molinera', 'Planta Casablanca', 'Ruta 68 Km 80', 'Sr. Cristian Mora del Prado', '', '')
        `);

        // Catálogo extraído de Drive
        db.run(`INSERT OR IGNORE INTO catalogo VALUES 
            ('k1', 'Cargo base por atención técnica (1 HE)', 'mo', 'HE', 34000),
            ('k2', 'Hora estándar técnico eléctrico (HE)', 'mo', 'HE', 34000),
            ('k3', 'Hora emergencia técnico (19:00-08:00)', 'mo', 'HE', 47905),
            ('k4', 'Mantenimiento y Limpieza de Válvulas a Silos', 'mo', 'Gl.', 190000),
            ('k5', 'Instalación Partidor Suave ABB 11KW', 'mat', 'un.', 1283000),
            ('k6', 'Cable preensamblado Al 3x70+50mm', 'mat', 'm', 4796),
            ('k7', 'Interruptor MITSUBISHI NF125-CV 3x100A', 'mat', 'un.', 58433),
            ('k8', 'Ingeniero automatización — lazo control', 'sub', 'GL', 280000)
        `);

        saveDB();
        console.log("Sistema Base de Datos Reyes y Piqué Iniciado.");
    } catch (e) { console.error("Fallo BD:", e); }
}

function saveDB() { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }

// ENDPOINTS API
app.get('/api/siguiente', (req, res) => {
    const r = db.exec("SELECT valor FROM config WHERE clave='correlativo'");
    res.json({ correlativo: r.length ? r[0].values[0][0] : '3001' });
});

app.get('/api/clientes', (req, res) => {
    const r = db.exec("SELECT * FROM clientes");
    res.json(r.length ? r[0].values.map(v => ({ id: v[0], razon: v[1], rut: v[2], giro: v[3], planta: v[4], dir: v[5], contacto: v[6], email: v[7], tel: v[8] })) : []);
});

app.get('/api/catalogo', (req, res) => {
    const r = db.exec("SELECT * FROM catalogo");
    res.json(r.length ? r[0].values.map(v => ({ id: v[0], desc: v[1], tipo: v[2], und: v[3], precio: v[4] })) : []);
});

app.post('/api/config', (req, res) => { 
    db.run("INSERT OR REPLACE INTO config VALUES (?,?)", [req.body.clave, req.body.valor]); 
    saveDB(); 
    res.json({success:true}); 
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log("Servidor Online")));