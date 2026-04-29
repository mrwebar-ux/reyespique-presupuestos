// ════════════════════════════════════════════════════════════════
// Base de datos SQLite — Reyes y Piqué SpA
// ════════════════════════════════════════════════════════════════
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'reyespique.db'));
db.pragma('journal_mode = WAL');

// ── Crear tablas ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id       TEXT PRIMARY KEY,
    razon    TEXT,
    rut      TEXT,
    giro     TEXT,
    planta   TEXT,
    dir      TEXT,
    contacto TEXT,
    email    TEXT,
    tel      TEXT
  );

  CREATE TABLE IF NOT EXISTS catalogo (
    id     TEXT PRIMARY KEY,
    desc   TEXT,
    tipo   TEXT,
    und    TEXT,
    precio REAL
  );

  CREATE TABLE IF NOT EXISTS presupuestos (
    id         TEXT PRIMARY KEY,
    num        TEXT,
    desc       TEXT,
    cliente_id TEXT,
    fecha      TEXT,
    estado     TEXT DEFAULT 'En elaboración',
    tipo       TEXT,
    validez    TEXT DEFAULT '30 días',
    mo         REAL DEFAULT 0,
    mat        REAL DEFAULT 0,
    sub        REAL DEFAULT 0,
    net        REAL DEFAULT 0,
    iva        REAL DEFAULT 0,
    tot        REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    pres_id TEXT,
    orden   INTEGER,
    desc    TEXT,
    tipo    TEXT,
    und     TEXT,
    cant    REAL,
    tarifa  REAL
  );
