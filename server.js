// ════════════════════════════════════════════════════════════════
// REYES Y PIQUÉ SpA — Servidor principal
// ════════════════════════════════════════════════════════════════
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── CLIENTES ─────────────────────────────────────────────────
app.get('/api/clientes', (req, res) => {
  res.json(db.prepare('SELECT * FROM clientes ORDER BY razon, planta').all());
});

app.post('/api/clientes', (req, res) => {
  const { razon, rut, giro, planta, dir, contacto, email, tel } = req.body;
  const id = 'c' + Date.now();
  db.prepare('INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)').run(id, razon, rut||'', giro||'', planta||'', dir||'', contacto||'', email||'', tel||'');
  res.json({ id, razon, rut, giro, planta, dir, contacto, email, tel });
});

app.put('/api/clientes/:id', (req, res) => {
  const { razon, rut, giro, planta, dir, contacto, email, tel } = req.body;
  db.prepare('UPDATE clientes SET razon=?,rut=?,giro=?,planta=?,dir=?,contacto=?,email=?,tel=? WHERE id=?')
    .run(razon, rut||'', giro||'', planta||'', dir||'', contacto||'', email||'', tel||'', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/clientes/:id', (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── CATÁLOGO ──────────────────────────────────────────────────
app.get('/api/catalogo', (req, res) => {
  res.json(db.prepare('SELECT * FROM catalogo ORDER BY tipo, desc').all());
});

app.post('/api/catalogo', (req, res) => {
  const { desc, tipo, und, precio } = req.body;
  const id = 'k' + Date.now();
  db.prepare('INSERT INTO catalogo VALUES (?,?,?,?,?)').run(id, desc, tipo, und, precio||0);
  res.json({ id, desc, tipo, und, precio });
});

app.put('/api/catalogo/:id', (req, res) => {
  const { desc, tipo, und, precio } = req.body;
  db.prepare('UPDATE catalogo SET desc=?,tipo=?,und=?,precio=? WHERE id=?').run(desc, tipo, und, precio||0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/catalogo/:id', (req, res) => {
  db.prepare('DELETE FROM catalogo WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── PRESUPUESTOS ──────────────────────────────────────────────
app.get('/api/presupuestos', (req, res) => {
  const pres = db.prepare(`
    SELECT p.*, c.razon, c.planta, c.contacto
    FROM presupuestos p
    LEFT JOIN clientes c ON p.cliente_id = c.id
    ORDER BY p.fecha DESC, CAST(p.num AS INTEGER) DESC
  `).all();
  res.json(pres);
});

app.get('/api/presupuestos/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM presupuestos WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  p.items = db.prepare('SELECT * FROM items WHERE pres_id=? ORDER BY orden').all(req.params.id);
  res.json(p);
});

app.post('/api/presupuestos', (req, res) => {
  const { desc, cliente_id, fecha, estado, tipo, validez, mo, mat, sub, net, iva, tot, items } = req.body;
  // Obtener siguiente correlativo
  const cfg = db.prepare("SELECT valor FROM config WHERE clave='siguiente'").get();
  const num = cfg ? cfg.valor : '3012';
  const id  = 'p' + Date.now();

  db.prepare(`INSERT INTO presupuestos (id,num,desc,cliente_id,fecha,estado,tipo,validez,mo,mat,sub,net,iva,tot)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, num, desc, cliente_id||'', fecha, estado||'En elaboración', tipo||'', validez||'30 días', mo||0, mat||0, sub||0, net||0, iva||0, tot||0);

  // Guardar ítems
  if (items && items.length) {
    const ins = db.prepare('INSERT INTO items (pres_id,orden,desc,tipo,und,cant,tarifa) VALUES (?,?,?,?,?,?,?)');
    items.forEach((it, i) => ins.run(id, i+1, it.desc, it.tipo, it.und, it.cant, it.tarifa));
  }

  // Incrementar correlativo
  const siguiente = (parseInt(num) + 1).toString();
  db.prepare("UPDATE config SET valor=? WHERE clave='siguiente'").run(siguiente);

  res.json({ id, num, siguiente });
});

app.put('/api/presupuestos/:id', (req, res) => {
  const { desc, cliente_id, fecha, estado, tipo, validez, mo, mat, sub, net, iva, tot, items } = req.body;
  db.prepare(`UPDATE presupuestos SET desc=?,cliente_id=?,fecha=?,estado=?,tipo=?,validez=?,mo=?,mat=?,sub=?,net=?,iva=?,tot=? WHERE id=?`)
    .run(desc, cliente_id||'', fecha, estado||'En elaboración', tipo||'', validez||'30 días', mo||0, mat||0, sub||0, net||0, iva||0, tot||0, req.params.id);

  if (items) {
    db.prepare('DELETE FROM items WHERE pres_id=?').run(req.params.id);
    const ins = db.prepare('INSERT INTO items (pres_id,orden,desc,tipo,und,cant,tarifa) VALUES (?,?,?,?,?,?,?)');
    items.forEach((it, i) => ins.run(req.params.id, i+1, it.desc, it.tipo, it.und, it.cant, it.tarifa));
  }
  res.json({ ok: true });
});

app.delete('/api/presupuestos/:id', (req, res) => {
  db.prepare('DELETE FROM items WHERE pres_id=?').run(req.params.id);
  db.prepare('DELETE FROM presupuestos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── CONFIG ────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const rows = db.prepare('SELECT * FROM config').all();
  const obj = {};
  rows.forEach(r => obj[r.clave] = r.valor);
  res.json(obj);
});

app.post('/api/config', (req, res) => {
  const upsert = db.prepare('INSERT INTO config (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor');
  Object.entries(req.body).forEach(([k,v]) => upsert.run(k, String(v)));
  res.json({ ok: true });
});

// ── Siguiente correlativo ─────────────────────────────────────
app.get('/api/siguiente', (req, res) => {
  const r = db.prepare("SELECT valor FROM config WHERE clave='siguiente'").get();
  res.json({ siguiente: r ? r.valor : '3012' });
});

// ── Fallback SPA ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => console.log(`Reyes y Piqué — Puerto ${PORT}`));
