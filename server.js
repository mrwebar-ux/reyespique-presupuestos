const express = require("express");
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "database.sqlite");

const DRIVE_WEBHOOK_URL = (process.env.DRIVE_WEBHOOK_URL || "").trim();
const DRIVE_SECRET_KEY = (process.env.DRIVE_SECRET_KEY || "").trim();

let db = null;

app.use(express.json({ limit: "25mb" }));
app.use(express.static(__dirname));

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function persistDB() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function rowsFromResult(result) {
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, idx) => obj[col] = row[idx]);
    return obj;
  });
}

function getConfigObject() {
  const result = db.exec("SELECT clave, valor FROM config ORDER BY clave");
  const out = {};
  rowsFromResult(result).forEach((r) => out[r.clave] = r.valor);
  return out;
}

function getConfigValue(clave, fallback = "0") {
  const result = db.exec("SELECT valor FROM config WHERE clave = ?", [clave]);
  return result.length && result[0].values.length ? String(result[0].values[0][0]) : fallback;
}

function seedDefaultConfig() {
  const defaults = {
    correlativo: "3100",
    he: "34000",
    margen_mat: "0.45",
    margen_sub: "0.35",
    gg: "0.12",
    imp: "0.05",
    util: "0.13",
    iva: "0.19"
  };

  const stmt = db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)");
  Object.entries(defaults).forEach(([clave, valor]) => stmt.run([clave, valor]));
  stmt.free();
}