`);

// ── Seed data (solo si las tablas están vacías) ───────────────
const seedConfig = db.prepare("SELECT COUNT(*) as n FROM config").get();
if (seedConfig.n === 0) {
  const ins = db.prepare("INSERT OR IGNORE INTO config VALUES (?,?)");
  [
    ['nombre','Servicio Técnico Reyes y Piqué SpA'],
    ['rut','76.602.175-1'],
    ['giro','Contratista de molinos de trigo'],
    ['dir','Obispo Vásquez Valencia 3104, Cerrillos, Santiago'],
    ['email','mrwebar@gmail.com'],
    ['tel','+56 9 94577868'],
    ['elaboro','Daniela Gutiérrez'],
    ['cargo','Encargada de Presupuestación'],
    ['firma2','Manuel Reyes Webar — Ing. en Electricidad y Electrónica — Instalador Autorizado SEC Clase A'],
    ['he','34000'],
    ['hee','47905'],
    ['base','143716'],
    ['matPct','45'],
    ['subPct','35'],
    ['ivaPct','19'],
    ['siguiente','3012'],
  ].forEach(([k,v]) => ins.run(k, v));
}

const seedCli = db.prepare("SELECT COUNT(*) as n FROM clientes").get();
if (seedCli.n === 0) {
  const ins = db.prepare("INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)");
  [
    ['c1','Compañía Molinera San Cristóbal S.A.','','Molinería de trigo','Planta Santiago','Planta Santiago, Región Metropolitana','Sr. Williams Moya','',''],
    ['c2','Compañía Molinera San Cristóbal S.A.','','Molinería de trigo','Planta Maipú','Planta Maipú, Región Metropolitana','Sr. Luis Gómez','',''],
    ['c3','Compañía Molinera San Cristóbal S.A.','','Molinería de trigo','Planta Casablanca','Planta Casablanca','Sr. Cristian Mora del Prado','',''],
  ].forEach(r => ins.run(...r));
}

const seedCat = db.prepare("SELECT COUNT(*) as n FROM catalogo").get();
if (seedCat.n === 0) {
  const ins = db.prepare("INSERT INTO catalogo VALUES (?,?,?,?,?)");
  [
    ['k1','Cargo base por atención','mo','GL',143716],
    ['k2','Hora estándar técnico eléctrico (HE)','mo','HE',47905],
    ['k3','Hora emergencia técnico (19:00–08:00)','mo','HE',67500],
    ['k4','Servicio técnico electrónico con repuestos (garantía 3 meses)','mo','GL',295000],
    ['k5','Traslados, fletes y colación','mo','GL',300000],
    ['k6','Cable preensamblado Al 3×70+50mm² NCh 2205','mat','m',4796],
    ['k7','Cable libre halógeno 2.5mm² H07Z1-K','mat','m',950],
    ['k8','Cable control JZ-500 HMH-C 3G1.5mm²','mat','MT',2387],
    ['k9','Cable control 4G1.0mm² JZ-500 HMH Gris','mat','MT',2800],
    ['k10','Interruptor automático MITSUBISHI NF125-CV 3×100A 380V','mat','un.',58433],
    ['k11','Contactor 50A bobina 220V','mat','un.',85000],
    ['k12','Partidor suave AUCOM CSXI045 45kW','mat','un.',856422],
    ['k13','Escalerilla alambre 400×65mm zincada (tira 3m)','mat','tira',28500],
    ['k14','Soporte trapecio para escalerilla (varilla M10)','mat','un.',12500],
    ['k15','Fungibles (amarras, cinta, tornillería, señalética)','mat','GL',50000],
    ['k16','Materiales varios de montaje','mat','GL',300000],
    ['k17','Ingeniero de automatización — configuración lazo control','sub','GL',280000],
    ['k18','Materiales de canalización tubería EMT 20mm','mat','GL',70000],
  ].forEach(r => ins.run(...r));
}

const seedPres = db.prepare("SELECT COUNT(*) as n FROM presupuestos").get();
if (seedPres.n === 0) {
  const ins  = db.prepare("INSERT INTO presupuestos (id,num,desc,cliente_id,fecha,estado,tipo,validez,mo,mat,sub,net,iva,tot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const insI = db.prepare("INSERT INTO items (pres_id,orden,desc,tipo,und,cant,tarifa) VALUES (?,?,?,?,?,?,?)");

  const presupuestos = [
    {id:'h1',num:'CMSC-2026-006',desc:'Reemplazo de Canalización Crítica Fuerza/Control — Planta Maipú',cli:'c2',fecha:'2026-04-22',est:'Emitido',tipo:'Instalación',val:'15 días',mo:612000,mat:429100,sub:0,net:1353430,iva:257151,tot:1610581,items:[]},
    {id:'h2',num:'CMSC-2026-005',desc:'Sistema de Partida Suave Motor Trifásico 37 kW — Planta Maipú',cli:'c2',fecha:'2026-04-22',est:'Emitido',tipo:'Instalación',val:'15 días',mo:1020000,mat:2732610,sub:0,net:4615710,iva:876985,tot:5492695,items:[]},
    {id:'h3',num:'CMSC-2026-004',desc:'Alimentador Principal TDF Silos y Soplante Silos de Trigo',cli:'c1',fecha:'2026-04-22',est:'Emitido',tipo:'Instalación',val:'15 días',mo:1690000,mat:1968001,sub:0,net:4775401,iva:906926,tot:5682327,items:[]},
    {id:'h4',num:'3003',desc:'Instalación Lazo de Control Balanza de Trigo — PLC Roscas',cli:'c1',fecha:'2026-04-16',est:'Emitido',tipo:'Instalación',val:'7 días',mo:383242,mat:238424,sub:378000,net:999665,iva:189937,tot:1189602,items:[
      {o:1,d:'Tendido de tubería desde romana y TDF roscas de trigo',t:'mo',u:'HE',c:3,p:47905},
      {o:2,d:'Conexión eléctrica y pruebas de funcionamiento',t:'mo',u:'HE',c:3,p:47905},
      {o:3,d:'Cargo base',t:'mo',u:'GL',c:1,p:95810},
      {o:4,d:'Materiales de canalización tubería EMT 20mm',t:'mat',u:'GL',c:1,p:70000},
      {o:5,d:'Cable control JZ-500 HMH-C 3G1.5mm²',t:'mat',u:'MT',c:30,p:2387},
      {o:6,d:'Fungibles',t:'mat',u:'GL',c:1,p:35000},
      {o:7,d:'Ingeniero de automatización — configuración lazo de control',t:'sub',u:'GL',c:1,p:280000},
    ]},
    {id:'h5',num:'3001',desc:'Montaje Nuevo Motoreductor en Redler #9 — Silos de Trigo',cli:'c1',fecha:'2026-04-16',est:'Emitido',tipo:'Mantención correctiva',val:'7 días',mo:1293440,mat:507500,sub:0,net:1800940,iva:342179,tot:2143119,items:[
      {o:1,d:'Traslado de nuevo motorreductor a nivel alto silos de trigo',t:'mo',u:'HE',c:4,p:47905},
      {o:2,d:'Desmontaje de cadena con piñón existente en eje motriz de Redler',t:'mo',u:'HE',c:4,p:47905},
      {o:3,d:'Instalación de nueva base para motorreductor',t:'mo',u:'HE',c:4,p:47905},
      {o:4,d:'Instalación omega nivelación de motorreductor',t:'mo',u:'HE',c:4,p:47905},
      {o:5,d:'Conexión eléctrica y pruebas de funcionamiento',t:'mo',u:'HE',c:4,p:47905},
      {o:6,d:'Desmontaje conjunto motor-reductor, traslado a bodega',t:'mo',u:'HE',c:4,p:47905},
      {o:7,d:'Cargo base',t:'mo',u:'GL',c:1,p:143716},
      {o:8,d:'Materiales varios de montaje',t:'mat',u:'GL',c:1,p:300000},
      {o:9,d:'Fungibles',t:'mat',u:'GL',c:1,p:50000},
    ]},
    {id:'h6',num:'3000',desc:'Reparación Partidor Suave CSXi-075 75kW — Planta Santiago',cli:'c1',fecha:'2026-04-13',est:'Emitido',tipo:'Reparación',val:'7 días',mo:295000,mat:0,sub:0,net:295000,iva:56050,tot:351050,items:[
      {o:1,d:'Servicio técnico electrónico, con repuestos. Garantía 03 meses.',t:'mo',u:'GL',c:1,p:295000},
    ]},
    {id:'h7',num:'2971',desc:'Reparación de Emergencia Plansifter #2 — Planta Santiago',cli:'c1',fecha:'2026-03-12',est:'Emitido',tipo:'Reparación',val:'7 días',mo:295000,mat:0,sub:0,net:295000,iva:56050,tot:351050,items:[
      {o:1,d:'Servicio técnico emergencia nocturna — diagnóstico, reparación y puesta en marcha',t:'mo',u:'GL',c:1,p:295000},
    ]},
    {id:'h8',num:'2924',desc:'Reparación de Emergencia Transmisión #5 — 04 personas — Planta Santiago',cli:'c1',fecha:'2026-01-23',est:'Emitido',tipo:'Reparación',val:'7 días',mo:1450000,mat:0,sub:0,net:1450000,iva:275500,tot:1725500,items:[
      {o:1,d:'Servicio técnico emergencia — evaluación, desmontaje, montaje y puesta en marcha',t:'mo',u:'GL',c:1,p:1450000},
    ]},
  ];

  presupuestos.forEach(p => {
    ins.run(p.id,p.num,p.desc,p.cli,p.fecha,p.est,p.tipo,p.val,p.mo,p.mat,p.sub,p.net,p.iva,p.tot);
    p.items.forEach(it => insI.run(p.id,it.o,it.d,it.t,it.u,it.c,it.p));
  });
}

module.exports = db;
