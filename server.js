const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATABASE_URL = process.env.DATABASE_URL || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const MAX_BODY = 80 * 1024;

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
}) : null;

const allowedSubjects = new Set([
  "Matemática","Lengua y Literatura","Historia","Ciencias","Inglés",
  "Filosofía","Tecnología","Artes","Educación Ciudadana","Otra"
]);
const allowedLevels = new Set(["Educación Básica","Educación Media","Universidad","General"]);
const rateLimits = new Map();

function securityHeaders() {
  return {
    "X-Content-Type-Options":"nosniff",
    "X-Frame-Options":"DENY",
    "Referrer-Policy":"same-origin",
    "Permissions-Policy":"camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  };
}
function json(res,status,data){
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...securityHeaders()});
  res.end(JSON.stringify(data));
}
function cleanText(value,max=1000){
  return String(value ?? "").replace(/\u0000/g,"").replace(/\r\n?/g,"\n").trim().slice(0,max);
}
function adminAuthorized(req){
  if(!ADMIN_KEY) return false;
  const candidate=String(req.headers["x-admin-key"]||"");
  const a=Buffer.from(candidate), b=Buffer.from(ADMIN_KEY);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
function clientKey(req){
  const forwarded=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}
function allowSubmission(req){
  const key=clientKey(req), now=Date.now(), hour=3600000;
  const recent=(rateLimits.get(key)||[]).filter(t=>now-t<hour);
  if(recent.length>=5) return false;
  recent.push(now); rateLimits.set(key,recent); return true;
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    let size=0; const chunks=[];
    req.on("data",chunk=>{
      size+=chunk.length;
      if(size>MAX_BODY){ reject(new Error("PAYLOAD_TOO_LARGE")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end",()=>{
      try{ const raw=Buffer.concat(chunks).toString("utf8"); resolve(raw?JSON.parse(raw):{}); }
      catch{ reject(new Error("INVALID_JSON")); }
    });
    req.on("error",reject);
  });
}
async function initDb(){
  if(!pool){ console.warn("DATABASE_URL no configurada. La web cargará, pero la biblioteca estará deshabilitada."); return; }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS summaries (
      id UUID PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      subject VARCHAR(50) NOT NULL,
      level VARCHAR(50) NOT NULL,
      topic VARCHAR(100) NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '',
      author_alias VARCHAR(40) NOT NULL DEFAULT 'Anónimo',
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      views INTEGER NOT NULL DEFAULT 0,
      reports INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_status_created ON summaries(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_summaries_subject_level ON summaries(subject,level);
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY,
      summary_id UUID NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
      reason VARCHAR(300) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reports_summary ON reports(summary_id,created_at DESC);
  `);
}
function requireDb(res){
  if(!pool){ json(res,503,{error:"La base de datos no está configurada todavía."}); return false; }
  return true;
}

async function api(req,res,url){
  if(req.method==="GET" && url.pathname==="/api/health"){
    let database=false;
    if(pool){ try{ await pool.query("SELECT 1"); database=true; }catch{} }
    return json(res,200,{ok:true,database,moderation:true});
  }
  if(!requireDb(res)) return;

  if(req.method==="GET" && url.pathname==="/api/summaries"){
    const q=cleanText(url.searchParams.get("q"),80);
    const subject=cleanText(url.searchParams.get("subject"),50);
    const level=cleanText(url.searchParams.get("level"),50);
    const sort=url.searchParams.get("sort")==="oldest"?"ASC":"DESC";
    const params=[]; const where=["status='approved'"];
    if(q){
      params.push(`%${q}%`);
      where.push(`(title ILIKE $${params.length} OR topic ILIKE $${params.length} OR content ILIKE $${params.length} OR author_alias ILIKE $${params.length})`);
    }
    if(subject && subject!=="Todas"){ params.push(subject); where.push(`subject=$${params.length}`); }
    if(level && level!=="Todos"){ params.push(level); where.push(`level=$${params.length}`); }
    const result=await pool.query(
      `SELECT id,title,subject,level,topic,content,sources,author_alias,created_at,approved_at,views
       FROM summaries WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(approved_at,created_at) ${sort} LIMIT 100`, params);
    return json(res,200,{items:result.rows});
  }

  const detail=url.pathname.match(/^\/api\/summaries\/([0-9a-f-]{36})$/i);
  if(req.method==="GET" && detail){
    const result=await pool.query(
      `UPDATE summaries SET views=views+1
       WHERE id=$1 AND status='approved'
       RETURNING id,title,subject,level,topic,content,sources,author_alias,created_at,approved_at,views`,
      [detail[1]]);
    if(!result.rowCount) return json(res,404,{error:"Resumen no encontrado."});
    return json(res,200,{item:result.rows[0]});
  }

  if(req.method==="POST" && url.pathname==="/api/summaries"){
    if(!allowSubmission(req)) return json(res,429,{error:"Has enviado varios resúmenes recientemente. Intenta nuevamente más tarde."});
    const body=await parseBody(req);
    const title=cleanText(body.title,120), subject=cleanText(body.subject,50),
      level=cleanText(body.level,50), topic=cleanText(body.topic,100),
      content=cleanText(body.content,12000), sources=cleanText(body.sources,1200),
      alias=cleanText(body.authorAlias,40)||"Anónimo";
    if(title.length<5) return json(res,400,{error:"El título debe tener al menos 5 caracteres."});
    if(!allowedSubjects.has(subject)) return json(res,400,{error:"Selecciona una asignatura válida."});
    if(!allowedLevels.has(level)) return json(res,400,{error:"Selecciona un nivel válido."});
    if(content.length<120) return json(res,400,{error:"El resumen debe tener al menos 120 caracteres."});
    if(body.acceptedRules!==true) return json(res,400,{error:"Debes aceptar las reglas de publicación."});
    const id=crypto.randomUUID();
    await pool.query(
      `INSERT INTO summaries (id,title,subject,level,topic,content,sources,author_alias,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
      [id,title,subject,level,topic,content,sources,alias]);
    return json(res,201,{ok:true,id,message:"Tu resumen fue enviado y quedó pendiente de revisión."});
  }

  const report=url.pathname.match(/^\/api\/summaries\/([0-9a-f-]{36})\/report$/i);
  if(req.method==="POST" && report){
    const body=await parseBody(req), reason=cleanText(body.reason,300), id=report[1];
    if(reason.length<8) return json(res,400,{error:"Describe brevemente el motivo del reporte."});
    const exists=await pool.query("SELECT 1 FROM summaries WHERE id=$1 AND status='approved'",[id]);
    if(!exists.rowCount) return json(res,404,{error:"Resumen no encontrado."});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("INSERT INTO reports (id,summary_id,reason) VALUES ($1,$2,$3)",[crypto.randomUUID(),id,reason]);
      await client.query("UPDATE summaries SET reports=reports+1 WHERE id=$1",[id]);
      await client.query("COMMIT");
    }catch(err){ await client.query("ROLLBACK"); throw err; }
    finally{ client.release(); }
    return json(res,201,{ok:true});
  }

  if(url.pathname.startsWith("/api/admin/")){
    if(!adminAuthorized(req)) return json(res,401,{error:"Clave de administración incorrecta."});

    if(req.method==="GET" && url.pathname==="/api/admin/pending"){
      const result=await pool.query(
        `SELECT id,title,subject,level,topic,content,sources,author_alias,created_at,reports
         FROM summaries WHERE status='pending' ORDER BY created_at ASC LIMIT 100`);
      return json(res,200,{items:result.rows});
    }
    if(req.method==="GET" && url.pathname==="/api/admin/reported"){
      const result=await pool.query(
        `SELECT s.id,s.title,s.subject,s.level,s.author_alias,s.reports,
                MAX(r.created_at) AS last_report,
                ARRAY_AGG(r.reason ORDER BY r.created_at DESC) AS reasons
         FROM summaries s JOIN reports r ON r.summary_id=s.id
         WHERE s.status='approved' GROUP BY s.id
         ORDER BY s.reports DESC,last_report DESC LIMIT 100`);
      return json(res,200,{items:result.rows});
    }
    const action=url.pathname.match(/^\/api\/admin\/([0-9a-f-]{36})\/(approve|reject|remove)$/i);
    if(req.method==="POST" && action){
      const [,id,kind]=action;
      if(kind==="approve"){
        const r=await pool.query("UPDATE summaries SET status='approved',approved_at=NOW() WHERE id=$1 AND status='pending' RETURNING id",[id]);
        if(!r.rowCount) return json(res,404,{error:"Resumen pendiente no encontrado."});
      }else if(kind==="reject"){
        const r=await pool.query("UPDATE summaries SET status='rejected' WHERE id=$1 AND status='pending' RETURNING id",[id]);
        if(!r.rowCount) return json(res,404,{error:"Resumen pendiente no encontrado."});
      }else{
        const r=await pool.query("DELETE FROM summaries WHERE id=$1 RETURNING id",[id]);
        if(!r.rowCount) return json(res,404,{error:"Resumen no encontrado."});
      }
      return json(res,200,{ok:true});
    }
  }
  return json(res,404,{error:"Ruta no encontrada."});
}

function serveStatic(req,res,url){
  let requested=decodeURIComponent(url.pathname);
  if(requested==="/") requested="/index.html";
  const filePath=path.resolve(PUBLIC_DIR,"."+requested);
  if(!filePath.startsWith(PUBLIC_DIR)){ res.writeHead(403,securityHeaders()); return res.end("Forbidden"); }
  fs.stat(filePath,(err,stat)=>{
    if(err||!stat.isFile()){ res.writeHead(404,securityHeaders()); return res.end("Not found"); }
    const ext=path.extname(filePath).toLowerCase();
    const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8"}[ext]||"application/octet-stream";
    res.writeHead(200,{"Content-Type":mime,"Cache-Control":ext===".html"?"no-cache":"public, max-age=3600",...securityHeaders()});
    fs.createReadStream(filePath).pipe(res);
  });
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    if(url.pathname.startsWith("/api/")) await api(req,res,url);
    else serveStatic(req,res,url);
  }catch(err){
    console.error(err);
    if(!res.headersSent) json(res,err.message==="PAYLOAD_TOO_LARGE"?413:500,{error:err.message==="PAYLOAD_TOO_LARGE"?"El contenido enviado es demasiado grande.":"Ocurrió un error interno."});
  }
});

initDb().then(()=>{
  server.listen(PORT,"0.0.0.0",()=>console.log(`Resumenoteca escuchando en puerto ${PORT}`));
}).catch(err=>{
  console.error("No se pudo inicializar la base de datos:",err);
  process.exit(1);
});

process.on("SIGTERM",async()=>{
  server.close(async()=>{ if(pool) await pool.end(); process.exit(0); });
});