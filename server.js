const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname))); 

const DB_FILE = path.join(__dirname, 'database.sqlite');
let db;

// Inicialización ultra-segura de la Base de Datos
async function initDB() {
    try {
        const SQL = await initSqlJs();
        let filebuffer;
        
        if (fs.existsSync(DB_FILE)) {
            filebuffer = fs.readFileSync(DB_FILE);
        }

        // Si el archivo existe y no está vacío, lo cargamos. Si falla, creamos uno nuevo.
        if (filebuffer && filebuffer.length > 0) {
            try {
                db = new SQL.Database(filebuffer);
                console.log("Base de datos cargada exitosamente.");
            } catch(e) {
                console.warn("Base de datos corrupta o ilegible, creando una nueva...", e);
                db = new SQL.Database();
            }
        } else {
            db = new SQL.Database();
            console.log("Creando nueva base de datos en blanco.");
        }

        // ESQUEMA CRÍTICO (Usamos IF NOT EXISTS para proteger los datos si ya existen)
        db.run(`
            CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);
            CREATE TABLE IF NOT EXISTS clientes (
                id TEXT PRIMARY KEY, razon TEXT, rut TEXT, giro TEXT,
                planta TEXT, dir TEXT, contacto TEXT, email TEXT, tel TEXT
            );
            CREATE TABLE IF NOT EXISTS catalogo (
                id TEXT PRIMARY KEY, desc TEXT, tipo TEXT, und TEXT, precio REAL
            );
            CREATE TABLE IF NOT EXISTS presupuestos (
                id TEXT PRIMARY KEY, num TEXT, desc TEXT, cliente_id TEXT,
                fecha TEXT, estado TEXT, tipo TEXT, validez TEXT,
                mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL,
                net REAL, iva REAL, tot REAL, created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT, pres_id TEXT, orden INTEGER,
                desc TEXT, tipo TEXT, und TEXT, cant REAL, tarifa REAL
            );
        `);

        // Insertar configuración inicial solo si no existe
        db.run(`INSERT OR IGNORE INTO config (clave, valor) VALUES ('correlativo', '3100')`);
        saveDB();
        
    } catch (error) {
        console.error("Fallo crítico inicializando la base de datos:", error);
    }
}

function saveDB() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_FILE, buffer);
    } catch(error) {
        console.error("Error al guardar la base de datos:", error);
    }
}

// Middleware de seguridad: Verifica que la DB esté lista
app.use((req, res, next) => {
    if (!db && req.path.startsWith('/api/')) {
        return res.status(500).json({ error: "La base de datos aún no está lista o falló al iniciar." });
    }
    next();
});

// --- API REST ---

app.get('/api/config', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM config");
        let result = [];
        while (stmt.step()) result.push(stmt.getAsObject());
        stmt.free();
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', (req, res) => {
    try {
        const { clave, valor } = req.body;
        db.run("INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)", [clave, valor]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/siguiente', (req, res) => {
    try {
        const stmt = db.prepare("SELECT valor FROM config WHERE clave = 'correlativo'");
        stmt.step();
        const row = stmt.getAsObject();
        stmt.free();
        res.json({ correlativo: row.valor || '3100' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clientes', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM clientes");
        let result = [];
        while (stmt.step()) result.push(stmt.getAsObject());
        stmt.free();
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/catalogo', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM catalogo");
        let result = [];
        while (stmt.step()) result.push(stmt.getAsObject());
        stmt.free();
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/presupuestos', (req, res) => {
    try {
        const limit = req.query.limit || 50;
        const offset = req.query.offset || 0;
        const stmt = db.prepare("SELECT * FROM presupuestos ORDER BY num DESC LIMIT ? OFFSET ?");
        stmt.bind([limit, offset]);
        let result = [];
        while (stmt.step()) result.push(stmt.getAsObject());
        stmt.free();
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/presupuestos', (req, res) => {
    try {
        const p = req.body;
        db.run(`INSERT INTO presupuestos 
            (id, num, desc, cliente_id, fecha, estado, tipo, validez, mo, mat, sub, gg, imp, util, net, iva, tot, created_at) 
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [p.id, p.num, p.desc, p.cliente_id, p.fecha, p.estado, p.tipo, p.validez, 
             p.mo, p.mat, p.sub, p.gg, p.imp, p.util, p.net, p.iva, p.tot, p.created_at]
        );

        p.items.forEach((item, index) => {
            db.run("INSERT INTO items (pres_id, orden, desc, tipo, und, cant, tarifa) VALUES (?,?,?,?,?,?,?)",
                [p.id, index, item.desc, item.tipo, item.und, item.cant, item.tarifa]);
        });

        if (!req.query.noincrement) {
            db.run("UPDATE config SET valor = valor + 1 WHERE clave = 'correlativo'");
        }

        saveDB();
        res.json({ success: true, id: p.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ESTADÍSTICAS DASHBOARD
app.get('/api/stats', (req, res) => {
    try {
        const stmt = db.prepare("SELECT COUNT(*) as total FROM presupuestos");
        stmt.step();
        const total = stmt.getAsObject().total;
        stmt.free();
        res.json({ total_presupuestos: total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor Reyes y Piqué ejecutándose en el puerto ${PORT}`);
    });
});