function seedCatalogo() {
  const countResult = db.exec("SELECT COUNT(*) AS total FROM catalogo");
  const count = countResult[0]?.values?.[0]?.[0] || 0;
  if (count > 0) return;

  const items = [
    ["cat_mo_001", "Hora hombre técnico eléctrico", "mo", "HH", 34000],
    ["cat_mo_002", "Hora hombre técnico automatización", "mo", "HH", 42000],
    ["cat_mo_003", "Hora hombre supervisor", "mo", "HH", 48000],
    ["cat_mat_001", "Canalización EMT / PVC y accesorios", "mat", "GL", 1],
    ["cat_mat_002", "Conductores eléctricos y terminales", "mat", "GL", 1],
    ["cat_mat_003", "Protecciones eléctricas y tableros", "mat", "GL", 1],
    ["cat_mat_004", "Sensores, finales de carrera y elementos de control", "mat", "GL", 1],
    ["cat_sub_001", "Servicio externo de montaje", "sub", "GL", 1],
    ["cat_sub_002", "Servicio externo de fabricación mecánica", "sub", "GL", 1],
    ["cat_sub_003", "Arriendo de equipos o maquinaria", "sub", "GL", 1]
  ];

  const stmt = db.prepare("INSERT INTO catalogo (id, [desc], tipo, und, precio) VALUES (?, ?, ?, ?, ?)");
  items.forEach((row) => stmt.run(row));
  stmt.free();
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      razon TEXT,
      rut TEXT,
      giro TEXT,
      planta TEXT,
      dir TEXT,
      contacto TEXT,
      email TEXT,
      tel TEXT
    );

    CREATE TABLE IF NOT EXISTS catalogo (
      id TEXT PRIMARY KEY,
      desc TEXT,
      tipo TEXT,
      und TEXT,
      precio REAL
    );

    CREATE TABLE IF NOT EXISTS presupuestos (
      id TEXT PRIMARY KEY,
      num TEXT,
      desc TEXT,
      cliente_id TEXT,
      fecha TEXT,
      estado TEXT,
      tipo TEXT,
      validez TEXT,
      mo REAL,
      mat REAL,
      sub REAL,
      gg REAL,
      imp REAL,
      util REAL,
      net REAL,
      iva REAL,
      tot REAL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pres_id TEXT,
      orden INTEGER,
      desc TEXT,
      tipo TEXT,
      und TEXT,
      cant REAL,
      tarifa REAL
    );
  `);

  seedDefaultConfig();
  seedCatalogo();
  persistDB();
}

function getClientes() {
  return rowsFromResult(db.exec("SELECT * FROM clientes ORDER BY razon COLLATE NOCASE"));
}

function getCatalogo() {
  return rowsFromResult(db.exec("SELECT id, [desc], tipo, und, precio FROM catalogo ORDER BY tipo, [desc]"));
}

function getPresupuestos() {
  return rowsFromResult(db.exec(`
    SELECT 
      p.id, p.num, p.[desc], p.cliente_id,
      c.razon AS cliente_razon,
      p.fecha, p.estado, p.tipo, p.validez,
      p.mo, p.mat, p.sub, p.gg, p.imp, p.util, p.net, p.iva, p.tot, p.created_at
    FROM presupuestos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    ORDER BY p.created_at DESC
  `));
}

function getPresupuestoById(id) {
  const pres = rowsFromResult(db.exec(`
    SELECT 
      p.*,
      c.razon AS cliente_razon,
      c.rut AS cliente_rut,
      c.giro AS cliente_giro,
      c.planta AS cliente_planta,
      c.dir AS cliente_dir,
      c.contacto AS cliente_contacto,
      c.email AS cliente_email,
      c.tel AS cliente_tel
    FROM presupuestos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    WHERE p.id = ?
  `, [id]))[0];

  if (!pres) return null;

  pres.items = rowsFromResult(db.exec(`
    SELECT id, pres_id, orden, [desc], tipo, und, cant, tarifa
    FROM items
    WHERE pres_id = ?
    ORDER BY orden ASC
  `, [id]));

  return pres;
}

function calculateTotals(items, config) {
  const margenMat = Number(config.margen_mat || 0);
  const margenSub = Number(config.margen_sub || 0);
  const pctGG = Number(config.gg || 0);
  const pctImp = Number(config.imp || 0);
  const pctUtil = Number(config.util || 0);
  const pctIva = Number(config.iva || 0);

  let mo = 0;
  let mat = 0;
  let sub = 0;

  items.forEach((item) => {
    const cant = Number(item.cant || 0);
    const tarifa = Number(item.tarifa || 0);
    const base = cant * tarifa;

    if (item.tipo === "mat") mat += base * (1 + margenMat);
    else if (item.tipo === "sub") sub += base * (1 + margenSub);
    else mo += base;
  });

  const cd = mo + mat + sub;
  const gg = cd * pctGG;
  const imp = cd * pctImp;
  const util = cd * pctUtil;
  const net = cd + gg + imp + util;
  const iva = net * pctIva;
  const tot = net + iva;

  return { mo, mat, sub, gg, imp, util, net, iva, tot };
}

function formatCLP(value) {
  return Number(value || 0).toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  });
}

function escapeHtmlServer(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tipoLabelServer(tipo) {
  if (tipo === "mo") return "Mano de Obra";
  if (tipo === "mat") return "Materiales";
  if (tipo === "sub") return "Subcontratos";
  return tipo || "";
}

function itemFinalServer(item, config) {
  const base = Number(item.cant || 0) * Number(item.tarifa || 0);
  if (item.tipo === "mat") return base * (1 + Number(config.margen_mat || 0));
  if (item.tipo === "sub") return base * (1 + Number(config.margen_sub || 0));
  return base;
}

function buildPresupuestoHtml(p, config) {
  const cd = Number(p.mo || 0) + Number(p.mat || 0) + Number(p.sub || 0);
  const rows = (p.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtmlServer(item.desc)}</td>
      <td>${tipoLabelServer(item.tipo)}</td>
      <td>${escapeHtmlServer(item.und)}</td>
      <td>${Number(item.cant || 0).toLocaleString("es-CL")}</td>
      <td>${formatCLP(item.tarifa)}</td>
      <td><strong>${formatCLP(itemFinalServer(item, config))}</strong></td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Presupuesto ${escapeHtmlServer(p.num)}</title>
<style>
@page { margin: 0; size: A4; }
body { font-family: Arial, Helvetica, sans-serif; color:#111827; margin:0; padding:18mm; }
.header { display:flex; justify-content:space-between; border-bottom:4px solid #111827; padding-bottom:16px; margin-bottom:24px; }
.logo { font-size:26px; font-weight:900; }
.company { font-size:13px; line-height:1.45; margin-top:0; }
.company-main strong { font-size:20px; color:#111827; }
.company-main { line-height:1.5; }
.box { border:1px solid #111827; padding:12px 16px; text-align:right; min-width:190px; }
h4 { background:#111827; color:#fff; padding:8px 10px; font-size:13px; text-transform:uppercase; margin:22px 0 10px; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 18px; font-size:13px; }
.grid div { border-bottom:1px solid #e5e7eb; padding:6px 0; }
table { width:100%; border-collapse:collapse; margin-top:10px; }
th { background:#111827; color:white; font-size:12px; padding:8px; text-align:left; }
td { border-bottom:1px solid #e5e7eb; padding:8px; font-size:13px; }
.economic-wrap { margin-top:18px; width:100%; }
.economic-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; width:100%; }
.economic-card { border:1px solid #d1d5db; padding:10px 12px; background:#fafafa; min-height:58px; }
.economic-card .label { font-size:11px; text-transform:uppercase; color:#6b7280; margin-bottom:6px; font-weight:700; }
.economic-card .value { font-size:18px; font-weight:800; color:#111827; }
.economic-card.highlight-neto { background:#f3f4f6; border:2px solid #9ca3af; }
.economic-card.highlight-iva { background:#eef2ff; border:2px solid #818cf8; }
.economic-card.highlight-total { background:#111827; border:2px solid #111827; }
.economic-card.highlight-total .label, .economic-card.highlight-total .value { color:#fff; }
@media (max-width:768px) { .economic-grid { grid-template-columns:1fr 1fr; } }
@media (max-width:520px) { .economic-grid { grid-template-columns:1fr; } }
.footer { margin-top:42px; padding-top:18px; border-top:1px solid #d1d5db; font-size:12px; line-height:1.45; color:#4b5563; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company company-main">
      <strong>Servicio Técnico Reyes y Piqué SpA</strong><br>
      RUT: 76.602.175-1<br>
      Contratista de molinos de trigo, ingeniería eléctrica, mantenimiento y automatización.<br>
      Obispo Vásquez Valencia 3104, Cerrillos, Santiago - Chile<br>
      Teléfono móvil: +56 9 9457 7868<br>
      mrwebar@gmail.com
    </div>
  </div>
  <div class="box">
    <span>Presupuesto</span><br>
    <strong style="font-size:20px;">N° ${escapeHtmlServer(p.num)}</strong><br>
    <small>Fecha: ${escapeHtmlServer(p.fecha)}</small>
  </div>
</div>

<div class="grid">
  <div><strong>Razón Social:</strong> ${escapeHtmlServer(p.cliente_razon)}</div>
  <div><strong>RUT:</strong> ${escapeHtmlServer(p.cliente_rut)}</div>
  <div><strong>Giro:</strong> ${escapeHtmlServer(p.cliente_giro)}</div>
  <div><strong>Planta:</strong> ${escapeHtmlServer(p.cliente_planta)}</div>
  <div><strong>Dirección:</strong> ${escapeHtmlServer(p.cliente_dir)}</div>
  <div><strong>Contacto:</strong> ${escapeHtmlServer(p.cliente_contacto)}</div>
  <div><strong>Email:</strong> ${escapeHtmlServer(p.cliente_email)}</div>
  <div><strong>Teléfono:</strong> ${escapeHtmlServer(p.cliente_tel)}</div>
</div>

<h4>Descripción del Servicio</h4>
<p>${escapeHtmlServer(p.desc)}</p>
<p><strong>Validez:</strong> ${escapeHtmlServer(p.validez || "15 días")}</p>

<h4>Detalle Técnico Económico</h4>
<table>
<thead>
<tr>
  <th>N°</th>
  <th>Descripción</th>
  <th>Tipo</th>
  <th>Und</th>
  <th>Cant.</th>
  <th>Tarifa / Costo</th>
  <th>Total Final</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>

<div class="economic-wrap">
  <div class="economic-grid">
    <div class="economic-card"><div class="label">Mano de Obra</div><div class="value">${formatCLP(p.mo)}</div></div>
    <div class="economic-card"><div class="label">Materiales</div><div class="value">${formatCLP(p.mat)}</div></div>
    <div class="economic-card"><div class="label">Subcontratos</div><div class="value">${formatCLP(p.sub)}</div></div>
    <div class="economic-card"><div class="label">Costo Directo</div><div class="value">${formatCLP(cd)}</div></div>
    <div class="economic-card"><div class="label">Gastos Generales</div><div class="value">${formatCLP(p.gg)}</div></div>
    <div class="economic-card"><div class="label">Imprevistos</div><div class="value">${formatCLP(p.imp)}</div></div>
    <div class="economic-card"><div class="label">Utilidad</div><div class="value">${formatCLP(p.util)}</div></div>
    <div class="economic-card highlight-neto"><div class="label">Subtotal Neto</div><div class="value">${formatCLP(p.net)}</div></div>
    <div class="economic-card highlight-iva"><div class="label">IVA 19%</div><div class="value">${formatCLP(p.iva)}</div></div>
    <div class="economic-card highlight-total"><div class="label">TOTAL</div><div class="value">${formatCLP(p.tot)}</div></div>
  </div>
</div>

<div class="footer">
  <strong>Condiciones Generales:</strong><br>
  Valores expresados en pesos chilenos. Presupuesto sujeto a validación técnica en terreno cuando corresponda.
  Todo trabajo adicional no indicado en este documento deberá ser cotizado y aprobado previamente.
  <br><br>
  <strong>Servicio Técnico Reyes y Piqué SpA</strong> - RUT 76.602.175-1
</div>
</body>
</html>`;
}

