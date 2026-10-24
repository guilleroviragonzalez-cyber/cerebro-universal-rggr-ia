// CEREBRO UNIVERSAL RGGR IA — servidor corregido
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = __dirname, ENV_PATH = path.join(ROOT, ".env");
function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, "utf8").replace(/^\uFEFF/, "");
  for (const row of raw.split(/\r?\n/)) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
loadEnvFile();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const MODEL = (process.env.OPENAI_MODEL || "gpt-6-luna").trim();
function keyStatus() {
  if (!API_KEY) return "missing";
  if (/^(rggr|PEGUE_AQUI|SU_CLAVE|clave_completa)/i.test(API_KEY)) return "placeholder";
  return "present";
}
function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, {"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
// Limitador básico para reducir abuso de la API al publicar.
const requestBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;
setInterval(() => { const now = Date.now(); for (const [ip, bucket] of requestBuckets) if (now - bucket.start >= RATE_WINDOW_MS) requestBuckets.delete(ip); }, RATE_WINDOW_MS).unref();

const server = http.createServer(async (req,res) => {
  if (req.method === "POST" && req.url && req.url.startsWith("/api/consultar")) {
    const forwarded = req.headers["x-forwarded-for"];
    const clientIp = (typeof forwarded === "string" && forwarded.split(",")[0].trim()) || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let bucket = requestBuckets.get(clientIp);
    if (!bucket || now - bucket.start >= RATE_WINDOW_MS) { bucket = {start: now, count: 0}; requestBuckets.set(clientIp, bucket); }
    bucket.count += 1;
    if (bucket.count > RATE_MAX) return send(res,429,{error:"Has alcanzado el límite temporal de 10 consultas por minuto. Espera un minuto e inténtalo de nuevo.",code:"LOCAL_RATE_LIMIT"});
  }
  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && u.pathname === "/api/status") {
    return send(res,200,{server:"running",envFileFound:fs.existsSync(ENV_PATH),keyStatus:keyStatus(),model:MODEL,port:PORT});
  }
  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
    const p=path.join(ROOT,"public","index.html");
    return fs.existsSync(p) ? send(res,200,fs.readFileSync(p,"utf8"),"text/html; charset=utf-8") : send(res,500,{error:"Falta public/index.html"});
  }
  if (req.method !== "POST" || u.pathname !== "/api/consultar") return send(res,404,{error:"Ruta no encontrada."});
  if (keyStatus() !== "present") return send(res,400,{error:keyStatus()==="missing"?"No se encontró OPENAI_API_KEY en .env.":"El valor de OPENAI_API_KEY parece un ID o texto de ejemplo, no una clave secreta completa.",code:"API_KEY_LOCAL_CHECK"});
  let raw="";
  req.on("data",c=>{raw+=c;if(raw.length>25000)req.destroy();});
  req.on("end",async()=>{
    let data; try{data=JSON.parse(raw||"{}");}catch{return send(res,400,{error:"Solicitud no válida."});}
    const message=typeof data.message==="string"?data.message.trim():"";
    const area=typeof data.area==="string"?data.area:"General";
    if(!message)return send(res,400,{error:"Escriba una pregunta antes de consultar."});
    if(message.length>8000)return send(res,413,{error:"Reduzca la consulta a menos de 8.000 caracteres."});
    try{
      const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,instructions:"Eres el asistente del proyecto CEREBRO UNIVERSAL RGGR IA. Responde en español, de forma clara, responsable y práctica. Reconoce incertidumbres.",input:`Área: ${area}\n\nSolicitud: ${message}`,max_output_tokens:1200})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        const detail=d?.error?.message || "La API rechazó la solicitud.";
        console.error("Error de API:",r.status,detail);
        let friendly=detail;
        if(r.status===401)friendly="OpenAI rechazó la clave secreta (HTTP 401). Revise que .env contenga la clave secreta completa, no el ID. Guarde .env y reinicie este servidor. La clave nunca se muestra.";
        else if(r.status===403)friendly="La clave fue recibida, pero la cuenta o el proyecto no tiene permiso para esta solicitud.";
        else if(r.status===429)friendly="Límite de uso o cuota de API alcanzado. Revise la facturación y los límites de la plataforma API.";
        return send(res,r.status===401?401:r.status===429?429:502,{error:friendly,code:r.status===401?"API_KEY_REJECTED":r.status===429?"API_QUOTA_OR_RATE_LIMIT":"API_REQUEST_FAILED"});
      }
      let answer=d.output_text||"";
      if(!answer&&Array.isArray(d.output))answer=d.output.flatMap(x=>Array.isArray(x.content)?x.content:[]).filter(x=>x.type==="output_text").map(x=>x.text||"").join("\n");
      return send(res,200,{answer:answer||"La API respondió sin texto legible.",model:MODEL});
    }catch(e){console.error("Fallo de conexión:",e.message);return send(res,502,{error:"No se pudo conectar con la API. Compruebe internet.",code:"NETWORK_ERROR"});}
  });
});
server.on("error",e=>{if(e.code==="EADDRINUSE")console.error(`El puerto ${PORT} ya está ocupado. Detenga el servidor anterior con Ctrl+C antes de iniciar otro.`);else console.error("Error del servidor:",e.message);process.exitCode=1;});
server.listen(PORT,()=>{console.log(`CEREBRO UNIVERSAL RGGR IA disponible en http://localhost:${PORT}`);console.log(`Modelo configurado: ${MODEL}`);console.log(`Archivo .env encontrado: ${fs.existsSync(ENV_PATH)?"sí":"NO"}`);console.log(`Clave configurada (sin mostrarla): ${keyStatus()}`);});
