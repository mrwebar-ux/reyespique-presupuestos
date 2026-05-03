const express = require('express');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname))); 

const DB_FILE = path.join(__dirname, 'database.sqlite');
let db;

async function initDB() {
    try {
        const SQL = await initSqlJs();
        db = new SQL.Database(fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE) : undefined);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, razon TEXT, planta TEXT, contacto TEXT);`);
        const check = db.exec("SELECT COUNT(*) FROM clientes")[0].values[0][0];
        if (check === 0) {
            db.run(`INSERT INTO clientes (razon, planta, contacto) VALUES 
                ('Compañía Molinera San Cristóbal S.A.', 'Planta Santiago', 'Sr. Williams Moya'),
                ('Compañía Molinera San Cristóbal S.A.', 'Planta Santiago', 'Sr. Guillermo Matamala'),
                ('Compañía Molinera San Cristóbal S.A.', 'Planta Maipú', 'Sr. Luis Gómez'),
                ('Compañía Molinera San Cristóbal S.A.', 'Planta Casablanca', 'Sr. Cristian Mora del Prado');`);
        }
        fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    } catch (e) { console.error("Error BD:", e); }
}

app.get('/api/clientes', (req, res) => {
    const r = db.exec("SELECT * FROM clientes ORDER BY razon ASC, contacto ASC");
    res.json(r.length ? r[0].values.map(v => ({ id: v[0], razon: v[1], planta: v[3], contacto: v[4] })) : []);
});

app.post('/api/clientes', (req, res) => {
    const { razon, planta, contacto } = req.body;
    db.run("INSERT OR REPLACE INTO clientes (razon, planta, contacto) VALUES (?, ?, ?)", [razon, planta, contacto]);
    fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log("STRP SpA Online")));