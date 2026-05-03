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

        // Tabla de clientes con RUT y Planta como identificadores
        db.run(`CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            razon TEXT, 
            rut TEXT, 
            planta TEXT, 
            contacto TEXT
        );`);

        // Inyección inicial de nombres individuales si la tabla está vacía [cite: 427, 430]
        const check = db.exec("SELECT COUNT(*) FROM clientes")[0].values[0][0];
        if (check === 0) {
            db.run(`INSERT INTO clientes (razon, rut, planta, contacto) VALUES 
                ('Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Santiago', 'Sr. Williams Moya'),
                ('Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Santiago', 'Sr. Guillermo Matamala'),
                ('Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Maipú', 'Sr. Luis Gómez'),
                ('Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Casablanca', 'Sr. Cristian Mora del Prado');`);
        }
        saveDB();
        console.log("Servidor STRP SpA: Base de datos lista.");
    } catch (e) { console.error("Error BD:", e); }
}

function saveDB() { fs.writeFileSync(DB_FILE, Buffer.from(db.export())); }

// ENDPOINTS
app.get('/api/clientes', (req, res) => {
    const r = db.exec("SELECT * FROM clientes ORDER BY razon ASC");
    res.json(r.length ? r[0].values.map(v => ({ id: v[0], razon: v[1], rut: v[2], planta: v[3], contacto: v[4] })) : []);
});

// NUEVO: Guardar o actualizar cliente [cite: 411]
app.post('/api/clientes', (req, res) => {
    const { razon, contacto } = req.body;
    db.run("INSERT OR REPLACE INTO clientes (razon, contacto) VALUES (?, ?)", [razon, contacto]);
    saveDB();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log("STRP Online")));