// =====================================================================
//  Backup diario del Gestor de RRHH.
//   1) Pide todas las tablas a la base (función backup_rrhh, solo lectura,
//      protegida con la clave del archivo de conexión).
//   2) Arma un Excel (una hoja por tabla + LÉEME) con la librería que ya
//      usa la página (js/lib/xlsx.full.min.js).
//   3) Lo guarda en la carpeta de Google Drive para escritorio y borra los
//      de más de BACKUP_DIAS días (30 por defecto).
//   4) Anota cómo salió en la base (Configuración > Backup diario) y en
//      un log de esta PC (junto al archivo de conexión).
//  Lo dispara todos los días la tarea de Windows "Backup RRHH Cindy"
//  (backup/programar-tarea.ps1). También se puede correr a mano:
//    node backup/hacer-backup.cjs [--env <archivo>] [--a-carpeta <carpeta>] [--origen manual]
// =====================================================================
const fs = require("fs");
const path = require("path");
const { arg, cargarEnv, env, exigir, rpc } = require("./comun.cjs");
const XLSX = require(path.join(__dirname, "..", "js", "lib", "xlsx.full.min.js"));

const CARPETA_POR_DEFECTO = "G:\\Mi unidad\\Backups RRHH";
const PREFIJO = "backup-rrhh-cindy-";
const ORDEN = ["empleados", "novedades", "vacaciones_liquidaciones", "vacaciones_ajustes", "tipos_novedad", "sucursales", "puestos",
  "feriados", "periodos_sin_vacaciones", "eventos", "puestos_compartidos", "puestos_compartidos_miembros", "perfiles",
  "criterios_evaluacion", "evaluaciones", "backups_registro"];

const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
let archivoLog = "";
function log(texto) {
  const linea = `${new Date().toISOString()} ${texto}`;
  console.log(texto);
  if (!archivoLog) return;
  try {
    const previas = fs.existsSync(archivoLog) ? fs.readFileSync(archivoLog, "utf8").split(/\r?\n/).filter(Boolean).slice(-300) : [];
    fs.writeFileSync(archivoLog, [...previas, linea].join("\r\n") + "\r\n");
  } catch { /* sin log */ }
}

// Una celda de Excel: objetos y listas (jsonb) como texto JSON
const celda = v => v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;

function hoja(filas, primeras = []) {
  const columnas = [...new Set([...primeras, ...filas.flatMap(f => Object.keys(f))])];
  const datos = [columnas, ...filas.map(f => columnas.map(c => celda(f[c])))];
  const h = XLSX.utils.aoa_to_sheet(datos);
  h["!cols"] = columnas.map(c => ({ wch: Math.min(40, Math.max(10, c.length + 2)) }));
  if (columnas.length) h["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: datos.length - 1, c: columnas.length - 1 } }) };
  return h;
}

function armarLibro(datos, ahora) {
  const t = datos.tablas || {};
  const libro = XLSX.utils.book_new();
  // Novedades legibles: con el nombre del empleado y del tipo adelante
  const emp = new Map((t.empleados || []).map(e => [e.id, `${e.apellido || ""}, ${e.nombre || ""}`.trim()]));
  const tipo = new Map((t.tipos_novedad || []).map(x => [x.clave, x.nombre]));
  if (t.novedades) t.novedades = t.novedades
    .map(n => ({ empleado: emp.get(n.empleado_id) || "", tipo_nombre: tipo.get(n.tipo) || n.tipo, ...n }))
    .sort((a, b) => String(a.fecha_desde).localeCompare(String(b.fecha_desde)) || a.id - b.id);
  if (t.empleados) t.empleados.sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`));

  const nombres = [...ORDEN.filter(n => t[n]), ...Object.keys(t).filter(n => !ORDEN.includes(n))];
  const leeme = [
    ["Backup del Gestor de RRHH (Cindy Mayorista)"],
    ["Generado", ahora.toLocaleString("es-AR")],
    ["Base", env("SUPABASE_URL")],
    [""],
    ["Hoja", "Filas"],
    ...nombres.map(n => [n, t[n].length]),
    [""],
    ["Cada hoja es una tabla completa de la base, con todas sus columnas, tal como estaba al hacer el backup."],
    ["En novedades se agregaron adelante las columnas empleado y tipo_nombre para leerla más fácil."],
    ["Contiene datos personales: no compartir esta carpeta."],
  ];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(leeme), "LÉEME");
  for (const n of nombres) XLSX.utils.book_append_sheet(libro, hoja(t[n], n === "novedades" ? ["empleado", "tipo_nombre"] : []), n.slice(0, 31));
  return libro;
}

async function principal() {
  const archivoEnv = cargarEnv();
  archivoLog = path.join(path.dirname(archivoEnv), "backup-rrhh.log");
  const carpeta = arg("--a-carpeta", CARPETA_POR_DEFECTO);
  const origen = arg("--origen", env("BACKUP_ORIGEN") || "programado");
  const ahora = new Date();
  const nombre = `${PREFIJO}${fechaLocal(ahora)}.xlsx`;
  try {
    // Si Google Drive para escritorio no está abierto, no existe la unidad: mejor avisar que guardar en otro lado
    const raiz = path.parse(path.resolve(carpeta)).root;
    if (!fs.existsSync(raiz) || !fs.existsSync(path.dirname(path.resolve(carpeta)))) throw new Error(`No existe ${path.dirname(path.resolve(carpeta))}: ¿está abierto Google Drive para escritorio?`);

    const datos = await rpc("backup_rrhh", { p_clave: exigir("BACKUP_CLAVE") });
    const t = (datos && datos.tablas) || {};
    if (!(t.empleados || []).length) throw new Error("La base no devolvió empleados: no se guarda un backup vacío.");
    const filas = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length]));

    const buffer = XLSX.write(armarLibro(datos, ahora), { type: "buffer", bookType: "xlsx", compression: true });
    fs.mkdirSync(carpeta, { recursive: true });
    const destino = path.join(carpeta, nombre);
    fs.writeFileSync(destino, buffer);

    const dias = Number(env("BACKUP_DIAS")) || 30;
    const limite = fechaLocal(new Date(ahora.getTime() - dias * 86400000));
    let borrados = 0;
    for (const f of fs.readdirSync(carpeta)) {
      const m = f.match(/^backup-rrhh-cindy-(\d{4}-\d{2}-\d{2})\.xlsx$/);
      if (m && m[1] < limite) { fs.unlinkSync(path.join(carpeta, f)); borrados++; }
    }
    log(`OK ${destino} (${(buffer.length / 1024).toFixed(0)} KB; empleados ${filas.empleados}, novedades ${filas.novedades || 0}; borrados ${borrados} de más de ${dias} días)`);
    await rpc("registrar_backup_rrhh", { p_clave: exigir("BACKUP_CLAVE"), p_estado: "ok", p_archivo: nombre, p_filas: filas, p_bytes: buffer.length, p_origen: origen });
  } catch (e) {
    log(`ERROR ${e.message}`);
    try { await rpc("registrar_backup_rrhh", { p_clave: env("BACKUP_CLAVE"), p_estado: "error", p_archivo: nombre, p_error: e.message, p_origen: origen }); } catch { /* sin registro */ }
    process.exitCode = 1;
  }
}

principal();
