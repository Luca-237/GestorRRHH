// =====================================================================
//  Vista: Evaluaciones de desempeño (1 a 5 por criterio).
// =====================================================================
(function (R) {
  const { $, esc, mesActual, fmtFecha, fmtNum, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  let lista = [];

  function puntos(prom) {
    if (prom == null || isNaN(prom)) return "—";
    const lleno = Math.round(prom);
    return `<span class="puntaje" title="${fmtNum(prom, 2)} de 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lleno ? "lleno" : ""}"></i>`).join("")}</span> ${fmtNum(prom, 1)}`;
  }

  async function mostrar() {
    $("tabla-evaluaciones").innerHTML = `<tbody><tr><td class="cargando">Cargando…</td></tr></tbody>`;
    try { lista = await R.api.evaluaciones.listar(); }
    catch (e) { lista = []; toast(e.message, "error", 6000); }
    const visibles = lista.filter(ev => app().esVisible(ev.empleado_id));
    const criterios = R.estado.criterios;

    // Última de cada empleado activo (incluye a los que nunca se evaluaron)
    const ultima = new Map();
    visibles.forEach(ev => { if (!ultima.has(ev.empleado_id)) ultima.set(ev.empleado_id, ev); });
    const resumen = app().empleadosVisibles().map(e => ({ e, ev: ultima.get(e.id) }))
      .sort((a, b) => (a.ev ? Number(a.ev.promedio) : 9) - (b.ev ? Number(b.ev.promedio) : 9));
    $("tabla-evaluaciones-resumen").innerHTML = `<thead><tr><th>Empleado</th><th>Período${info("Mes evaluado en la última evaluación de cada empleado.")}</th><th>Promedio${info("Promedio de los puntajes de todos los criterios, de 1 (muy por debajo de lo esperado) a 5 (excelente). En rojo, los criterios con 1 o 2.")}</th>${
      criterios.filter(c => c.activo).map(c => `<th class="num" title="${esc(c.nombre)}">${esc(c.nombre.split(" ")[0])}</th>`).join("")}</tr></thead>
      <tbody>${resumen.map(({ e, ev }) => `<tr class="clic" data-empleado="${e.id}">
        <td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e.sucursal_id))}</small></td>
        <td>${ev ? esc(ev.periodo) : `<span class="cero">sin evaluar</span>`}</td>
        <td>${ev ? puntos(Number(ev.promedio)) : "—"}</td>
        ${criterios.filter(c => c.activo).map(c => {
          const p = ev && ev.puntajes ? ev.puntajes[String(c.id)] : null;
          return `<td class="num${p ? (p <= 2 ? " alto" : "") : " cero"}">${p || "—"}</td>`;
        }).join("")}
      </tr>`).join("") || `<tr><td colspan="3" class="vacio">No hay empleados activos.</td></tr>`}</tbody>`;

    $("tabla-evaluaciones").innerHTML = `<thead><tr><th>Fecha${info("Día en que se cargó la evaluación.")}</th><th>Período${info("Mes al que corresponde la evaluación.")}</th><th>Empleado</th><th>Promedio${info("Promedio de los puntajes de todos los criterios, de 1 (muy por debajo de lo esperado) a 5 (excelente). En rojo, los criterios con 1 o 2.")}</th><th>Fortalezas</th><th>A mejorar</th><th></th></tr></thead>
      <tbody>${visibles.map(ev => `<tr>
        <td>${fmtFecha(ev.fecha)}</td><td>${esc(ev.periodo)}</td>
        <td class="clic" data-empleado="${ev.empleado_id}" style="cursor:pointer">${esc(nombreEmpleado(app().empleado(ev.empleado_id)))}</td>
        <td>${puntos(Number(ev.promedio))}</td>
        <td>${esc(ev.fortalezas) || "—"}</td><td>${esc(ev.a_mejorar) || "—"}</td>
        <td>${app().esAdmin() || ev.evaluador === R.estado.perfil.id ? `<button type="button" class="link peligro" data-borrar="${ev.id}">Eliminar</button>` : ""}</td>
      </tr>`).join("") || `<tr><td colspan="7" class="vacio">Todavía no hay evaluaciones.</td></tr>`}</tbody>`;
  }

  function abrirFormulario(empleadoId = null) {
    $("form-evaluacion").reset();
    $("ev-empleado").innerHTML = app().opcionesEmpleados(empleadoId, { vacia: "Elegí un empleado" });
    $("ev-periodo").value = mesActual();
    $("ev-criterios").innerHTML = R.estado.criterios.filter(c => c.activo).map(c => `
      <div class="criterio">
        <div class="nombre">${esc(c.nombre)}</div>${c.descripcion ? `<div class="desc">${esc(c.descripcion)}</div>` : ""}
        <div class="escala" role="radiogroup" aria-label="${esc(c.nombre)}">
          ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="crit-${c.id}" value="${n}" required><span>${n}</span></label>`).join("")}
        </div>
      </div>`).join("") || `<p class="vacio">No hay criterios activos. Un admin los carga en Configuración.</p>`;
    $("evaluacion-error").textContent = "";
    $("dlg-evaluacion").showModal();
  }

  async function guardar(ev) {
    ev.preventDefault();
    $("evaluacion-error").textContent = "";
    const empleado_id = Number($("ev-empleado").value);
    if (!empleado_id) return ($("evaluacion-error").textContent = "Elegí un empleado.");
    const puntajes = {};
    R.estado.criterios.filter(c => c.activo).forEach(c => {
      const sel = document.querySelector(`input[name="crit-${c.id}"]:checked`);
      if (sel) puntajes[String(c.id)] = Number(sel.value);
    });
    if (!Object.keys(puntajes).length) return ($("evaluacion-error").textContent = "Puntuá al menos un criterio.");
    $("ev-guardar").disabled = true;
    try {
      await R.api.evaluaciones.crear({
        empleado_id, periodo: $("ev-periodo").value, puntajes,
        fortalezas: $("ev-fortalezas").value.trim(), a_mejorar: $("ev-mejorar").value.trim(),
      });
      $("dlg-evaluacion").close();
      toast("Evaluación guardada.");
      app().refrescar();
      R.vistaFicha.refrescarSiAbierta();
    } catch (err) { $("evaluacion-error").textContent = err.message; }
    finally { $("ev-guardar").disabled = false; }
  }

  function iniciar() {
    $("nueva-evaluacion").addEventListener("click", () => abrirFormulario());
    $("form-evaluacion").addEventListener("submit", guardar);
    $("vista-evaluaciones").addEventListener("click", async e => {
      const b = e.target.closest("[data-borrar]");
      if (b) {
        if (!confirm("¿Eliminar esta evaluación?")) return;
        try { await R.api.evaluaciones.eliminar(Number(b.dataset.borrar)); toast("Evaluación eliminada."); mostrar(); }
        catch (err) { toast(err.message, "error", 6000); }
        return;
      }
      const f = e.target.closest("[data-empleado]");
      if (f) R.vistaFicha.abrir(Number(f.dataset.empleado));
    });
  }

  R.vistaEvaluaciones = { iniciar, mostrar, abrirFormulario };
})(window.RRHH);
