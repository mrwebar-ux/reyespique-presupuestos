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

        db.run(`CREATE TABLE IF NOT EXISTS clientes (id TEXT PRIMARY KEY, razon TEXT, rut TEXT, planta TEXT, contacto TEXT);`);
        
        // Inyectar Clientes Extraídos de Drive 2025/2026
        const check = db.exec("SELECT COUNT(*) FROM clientes")[0].values[0][0];
        if (check === 0) {
            db.run(`INSERT INTO clientes VALUES 
                ('c1', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Santiago', 'Sr. Williams Moya / Sr. Guillermo Matamala'),
                ('c2', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Maipú', 'Sr. Luis Gómez / Sr. Gonzalo Arévalo'),
                ('c3', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta Casablanca', 'Sr. Cristian Mora del Prado'),
                ('c4', 'Compañía Molinera San Cristóbal S.A.', '76.602.175-1', 'Planta San Bernardo', 'Sr. Gonzalo Arévalo / Eduardo Lara')
            `);
        }
        fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    } catch (e) { console.error("Error BD:", e); }
}

app.get('/api/clientes', (req, res) => {
    const r = db.exec("SELECT * FROM clientes");
    res.json(r.length ? r[0].values.map(v => ({ id: v[0], razon: v[1], rut: v[2], planta: v[3], contacto: v[4] })) : []);
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log("STRP Online")));