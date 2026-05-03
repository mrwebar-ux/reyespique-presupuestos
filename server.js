const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname))); 

const DB_FILE = path.join(__dirname, 'database.sqlite');
let db;

// Inicialización de la Base de Datos con Inyección de Datos Reales 2025/2026
async function initDB() {
    try {
        const SQL = await initSqlJs();
        let filebuffer;
        
        if (fs.existsSync(DB_FILE)) {
            filebuffer = fs.readFileSync(DB_FILE);
        }

        if (filebuffer && filebuffer.length > 0) {
            try {
                db = new SQL.Database(filebuffer);
                console.log("Base de datos cargada exitosamente.");
            } catch(e) {
                console.warn("Base de datos corrupta, creando una nueva...", e);
                db = new SQL.Database();
            }
        } else {
            db = new SQL.Database();
            console.log("Creando nueva base de datos en blanco.");
        }

        // ESQUEMA DE TABLAS
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

        // INYECCIÓN DE DATOS INICIALES (Se ignora si ya existen)
        db.run(`INSERT OR IGNORE INTO config (clave, valor) VALUES ('correlativo', '3100')`);
        
        // Cargar Clientes Extraídos desde Google Drive 2025/2026
        db.run(`INSERT OR IGNORE INTO clientes (id, razon, planta, contacto, email, tel, rut, giro, dir) VALUES 
            ('c1', 'Compañía Molinera San Cristóbal S.A.', 'Planta Santiago', 'Sr. Williams Moya', '', '', '76.602.175', 'Molinera', 'Obispo Javier Vásquez Valencia Nº 3104. Cerrillos'),
            ('c2', 'Compañía Molinera San Cristóbal S.A.', 'Planta Santiago', 'Sr. Pablo Adrián B.', '', '', '76.602.175', 'Molinera', 'Obispo Javier Vásquez Valencia Nº 3104. Cerrillos')
        `);

        // Cargar Catálogo Real (Materiales y Trabajos extraídos de presupuestos 2025/2026)
        db.run(`INSERT OR IGNORE INTO catalogo (id, desc, tipo, und, precio) VALUES 
            ('k1', 'Cargo base por atención', 'mo', 'HE', 143716),
            ('k2', 'Hora estándar técnico eléctrico (HE)', 'mo', 'HE', 34000),
            ('k3', 'Hora emergencia técnico (19:00-08:00)', 'mo', 'HE', 47905),
            ('k4', 'Servicio Técnico: Visita Breve / Diagnóstico', 'mo', 'Gl.', 95000),
            ('k5', 'Servicio Técnico: Falla en Equipo y Reparación', 'mo', 'Gl.', 195000),
            ('k6', 'Servicio Técnico: Reparación Compleja / Falla Transmisión', 'mo', 'Gl.', 295000),
            ('k7', 'Mantenimiento y Limpieza de Válvulas a Silos', 'mo', 'Gl.', 190000),
            ('k8', 'Apoyo de Trabajos Mecánicos Generales', 'mo', 'Gl.', 120000),
            ('k9', 'Provisión y Reemplazo de Luminarias LED/UFO', 'mo', 'Gl.', 145000),
            ('k10', 'Motor Ventilador Polvo + Cordon + Partidor Suave ABB 11KW', 'mat', 'Gl.', 1283000),
            ('k11', 'Refrigerante R-410 y Materiales Varios de Gasfitería', 'mat', 'Gl.', 155000),
            ('k12', 'Limpieza de Válvulas y Suministro Oring', 'mat', 'Gl.', 350000),
            ('k13', 'Provisión y Cambio de WC / Lavamanos', 'mat', 'Gl.', 325000),
            ('k14', 'Reparación Menor (Chapa, Llaves de paso, Extractor)', 'mo', 'Gl.', 65000),
            ('k15', 'Reposición de Vidrio Roto', 'mo', 'Gl.', 18000),
            ('k16', 'Trabajos de Destape en Silo de Afrecho', 'mo', 'Gl.', 995000),
            ('k17', 'Reseteo y Ajuste de Microbalanza / Dosificación', 'mo', 'Gl.', 175000),
            ('k18', 'Reparación Pantalla HMI / Configuración PLC / Modulo', 'mo', 'Gl.', 195000),
            ('k19', 'Reemplazo de Variador Hidráulico', 'mo', 'Gl.', 195000),
            ('k20', 'Empalme Técnico y Fijación en Bornera', 'mo', 'Gl.', 195000),
            ('k21', 'Cambio de Fusibles de Tarjeta / Relé Interfaz', 'mat', 'Gl.', 175000)
        `);

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

app.use((req, res, next) => {
    if (!db && req.path.startsWith('/api/')) {
        return res.status(500).json({ error: "La base de datos aún no está lista." });
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

app.get('/api/stats', (req, res) => {
    try {
        const stmt = db.prepare("SELECT COUNT(*) as total FROM presupuestos");
        stmt.step();
        const total = stmt.getAsObject().total;
        stmt.free();
        res.json({ total_presupuestos: total });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor Reyes y Piqué ejecutándose en el puerto ${PORT}`);
    });
});