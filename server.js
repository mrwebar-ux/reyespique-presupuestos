const express = require('express');
const path    = require('path');
const fs      = require('fs');
const app     = express();
const PORT    = process.env.PORT || 3000;

const initSqlJs = require('sql.js');
const DATA_DIR  = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const DB_PATH   = path.join(DATA_DIR, 'reyespique.db');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db;

async function initDB() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(Buffer.from(fs.readFileSync(DB_PATH)))
    : new SQL.Database();

  const save = () => fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  const run  = (sql, p=[]) => { db.run(sql, p); save(); };
  const all  = (sql, p=[]) => { const s=db.prepare(sql); s.bind(p); const r=[]; while(s.step()) r.push(s.getAsObject()); s.free(); return r; };
  const get  = (sql, p=[]) => all(sql,p)[0]||null;

  db.run(`CREATE TABLE IF NOT EXISTS config      (clave TEXT PRIMARY KEY, valor TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS clientes    (id TEXT PRIMARY KEY, razon TEXT, rut TEXT, giro TEXT, planta TEXT, dir TEXT, contacto TEXT, email TEXT, tel TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS catalogo    (id TEXT PRIMARY KEY, desc TEXT, tipo TEXT, und TEXT, precio REAL)`);
  db.run(`CREATE TABLE IF NOT EXISTS presupuestos(id TEXT PRIMARY KEY, num TEXT, desc TEXT, cliente_id TEXT, fecha TEXT, estado TEXT, tipo TEXT, validez TEXT, mo REAL, mat REAL, sub REAL, gg REAL, imp REAL, util REAL, net REAL, iva REAL, tot REAL, created_at TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS items       (id INTEGER PRIMARY KEY AUTOINCREMENT, pres_id TEXT, orden INTEGER, desc TEXT, tipo TEXT, und TEXT, cant REAL, tarifa REAL)`);
  save();

  // Datos iniciales
  if (!get("SELECT 1 FROM config WHERE clave='nombre'")) {
    [['nombre','Servicio Técnico Reyes y Piqué SpA'],['rut','76.602.175-1'],['giro','Contratista de molinos de trigo'],
     ['dir','Obispo Vásquez Valencia 3104, Cerrillos, Santiago'],['email','mrwebar@gmail.com'],['tel','+56 9 94577868'],
     ['elaboro','Daniela Gutiérrez'],['cargo','Encargada de Presupuestación'],
     ['firma2','Manuel Reyes Webar — Ing. en Electricidad y Electrónica — Instalador Autorizado SEC Clase A'],
     ['he','34000'],['hee','47905'],['base','143716'],['matPct','45'],['subPct','35'],['ivaPct','19'],
     ['ggPct','12'],['impPct','5'],['utilPct','13'],['siguiente','3100']
    ].forEach(([k,v]) => db.run("INSERT OR IGNORE INTO config VALUES (?,?)",[k,v]));
    save();
  }
  if (!get("SELECT 1 FROM clientes WHERE id='c1'")) {
    [['c1','Compañía Molinera San Cristóbal S.A.','','Molinería de trigo','Planta Santiago','Planta Santiago, Región Metropolitana','Sr. Williams Moya','',''],
     ['c2','Compañía Molinera San Cristóbal S.A.','','Molinería de trigo','Planta Maipú','Planta Maipú, Región Metropolitana','Sr. Luis Gómez','',''],
     ['c3','Compañía Molinera San Cristóbal S.A.','','Molinería de trigo','Planta Casablanca','Planta Casablanca','Sr. Cristian Mora del Prado','','']
    ].forEach(r => db.run("INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)",r));
    save();
  }
  if (!get("SELECT 1 FROM catalogo WHERE id='k1'")) {
    [['k1','Cargo base por atención','mo','HE',143716],['k2','Hora estándar técnico eléctrico (HE)','mo','HE',34000],
     ['k3','Hora emergencia técnico (19:00-08:00)','mo','HE',47905],['k4','Servicio técnico electrónico con repuestos','mo','GL',295000],
     ['k5','Traslados, fletes y colación','mo','GL',300000],['k6','Cable preensamblado Al 3x70+50mm','mat','m',4796],
     ['k7','Cable libre halógeno 2.5mm H07Z1-K','mat','m',950],['k8','Cable control JZ-500 3G1.5mm','mat','m',2387],
     ['k9','Interruptor MITSUBISHI NF125-CV 3x100A','mat','un.',58433],['k10','Contactor 50A bobina 220V','mat','un.',85000],
     ['k11','Partidor suave AUCOM CSXI045 45kW','mat','un.',856422],['k12','Escalerilla alambre 400x65mm (tira 3m)','mat','tira',28500],
     ['k13','Fungibles (amarras, cinta, tornillería)','mat','GL',50000],['k14','Materiales varios de montaje','mat','GL',300000],
     ['k15','Ingeniero automatización — lazo control','sub','GL',280000],['k16','Materiales canalización tubería EMT 20mm','mat','GL',70000]
    ].forEach(r => db.run("INSERT INTO catalogo VALUES (?,?,?,?,?)",r));
    save();
  }

  app.use(express.json({ limit:'50mb' }));
  app.use(express.static(__dirname));

  // CLIENTES
  app.get ('/api/clientes',     (_,res) => res.json(all("SELECT * FROM clientes ORDER BY razon,planta")));
  app.post('/api/clientes',     (req,res) => { const {razon,rut,giro,planta,dir,contacto,email,tel}=req.body; const id='c'+Date.now(); run("INSERT INTO clientes VALUES (?,?,?,?,?,?,?,?,?)",[id,razon,rut||'',giro||'',planta||'',dir||'',contacto||'',email||'',tel||'']); res.json({id,razon,planta}); });
  app.put ('/api/clientes/:id', (req,res) => { const {razon,rut,giro,planta,dir,contacto,email,tel}=req.body; run("UPDATE clientes SET razon=?,rut=?,giro=?,planta=?,dir=?,contacto=?,email=?,tel=? WHERE id=?",[razon,rut||'',giro||'',planta||'',dir||'',contacto||'',email||'',tel||'',req.params.id]); res.json({ok:true}); });
  app.delete('/api/clientes/:id',(_,res,next,id) => { run("DELETE FROM clientes WHERE id=?",[id]); res.json({ok:true}); });
  app.delete('/api/clientes/:id',(req,res) => { run("DELETE FROM clientes WHERE id=?",[req.params.id]); res.json({ok:true}); });

  // CATALOGO
  app.get   ('/api/catalogo',     (_,res) => res.json(all("SELECT * FROM catalogo ORDER BY tipo,desc")));
  app.post  ('/api/catalogo',     (req,res) => { const {desc,tipo,und,precio}=req.body; const id='k'+Date.now(); run("INSERT INTO catalogo VALUES (?,?,?,?,?)",[id,desc,tipo,und,precio||0]); res.json({id,desc,tipo,und,precio}); });
  app.delete('/api/catalogo/:id', (req,res) => { run("DELETE FROM catalogo WHERE id=?",[req.params.id]); res.json({ok:true}); });

  // PRESUPUESTOS
  app.get('/api/presupuestos', (req,res) => {
    const limit=parseInt(req.query.limit)||50, offset=parseInt(req.query.offset)||0;
    const q=req.query.q?'%'+req.query.q+'%':null;
    let sql="SELECT p.*,c.razon,c.planta,c.contacto FROM presupuestos p LEFT JOIN clientes c ON p.cliente_id=c.id";
    const params=[];
    if(q){sql+=" WHERE p.num LIKE ? OR p.desc LIKE ? OR c.razon LIKE ?";params.push(q,q,q);}
    sql+=" ORDER BY p.fecha DESC,CAST(p.num AS INTEGER) DESC LIMIT ? OFFSET ?";
    params.push(limit,offset);
    const rows=all(sql,params);
    const tot=q?get("SELECT COUNT(*) as n FROM presupuestos p LEFT JOIN clientes c ON p.cliente_id=c.id WHERE p.num LIKE ? OR p.desc LIKE ? OR c.razon LIKE ?",[q,q,q]):get("SELECT COUNT(*) as n FROM presupuestos");
    res.json({rows,total:tot?.n||0,limit,offset});
  });
  app.get('/api/presupuestos/:id', (req,res) => {
    const p=get("SELECT * FROM presupuestos WHERE id=?",[req.params.id]);
    if(!p) return res.status(404).json({error:'No encontrado'});
    p.items=all("SELECT * FROM items WHERE pres_id=? ORDER BY orden",[req.params.id]);
    res.json(p);
  });
  app.post('/api/presupuestos', (req,res) => {
    const {desc,cliente_id,fecha,estado,tipo,validez,mo,mat,sub,gg,imp,util,net,iva,tot,items}=req.body;
    const noincrement=req.query.noincrement==='1';
    const cfg=get("SELECT valor FROM config WHERE clave='siguiente'");
    const num=noincrement?(req.body.num||cfg?.valor||'3100'):(cfg?cfg.valor:'3100');
    const id='p'+Date.now()+Math.random().toString(36).slice(2,5);
    run("INSERT INTO presupuestos (id,num,desc,cliente_id,fecha,estado,tipo,validez,mo,mat,sub,gg,imp,util,net,iva,tot,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
      [id,num,desc||'',cliente_id||'',fecha||'',estado||'Emitido',tipo||'',validez||'7 días',mo||0,mat||0,sub||0,gg||0,imp||0,util||0,net||0,iva||0,tot||0]);
    if(items?.length) items.forEach((it,i)=>run("INSERT INTO items(pres_id,orden,desc,tipo,und,cant,tarifa) VALUES(?,?,?,?,?,?,?)",[id,i+1,it.desc,it.tipo,it.und,it.cant,it.tarifa]));
    let siguiente=cfg?cfg.valor:'3100';
    if(!noincrement){siguiente=String(parseInt(num)+1);run("UPDATE config SET valor=? WHERE clave='siguiente'",[siguiente]);}
    res.json({id,num,siguiente});
  });
  app.put('/api/presupuestos/:id', (req,res) => {
    const {desc,cliente_id,fecha,estado,tipo,validez,mo,mat,sub,gg,imp,util,net,iva,tot,items}=req.body;
    run("UPDATE presupuestos SET desc=?,cliente_id=?,fecha=?,estado=?,tipo=?,validez=?,mo=?,mat=?,sub=?,gg=?,imp=?,util=?,net=?,iva=?,tot=? WHERE id=?",
      [desc||'',cliente_id||'',fecha||'',estado||'Emitido',tipo||'',validez||'7 días',mo||0,mat||0,sub||0,gg||0,imp||0,util||0,net||0,iva||0,tot||0,req.params.id]);
    if(items){run("DELETE FROM items WHERE pres_id=?",[req.params.id]);items.forEach((it,i)=>run("INSERT INTO items(pres_id,orden,desc,tipo,und,cant,tarifa) VALUES(?,?,?,?,?,?,?)",[req.params.id,i+1,it.desc,it.tipo,it.und,it.cant,it.tarifa]));}
    res.json({ok:true});
  });
  app.delete('/api/presupuestos',    (_,res) => { run("DELETE FROM items"); run("DELETE FROM presupuestos"); res.json({ok:true}); });
  app.delete('/api/presupuestos/:id',(req,res) => { run("DELETE FROM items WHERE pres_id=?",[req.params.id]); run("DELETE FROM presupuestos WHERE id=?",[req.params.id]); res.json({ok:true}); });

  // CONFIG
  app.get ('/api/config',  (_,res) => { const o={}; all("SELECT * FROM config").forEach(r=>o[r.clave]=r.valor); res.json(o); });
  app.post('/api/config',  (req,res) => { Object.entries(req.body).forEach(([k,v])=>run("INSERT INTO config(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",[k,String(v)])); res.json({ok:true}); });
  app.get ('/api/siguiente',(_,res) => { const r=get("SELECT valor FROM config WHERE clave='siguiente'"); res.json({siguiente:r?r.valor:'3100'}); });

  // STATS
  app.get('/api/stats', (_,res) => {
    const total=get("SELECT COUNT(*) as n FROM presupuestos")?.n||0;
    const mes=get("SELECT COUNT(*) as n FROM presupuestos WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m','now')")?.n||0;
    const neto=get("SELECT COALESCE(SUM(net),0) as s FROM presupuestos WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m','now')")?.s||0;
    const sig=get("SELECT valor FROM config WHERE clave='siguiente'")?.valor||'3100';
    const ultimos=all("SELECT p.*,c.razon,c.planta FROM presupuestos p LEFT JOIN clientes c ON p.cliente_id=c.id ORDER BY p.fecha DESC,CAST(p.num AS INTEGER) DESC LIMIT 10");
    res.json({total,mes,neto,sig,ultimos});
  });

  app.get('*', (req,res) => {
    const f = path.join(__dirname,'index.html');
    if(fs.existsSync(f)) res.sendFile(f);
    else res.status(404).send('index.html no encontrado en '+__dirname);
  });

  app.listen(PORT, () => console.log(`Reyes y Piqué SpA — Puerto ${PORT} — DB: ${DB_PATH}`));
}

initDB().catch(err => { console.error('Error crítico:', err); process.exit(1); });
