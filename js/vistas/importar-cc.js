// =====================================================================
//  Importar la planilla de saldos de cuenta corriente (reporte del sistema
//  de gestión, siempre con el mismo formato). Por cada empleado con saldo se
//  deja UNA compra en cuenta corriente por el saldo actual, pendiente de
//  descontar: reemplaza las compras pendientes que ya tuviera, para no
//  duplicar. Quien no es empleado no se carga. Solo admin.
//  Se empareja por número de cliente; la primera vez, por nombre (y se
//  guarda el número). Lo dudoso se elige a mano antes de cargar.
//  La librería que lee .xls se baja recién cuando se elige un archivo.
// =====================================================================
(function (R) {
  const { $, esc, hoy, fmtFecha, nombreEmpleado, toast } = R.util;
  const app = () => R.app;
  const pesos = n => R.calc.fmtPesos(n);
  const TIPO = "compra_cuenta_corriente";
  let filas = [], pendientes = new Map(), fecha = "", total = null;

  let libreria = null;
  const cargarLibreria = () => libreria || (libreria = new Promise((ok, mal) => {
    if (window.XLSX) return ok();
    const s = document.createElement("script");
    s.src = "js/lib/xlsx.full.min.js?v=0.18.5";
    s.onload = ok;
    s.onerror = () => { libreria = null; mal(new Error("No se pudo cargar el lector de planillas. Revisá la conexión.")); };
    document.head.appendChild(s);
  }));

  // Decisión de cada fila a partir del emparejamiento y de lo que ya hay cargado
  function evaluar() {
    const usados = new Set();
    filas.forEach(f => {
      const e = f.elegido ? app().empleado(f.elegido) : null;
      f.e = e; f.viejas = e ? (pendientes.get(e.id) || []) : [];
      if (!e) f.accion = { tipo: "no", texto: f.via === "dudoso" ? "Elegí a quién corresponde (si no, no se carga)" : "No es empleado: no se carga" };
      else if (!e.activo) f.accion = { tipo: "no", texto: "Empleado dado de baja: no se carga" };
      else if (usados.has(e.id)) f.accion = { tipo: "no", texto: "Ya hay otra fila de este empleado: no se carga" };
      else if (!(f.saldo > 0)) f.accion = { tipo: "no", texto: f.viejas.length ? `Saldo en cero: no se toca (tiene ${pesos(f.viejas.reduce((a, n) => a + Number(n.cantidad), 0))} pendiente)` : "Sin saldo: nada que cargar" };
      else f.accion = { tipo: "si", texto: f.viejas.length ? `Reemplaza ${f.viejas.length} ${f.viejas.length === 1 ? "compra pendiente" : "compras pendientes"} (${pesos(f.viejas.reduce((a, n) => a + Number(n.cantidad), 0))})` : "Crea la compra" };
      if (e && f.accion.tipo === "si") usados.add(e.id);
    });
  }

  function pintar() {
    evaluar();
    const hacer = filas.filter(f => f.accion.tipo === "si");
    const suma = hacer.reduce((a, f) => a + f.saldo, 0);
    const reemplazadas = hacer.reduce((a, f) => a + f.viejas.length, 0);
    const sinEmp = filas.filter(f => !f.e).length;
    const aviso = total != null && Math.abs(filas.reduce((a, f) => a + f.saldo, 0) - total) > 0.01
      ? `<p class="mensaje-error" role="alert">La suma de las filas (${esc(pesos(filas.reduce((a, f) => a + f.saldo, 0)))}) no coincide con el total de la planilla (${esc(pesos(total))}). Revisá el archivo.</p>` : "";
    $("cc-resultado").innerHTML = `${aviso}
      <p class="hint" style="margin:10px 0">${filas.length} filas en la planilla · <strong>${hacer.length}</strong> se cargan por <strong>${esc(pesos(suma))}</strong>${reemplazadas ? ` (reemplazan ${reemplazadas} ${reemplazadas === 1 ? "compra pendiente" : "compras pendientes"})` : ""} · ${sinEmp} sin empleado, no se cargan.</p>
      <div class="tabla-wrap"><table class="tabla grilla"><thead><tr><th>N.º cliente</th><th>En la planilla</th><th>Empleado</th><th class="num">Saldo</th><th>Qué se hace</th></tr></thead>
      <tbody>${filas.map((f, i) => `<tr class="${f.accion.tipo === "no" ? "inactivo" : ""}"><td>${esc(f.codigo)}</td><td>${esc(f.nombre)}</td>
        <td>${f.via === "dudoso" ? `<select data-cc-fila="${i}" aria-label="Empleado de ${esc(f.nombre)}"><option value="">— no cargar —</option>${f.candidatos.map(c => `<option value="${c.id}" ${f.elegido === c.id ? "selected" : ""}>${esc(nombreEmpleado(c))}</option>`).join("")}</select>`
          : f.e ? `${esc(nombreEmpleado(f.e))}${f.via === "nombre" && f.accion.tipo === "si" ? "<small>por nombre: se guarda su N.º de cliente</small>" : ""}` : "—"}</td>
        <td class="num">${esc(pesos(f.saldo))}</td><td>${esc(f.accion.texto)}</td></tr>`).join("")}</tbody></table></div>
      <div class="filtros" style="margin:12px 0 0;justify-content:flex-end">
        <button type="button" class="btn-sec" id="cc-cancelar">Cancelar</button>
        <button type="button" class="btn-sec primario" id="cc-aplicar" ${hacer.length ? "" : "disabled"}>Cargar ${hacer.length} ${hacer.length === 1 ? "saldo" : "saldos"}</button>
      </div>`;
  }

  async function leer(archivo) {
    $("cc-resultado").innerHTML = R.util.esqueleto.tabla(5, 5).replace("<thead>", "<table class=\"tabla grilla\"><thead>").replace("</tbody>", "</tbody></table>");
    try {
      await cargarLibreria();
      const libro = window.XLSX.read(await archivo.arrayBuffer(), { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const lectura = R.calc.leerSaldosCuentaCorriente(window.XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: false }));
      if (!lectura.filas.length) throw new Error("La planilla no tiene filas con saldo.");
      total = lectura.total;
      const [lista, compras] = await Promise.all([Promise.resolve(R.estado.empleados), R.api.novedades.descuentosPendientes([TIPO])]);
      pendientes = new Map();
      compras.forEach(n => { if (!pendientes.has(n.empleado_id)) pendientes.set(n.empleado_id, []); pendientes.get(n.empleado_id).push(n); });
      filas = lectura.filas.map(r => {
        const m = R.calc.emparejarEmpleado(r, lista);
        return { ...r, via: m.via, candidatos: m.candidatos, elegido: m.empleado ? m.empleado.id : null };
      });
      const d = /(\d{2})(\d{2})(\d{4})/.exec(archivo.name);
      if (d && !$("cc-fecha").dataset.tocada) $("cc-fecha").value = `${d[3]}-${d[2]}-${d[1]}`;
      if (!$("cc-fecha").value) $("cc-fecha").value = hoy();
      fecha = $("cc-fecha").value;
      pintar();
    } catch (e) { $("cc-resultado").innerHTML = ""; filas = []; toast(e.message, "error", 7000); }
  }

  async function aplicar() {
    fecha = $("cc-fecha").value;
    if (!fecha) return toast("Elegí la fecha de los saldos.", "error");
    const hacer = filas.filter(f => f.accion.tipo === "si");
    const suma = hacer.reduce((a, f) => a + f.saldo, 0), viejas = hacer.reduce((a, f) => a + f.viejas.length, 0);
    if (!await R.util.confirmar(`Se cargan ${hacer.length} compras en cuenta corriente por ${pesos(suma)}, con saldos al ${fmtFecha(fecha)}.${viejas ? ` Se ${viejas === 1 ? "reemplaza 1 compra pendiente que ya estaba cargada" : "reemplazan " + viejas + " compras pendientes que ya estaban cargadas"} (las que ya se descontaron no se tocan).` : ""} Quedan pendientes de descontar.`,
      { titulo: "Cargar saldos de cuenta corriente", aceptar: "Cargar" })) return;
    $("cc-aplicar").disabled = true;
    let ok = 0; const fallas = [];
    for (const f of hacer) {
      try {
        await R.api.novedades.crear({ empleado_id: f.e.id, tipo: TIPO, fecha_desde: fecha, fecha_hasta: fecha, cantidad: f.saldo,
          observacion: `Saldo de cuenta corriente al ${fmtFecha(fecha)} (planilla, cliente N.º ${f.codigo})` });
        for (const v of f.viejas) await R.api.novedades.eliminar(v.id);
        if (f.e.codigo_cliente !== f.codigo) await R.api.empleados.actualizar(f.e.id, { codigo_cliente: f.codigo });
        ok++;
      } catch (e) { fallas.push(`${nombreEmpleado(f.e)}: ${e.message}`); }
    }
    filas = [];
    await app().recargarEmpleados().catch(() => {});
    $("cc-resultado").innerHTML = fallas.length ? `<p class="mensaje-error" role="alert">No se pudo cargar: ${esc(fallas.join(" · "))}</p>` : "";
    toast(`Se cargaron ${ok} ${ok === 1 ? "saldo" : "saldos"}${fallas.length ? ` y fallaron ${fallas.length}` : ""}.`, fallas.length ? "error" : "ok", fallas.length ? 8000 : 3500);
    $("cc-archivo").value = "";
    R.vistaDescuentos.mostrar();
  }

  function iniciar() {
    $("cc-archivo").addEventListener("change", e => { if (e.target.files[0]) leer(e.target.files[0]); });
    $("cc-fecha").addEventListener("change", e => { e.target.dataset.tocada = "1"; });
    $("cc-resultado").addEventListener("change", e => {
      if (e.target.dataset.ccFila === undefined) return;
      filas[Number(e.target.dataset.ccFila)].elegido = Number(e.target.value) || null;
      pintar();
    });
    $("cc-resultado").addEventListener("click", e => {
      if (e.target.id === "cc-aplicar") aplicar();
      if (e.target.id === "cc-cancelar") { filas = []; $("cc-resultado").innerHTML = ""; $("cc-archivo").value = ""; }
    });
  }

  R.importarCC = { iniciar };
})(window.RRHH);