async function sendToDrive(payload) {
  if (!DRIVE_WEBHOOK_URL || !DRIVE_SECRET_KEY) {
    return { ok: false, skipped: true, message: "Google Drive no configurado." };
  }

  try {
    const response = await fetch(DRIVE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        secret: DRIVE_SECRET_KEY,
        ...payload
      }),
      redirect: "follow"
    });

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, raw: text };
    }
  } catch (err) {
    console.error("Error enviando a Google Drive:", err.message);
    return { ok: false, error: err.message };
  }
}


async function pingDriveByGet() {
  if (!DRIVE_WEBHOOK_URL || !DRIVE_SECRET_KEY) {
    return {
      configured: false,
      ok: false,
      message: "Variables DRIVE_WEBHOOK_URL y DRIVE_SECRET_KEY no configuradas."
    };
  }

  try {
    const response = await fetch(DRIVE_WEBHOOK_URL, {
      method: "GET",
      redirect: "follow"
    });

    const text = await response.text();

    try {
      return {
        configured: true,
        railwayUrlEndsWith: DRIVE_WEBHOOK_URL.slice(-10),
        ...JSON.parse(text)
      };
    } catch {
      return {
        configured: true,
        ok: false,
        railwayUrlEndsWith: DRIVE_WEBHOOK_URL.slice(-10),
        raw: text.slice(0, 1000)
      };
    }
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: err.message
    };
  }
}

