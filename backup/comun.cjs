// =====================================================================
//  Lo que comparten los scripts del backup: leer el archivo de conexión
//  (--env, fuera del repo) y llamar a las funciones de la base.
//  Sin dependencias: usa Node 18+ (fetch incorporado).
// =====================================================================
const fs = require("fs");
const path = require("path");

const ENV_POR_DEFECTO = path.join(process.env.USERPROFILE || "", ".claude", "backup-rrhh.env");

function arg(nombre, porDefecto = "") {
  const i = process.argv.indexOf(nombre);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : porDefecto;
}

// Variables desde un archivo CLAVE=valor (así la clave no va en el comando ni en el repo)
function cargarEnv(archivo = arg("--env", ENV_POR_DEFECTO)) {
  if (!fs.existsSync(archivo)) throw new Error(`No existe el archivo de conexión ${archivo}. Correr primero backup/preparar-clave.cjs.`);
  for (const l of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !l.trim().startsWith("#") && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return archivo;
}
const env = k => process.env[k] || "";
const exigir = k => { if (!env(k)) throw new Error(`Falta ${k} en el archivo de conexión`); return env(k); };

// Llama a una función de la base (rpc) con la clave pública; la función controla la clave del backup
async function rpc(funcion, cuerpo) {
  const url = exigir("SUPABASE_URL").replace(/\/+$/, "") + "/rest/v1/rpc/" + funcion;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: exigir("SUPABASE_KEY"), Authorization: "Bearer " + exigir("SUPABASE_KEY") },
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let d; try { d = JSON.parse(texto); } catch { d = null; }
  if (!r.ok) throw new Error(`La base respondió ${r.status}: ${(d && (d.message || d.error)) || texto.slice(0, 200)}`);
  return d;
}

module.exports = { arg, cargarEnv, env, exigir, rpc, ENV_POR_DEFECTO };
