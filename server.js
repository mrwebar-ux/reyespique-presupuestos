const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname))); // Sirve el index.html

const DB_FILE = 'database.sqlite';
let db;

// Inicialización de la Base de Datos
async function initDB() {
    try {
        const SQL = await initSqlJs();
        if (fs.existsSync(DB_FILE)) {
            const filebuffer = fs.readFileSync(DB_FILE);
            db = new SQL.Database(filebuffer);
            console.log("Base de datos cargada desde archivo.");
        } else {
            db = new SQL.Database();
            // ESQUEMA CRÍTICO
            db.run(`
                CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT);
                CREATE TABLE clientes (
                    id TEXT PRIMARY KEY, razon TEXT, rut TEXT, giro TEXT,
                    planta TEXT, dir TEXT, contacto TEXT, email TEXT, tel TEXT
                );
                CREATE TABLE catalogo (
                    id TEXT PRIMARY KEY, desc TEXT, tipo TEXT, und TEXT, precio REAL
                );
                CREATE TABLE presupuestos (
                    id TEXT PRIMARY KEY, num TEXT, desc TEXT, cliente_id TEXT,
                    fecha TEXT, estado TEXT, tipo TEXT, validez TEXT,
                    mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL,
                    net REAL, iva REAL, tot REAL, created_at TEXT
                );
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, pres_id TEXT, orden INTEGER,
                    desc TEXT, tipo TEXT, und TEXT, cant REAL, tarifa REAL
                );
            `);
            // Insertar configuración inicial y correlativo 3100
            db.run(`INSERT INTO config (clave, valor) VALUES ('correlativo', '3100')`);
            saveDB();
            console.log("Base de datos nueva creada.");
        }
    } catch (error) {
        console.error("Error inicializando BD:", error);
    }
}

function saveDB() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
}

// --- API REST ---

// CONFIGURACIÓN
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

// CLIENTES
app.get('/api/clientes', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM clientes");
        let result = [];
        while (stmt.step()) result.push(stmt.getAsObject());
        stmt.free();
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clientes', (req, res) => {
    try {
        const { id, razon, rut, giro, planta, dir, contacto, email, tel } = req.body;
        db.run("INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)", [id, razon, rut, giro, planta, dir, contacto, email, tel]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clientes/:id', (req, res) => {
    try {
        const { razon, rut, giro, planta, dir, contacto, email, tel } = req.body;
        db.run("UPDATE clientes SET razon=?, rut=?, giro=?, planta=?, dir=?, contacto=?, email=?, tel=? WHERE id=?", 
            [razon, rut, giro, planta, dir, contacto, email, tel, req.params.id]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clientes/:id', (req, res) => {
    try {
        db.run("DELETE FROM clientes WHERE id=?", [req.params.id]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// CATÁLOGO
app.get('/api/catalogo', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM catalogo");
        let result = [];
        while (stmt.step()) result.push(stmt.getAsObject());
        stmt.free();
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/catalogo', (req, res) => {
    try {
        const { id, desc, tipo, und, precio } = req.body;
        db.run("INSERT INTO catalogo VALUES (?,?,?,?,?)", [id, desc, tipo, und, precio]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/catalogo/:id', (req, res) => {
    try {
        db.run("DELETE FROM catalogo WHERE id=?", [req.params.id]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PRESUPUESTOS
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

app.get('/api/presupuestos/:id', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM presupuestos WHERE id=?");
        stmt.bind([req.params.id]);
        if (!stmt.step()) return res.status(404).json({ error: "No encontrado" });
        const pres = stmt.getAsObject();
        stmt.free();

        const stmtItems = db.prepare("SELECT * FROM items WHERE pres_id=? ORDER BY orden ASC");
        stmtItems.bind([req.params.id]);
        let items = [];
        while (stmtItems.step()) items.push(stmtItems.getAsObject());
        stmtItems.free();

        pres.items = items;
        res.json(pres);
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

        // Actualizar correlativo a menos que se importe sin incrementarlo
        if (!req.query.noincrement) {
            db.run("UPDATE config SET valor = valor + 1 WHERE clave = 'correlativo'");
        }

        saveDB();
        res.json({ success: true, id: p.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/presupuestos/:id', (req, res) => {
    try {
        const p = req.body;
        db.run(`UPDATE presupuestos SET 
            num=?, desc=?, cliente_id=?, fecha=?, estado=?, tipo=?, validez=?, 
            mo=?, mat=?, sub=?, gg=?, imp=?, util=?, net=?, iva=?, tot=? 
            WHERE id=?`,
            [p.num, p.desc, p.cliente_id, p.fecha, p.estado, p.tipo, p.validez, 
             p.mo, p.mat, p.sub, p.gg, p.imp, p.util, p.net, p.iva, p.tot, p.id]
        );

        db.run("DELETE FROM items WHERE pres_id=?", [p.id]);
        p.items.forEach((item, index) => {
            db.run("INSERT INTO items (pres_id, orden, desc, tipo, und, cant, tarifa) VALUES (?,?,?,?,?,?,?)",
                [p.id, index, item.desc, item.tipo, item.und, item.cant, item.tarifa]);
        });

        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/presupuestos/:id', (req, res) => {
    try {
        db.run("DELETE FROM presupuestos WHERE id=?", [req.params.id]);
        db.run("DELETE FROM items WHERE pres_id=?", [req.params.id]);
        saveDB();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/presupuestos', (req, res) => {
    try {
        db.run("DELETE FROM presupuestos");
        db.run("DELETE FROM items");
        saveDB();
        res.json({ success: true });
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