function databaseBase64() {
  if (!fs.existsSync(DB_FILE)) return "";
  return fs.readFileSync(DB_FILE).toString("base64");
}

async function syncFullStateToDrive(extra = {}) {
  const config = getConfigObject();
  const clientes = getClientes();
  const catalogo = getCatalogo();
  const presupuestos = getPresupuestos();

  const state = {
    generated_at: nowISO(),
    config,
    clientes,
    catalogo,
    presupuestos,
    ...extra
  };

  return await sendToDrive({
    action: "saveFullState",
    filename: "estado_general_sistema.json",
    data: state
  });
}

async function start() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  initSchema();

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      app: "Sistema Presupuestacion Reyes y Pique",
      driveConfigured: Boolean(DRIVE_WEBHOOK_URL && DRIVE_SECRET_KEY),
      driveUrlEndsWith: DRIVE_WEBHOOK_URL ? DRIVE_WEBHOOK_URL.slice(-10) : ""
    });
  });

  app.get("/api/drive/status", async (req, res) => {
    try {
      const result = await pingDriveByGet();
      res.json(result);
    } catch (err) {
      res.status(500).json({
        configured: Boolean(DRIVE_WEBHOOK_URL && DRIVE_SECRET_KEY),
        ok: false,
        error: err.message
      });
    }
  });

  app.post("/api/drive/sync", async (req, res) => {
    try {
      const result = await syncFullStateToDrive({ manual_sync: true });
      const backup = await sendToDrive({
        action: "backupDatabase",
        filename: `database-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.base64.txt`,
        base64: databaseBase64()
      });

      res.json({ ok: true, stateSync: result, databaseBackup: backup });
    } catch (err) {
      res.status(500).json({ error: "No fue posible sincronizar con Drive.", detail: err.message });
    }
  });

  app.get("/api/config", (req, res) => {
    try {
      res.json(getConfigObject());
    } catch (err) {
      res.status(500).json({ error: "No fue posible obtener la configuración." });
    }
  });

  app.post("/api/config", async (req, res) => {
    try {
      const body = req.body || {};
      const allowed = ["correlativo", "he", "margen_mat", "margen_sub", "gg", "imp", "util", "iva"];
      const stmt = db.prepare("INSERT OR REPLACE INTO config (clave, valor) VALUES (?, ?)");

      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(body, key)) stmt.run([key, String(body[key])]);
      });

      stmt.free();
      persistDB();

      const config = getConfigObject();

      await sendToDrive({
        action: "saveJson",
        subfolder: "configuracion",
        filename: "config.json",
        data: config
      });

      await syncFullStateToDrive();

      res.json({ ok: true, config });
    } catch (err) {
      res.status(500).json({ error: "No fue posible guardar la configuración." });
    }
  });

  app.get("/api/siguiente", (req, res) => {
    try {
      res.json({ correlativo: getConfigValue("correlativo", "3100") });
    } catch (err) {
      res.status(500).json({ error: "No fue posible obtener el correlativo." });
    }
  });

  app.get("/api/clientes", (req, res) => {
    try {
      res.json(getClientes());
    } catch (err) {
      res.status(500).json({ error: "No fue posible obtener clientes." });
    }
  });

  app.post("/api/clientes", async (req, res) => {
    try {
      const body = req.body || {};
      const cliente = {
        id: body.id || uid("cli"),
        razon: body.razon || "",
        rut: body.rut || "",
        giro: body.giro || "",
        planta: body.planta || "",
        dir: body.dir || "",
        contacto: body.contacto || "",
        email: body.email || "",
        tel: body.tel || ""
      };

      db.run(`
        INSERT INTO clientes (id, razon, rut, giro, planta, dir, contacto, email, tel)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [cliente.id, cliente.razon, cliente.rut, cliente.giro, cliente.planta, cliente.dir, cliente.contacto, cliente.email, cliente.tel]);

      persistDB();

      await sendToDrive({
        action: "saveJson",
        subfolder: "clientes",
        filename: "clientes.json",
        data: getClientes()
      });

      await syncFullStateToDrive();

      res.json({ ok: true, cliente });
    } catch (err) {
      res.status(500).json({ error: "No fue posible guardar el cliente." });
    }
  });

  app.get("/api/catalogo", (req, res) => {
    try {
      res.json(getCatalogo());
    } catch (err) {
      res.status(500).json({ error: "No fue posible obtener catálogo." });
    }
  });

  app.get("/api/presupuestos", (req, res) => {
    try {
      if (req.query.id) {
        const presupuesto = getPresupuestoById(req.query.id);
        if (!presupuesto) return res.status(404).json({ error: "Presupuesto no encontrado." });
        return res.json(presupuesto);
      }
      res.json(getPresupuestos());
    } catch (err) {
      res.status(500).json({ error: "No fue posible obtener presupuestos." });
    }
  });

  app.post("/api/presupuestos", async (req, res) => {
    try {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];

      if (!body.cliente_id) return res.status(400).json({ error: "Debe seleccionar un cliente." });
      if (!body.desc) return res.status(400).json({ error: "Debe ingresar una descripción." });
      if (!items.length) return res.status(400).json({ error: "Debe ingresar al menos un ítem." });

      const config = getConfigObject();
      const correlativoActual = String(config.correlativo || "3100");
      const totals = calculateTotals(items, config);

      const id = uid("pre");
      const fecha = body.fecha || new Date().toISOString().slice(0, 10);
      const createdAt = nowISO();

      db.run("BEGIN TRANSACTION");

      db.run(`
        INSERT INTO presupuestos
        (
          id, num, [desc], cliente_id, fecha, estado, tipo, validez,
          mo, mat, sub, gg, imp, util, net, iva, tot, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        correlativoActual,
        body.desc || "",
        body.cliente_id || "",
        fecha,
        body.estado || "Emitido",
        body.tipo || "Servicio Técnico",
        body.validez || "15 días",
        totals.mo,
        totals.mat,
        totals.sub,
        totals.gg,
        totals.imp,
        totals.util,
        totals.net,
        totals.iva,
        totals.tot,
        createdAt
      ]);

      const itemStmt = db.prepare(`
        INSERT INTO items (pres_id, orden, [desc], tipo, und, cant, tarifa)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      items.forEach((item, index) => {
        itemStmt.run([
          id,
          index + 1,
          item.desc || "",
          item.tipo || "mo",
          item.und || "GL",
          Number(item.cant || 0),
          Number(item.tarifa || 0)
        ]);
      });

      itemStmt.free();

      const nuevoCorrelativo = String(Number(correlativoActual) + 1);
      db.run("UPDATE config SET valor = ? WHERE clave = 'correlativo'", [nuevoCorrelativo]);

      db.run("COMMIT");
      persistDB();

      const presupuesto = getPresupuestoById(id);
      const htmlPresupuesto = buildPresupuestoHtml(presupuesto, config);

      const driveResults = [];
      driveResults.push(await sendToDrive({
        action: "saveJson",
        subfolder: "presupuestos_json",
        filename: `PRES-${presupuesto.num}.json`,
        data: presupuesto
      }));

      driveResults.push(await sendToDrive({
        action: "saveHtml",
        subfolder: "presupuestos_html",
        filename: `PRES-${presupuesto.num}.html`,
        html: htmlPresupuesto
      }));

      driveResults.push(await sendToDrive({
        action: "appendHistory",
        data: {
          id: presupuesto.id,
          num: presupuesto.num,
          fecha: presupuesto.fecha,
          cliente: presupuesto.cliente_razon,
          desc: presupuesto.desc,
          net: presupuesto.net,
          iva: presupuesto.iva,
          tot: presupuesto.tot,
          created_at: presupuesto.created_at
        }
      }));

      driveResults.push(await sendToDrive({
        action: "saveJson",
        subfolder: "clientes",
        filename: "clientes.json",
        data: getClientes()
      }));

      driveResults.push(await sendToDrive({
        action: "saveJson",
        subfolder: "catalogo",
        filename: "catalogo.json",
        data: getCatalogo()
      }));

      driveResults.push(await sendToDrive({
        action: "saveJson",
        subfolder: "configuracion",
        filename: "config.json",
        data: getConfigObject()
      }));

      driveResults.push(await syncFullStateToDrive());

      res.json({
        ok: true,
        presupuesto,
        siguiente: nuevoCorrelativo,
        drive: driveResults
      });
    } catch (err) {
      try { db.run("ROLLBACK"); } catch {}
      console.error(err);
      res.status(500).json({ error: "No fue posible guardar el presupuesto." });
    }
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`Servidor iniciado en puerto ${PORT}`);
    console.log(`Drive configurado: ${Boolean(DRIVE_WEBHOOK_URL && DRIVE_SECRET_KEY)}`);
    console.log(`Drive URL termina en: ${DRIVE_WEBHOOK_URL ? DRIVE_WEBHOOK_URL.slice(-10) : "sin-url"}`);
  });
}

start().catch((err) => {
  console.error("Error crítico al iniciar:", err);
  process.exit(1);
});
