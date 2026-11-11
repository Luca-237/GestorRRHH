// =====================================================================
//  Prepara la clave del backup (una sola vez, o para cambiarla).
//   1) Genera una clave al azar y la guarda en el archivo de conexión de
//      esta PC (por defecto C:\Users\<usuario>\.claude\backup-rrhh.env),
//      junto con la URL y la clave pública de Supabase (de js/config.js).
//   2) Muestra el SQL para cargar en la base SOLO la huella (sha256) de la
//      clave. Ese SQL se corre en el SQL Editor de Supabase.
//  La clave nunca se muestra en pantalla.
//
//  Uso:  node backup/preparar-clave.cjs [--env <archivo>] [--nueva]
//        --nueva  reemplaza la clave aunque el archivo ya exista
//                 (el SQL deja válida solo la nueva).
// =====================================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { arg, ENV_POR_DEFECTO } = require("./comun.cjs");

const archivo = arg("--env", ENV_POR_DEFECTO);
const config = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8");
const url = (config.match(/supabaseUrl:\s*"([^"]+)"/) || [])[1];
const clavePublica = (config.match(/supabaseKey:\s*"([^"]+)"/) || [])[1];
if (!url || !clavePublica) throw new Error("No encontré supabaseUrl / supabaseKey en js/config.js");

let clave;
if (fs.existsSync(archivo) && !process.argv.includes("--nueva")) {
  const m = fs.readFileSync(archivo, "utf8").match(/^BACKUP_CLAVE=(.+)$/m);
  if (!m) throw new Error(`${archivo} existe pero no tiene BACKUP_CLAVE. Usá --nueva para generarla.`);
  clave = m[1].trim();
  console.log(`Ya existía ${archivo}: se usa esa clave.`);
} else {
  clave = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, [
    "# Conexión del backup diario del Gestor de RRHH. NO compartir ni subir al repo.",
    `SUPABASE_URL=${url}`,
    `SUPABASE_KEY=${clavePublica}`,
    `BACKUP_CLAVE=${clave}`,
    "BACKUP_DIAS=30",
    "",
  ].join("\r\n"));
  console.log(`Clave nueva guardada en ${archivo}.`);
}

const hash = crypto.createHash("sha256").update(clave, "utf8").digest("hex");
const sql = `-- Clave del backup diario del Gestor de RRHH (solo la huella, no la clave)
insert into public.backup_claves (hash) values ('${hash}') on conflict (hash) do nothing;
delete from public.backup_claves where hash <> '${hash}';   -- deja válida solo esta
select count(*) as claves_cargadas from public.backup_claves;`;
console.log("\nCorré este SQL en el SQL Editor de Supabase (después de la migración 20261111300000_backup_diario.sql):\n");
console.log(sql);
if (process.argv.includes("--sql-a")) fs.writeFileSync(arg("--sql-a"), sql);
