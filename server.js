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
        db.run(`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);`);
        db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, razon TEXT, planta TEXT, contacto TEXT);`);
        
        const configCheck = db.exec("SELECT COUNT(*) FROM config")[0].values[0][0];
        if (configCheck === 0) {
            db.run(`INSERT INTO config (clave, valor) VALUES 
                ('correlativo', '3000'), ('p_gg', '12'), ('p_imp', '5'), ('p_util', '13'),
                ('m_mat', '45'), ('m_sub', '35'), ('val_he', '34000');`);
        }
        fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    } catch (e) { console.error("Error BD:", e); }
}

app.get('/api/config', (req, res) => {
    const r = db.exec("SELECT * FROM config");
    res.json(r.length ? r[0].values.reduce((acc, v) => ({...acc, [v[0]]: v[1]}), {}) : {});
});

app.post('/api/incrementar-folio', (req, res) => {
    const r = db.exec("SELECT valor FROM config WHERE clave = 'correlativo'");
    let next = parseInt(r[0].values[0][0]) + 1;
    db.run("UPDATE config SET valor = ? WHERE clave = 'correlativo'", [next]);
    fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    res.json({ success: true, nextFolio: next });
});

app.get('/api/clientes', (req, res) => {
    const r = db.exec("SELECT * FROM clientes ORDER BY razon ASC");
    res.json(r.length ? r[0].values.map(v => ({ id: v[0], razon: v[1], planta: v[2], contacto: v[3] })) : []);
});

app.post('/api/clientes', (req, res) => {
    const { razon, planta, contacto } = req.body;
    db.run("INSERT OR REPLACE INTO clientes (razon, planta, contacto) VALUES (?, ?, ?)", [razon, planta, contacto]);
    fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log("Servidor STRP v18.0")));