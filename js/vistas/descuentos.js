// =====================================================================
//  Vista: Descuentos de sueldo. Todo lo que se descuenta del sueldo, separado
//  por origen: adelantos (plata que se le dio por adelantado) y compras en
//  cuenta corriente (mercadería que compró en la tienda y paga después).
//  Cada movimiento queda pendiente hasta que se marca el mes del sueldo en
//  el que se descontó, como las horas extra.
// =====================================================================
(function (R) {
  const { $, esc, mesActual, mesTexto, fmtFecha, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  const pesos = n => R.calc.fmtPesos(n);
  const claves = () => R.estado.tipos.filter(t => t.descuenta_sueldo).map(t => t.clave);
  const corto = t => ({ adelanto: "Adelantos", compra_cuenta_corriente: "Compras" }[t.clave] || t.nombre);
  const suma = (lista, clave) => lista.filter(n => !clave || n.tipo === clave).reduce((a, n) => a + Number(n.cantidad || 0), 0);
  let pendientes = [];

  async function mostrar() {
    if (!$("desc-mes").value) $("desc-mes").value = mesActual();
    if (!$("desc-liq-mes").value) $("desc-liq-mes").value = mesActual();
    const mes = $("desc-mes").value, tipos = R.estado.tipos.filter(t => t.descuenta_sueldo);
    $("desc-sub").textContent = `${app().textoSucursal()} · adelantos de sueldo y compras en cuenta corriente`;
    $("desc-kpis").innerHTML = R.util.esqueleto.kpis(3);
    $("tabla-desc-empleados").innerHTML = R.util.esqueleto.tabla(4, 5);
    $("tabla-desc-pendientes").innerHTML = R.util.esqueleto.tabla(6, 4);
    $("tabla-desc-mes").innerHTML = R.util.esqueleto.tabla(4, 3);
    let descontadas;
    try {
      [pendientes, descontadas] = await Promise.all([R.api.novedades.descuentosPendientes(claves()), R.api.novedades.descuentosDelMes(claves(), mes + "-01")]);
    } catch (e) { $("desc-kpis").innerHTML = ""; return toast(e.message, "error", 6000); }
    pendientes = pendientes.filter(n => app().esVisible(n.empleado_id));
    descontadas = descontadas.filter(n => app().esVisible(n.empleado_id));
    const porId = new Map(R.estado.empleados.map(e => [e.id, e]));
    const esAdmin = app().esAdmin();

    // ---------- Indicadores ----------
    const desglose = l => tipos.map(t => `${corto(t).toLowerCase()}: ${pesos(suma(l, t.clave))}`).join(" · ");
    const kpi = (et, val, det, ayuda, dest) => `<div class="kpi${dest ? " destacado" : ""}"><div class="etiqueta">${esc(et)}${info(ayuda)}</div><div class="valor">${val}</div><div class="detalle">${det}</div></div>`;
    const personas = new Set(pendientes.map(n => n.empleado_id)).size;
    $("desc-kpis").innerHTML = [
      kpi("Pendiente de descontar", esc(pesos(suma(pendientes))), pendientes.length ? `${esc(desglose(pendientes))} · ${personas} ${personas === 1 ? "persona" : "personas"}` : "nada pendiente",
        "Lo que se le dio o compró a cada empleado y todavía no se descontó de ningún sueldo, de cualquier fecha. Separado entre adelantos (plata adelantada) y compras en cuenta corriente (mercadería).", true),
      kpi(`Descontado en el sueldo de ${mesTexto(mes)}`, esc(pesos(suma(descontadas))), descontadas.length ? esc(desglose(descontadas)) : "nada descontado",
        "Lo que ya se descontó en el sueldo del mes elegido abajo, sin importar en qué fecha se dio o se compró."),
    ].join("");

    // ---------- Pendiente por empleado (lo que hay que descontar en el próximo sueldo) ----------
    const grupos = new Map();
    pendientes.forEach(n => { if (!grupos.has(n.empleado_id)) grupos.set(n.empleado_id, []); grupos.get(n.empleado_id).push(n); });
    const filas = [...grupos.entries()].map(([id, l]) => ({ e: porId.get(id), l })).sort((a, b) => suma(b.l) - suma(a.l));
    $("tabla-desc-empleados").innerHTML = `<thead><tr><th>Empleado</th>${tipos.map(t => `<th class="num">${esc(corto(t))}</th>`).join("")}<th class="num">Total a descontar${info("Suma de todo lo pendiente de ese empleado. Es lo que se descuenta en su próximo sueldo.")}</th></tr></thead>
      <tbody>${filas.map(({ e, l }) => `<tr class="clic" data-empleado="${e ? e.id : ""}"><td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e && e.sucursal_id))}</small></td>
        ${tipos.map(t => `<td class="num${suma(l, t.clave) ? "" : " cero"}">${suma(l, t.clave) ? esc(pesos(suma(l, t.clave))) : "0"}</td>`).join("")}
        <td class="num debe">${esc(pesos(suma(l)))}</td></tr>`).join("") || `<tr><td colspan="${tipos.length + 2}" class="vacio">No hay nada pendiente de descontar.</td></tr>`}</tbody>`;

    // ---------- Movimientos pendientes (se tildan para marcarlos como descontados) ----------
    $("tabla-desc-pendientes").innerHTML = `<thead><tr>${esAdmin ? `<th style="width:34px"><input type="checkbox" id="desc-todas" aria-label="Seleccionar todos"></th>` : ""}
      <th>Fecha</th><th>Empleado</th><th>Origen${info("Adelanto de sueldo: plata que se le dio por adelantado. Compra en cuenta corriente: mercadería que compró en la tienda y paga después.")}</th><th class="num">Monto</th><th>Observación</th></tr></thead>
      <tbody>${pendientes.map(n => { const e = porId.get(n.empleado_id);
        return `<tr data-novedad="${n.id}">${esAdmin ? `<td><input type="checkbox" class="desc-check" value="${n.id}" aria-label="Seleccionar"></td>` : ""}
          <td class="clic" data-editar="${n.id}" style="cursor:pointer">${fmtFecha(n.fecha_desde)}</td>
          <td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e && e.sucursal_id))}</small></td>
          <td>${app().chipTipo(n.tipo)}</td><td class="num">${esc(pesos(n.cantidad))}</td><td style="white-space:pre-line">${esc(n.observacion)}</td></tr>`; }).join("")
        || `<tr><td colspan="6" class="vacio">No hay movimientos pendientes.</td></tr>`}</tbody>`;
    actualizarSeleccion();

    // ---------- Descontado en el sueldo del mes, por empleado ----------
    const gm = new Map();
    descontadas.forEach(n => { if (!gm.has(n.empleado_id)) gm.set(n.empleado_id, []); gm.get(n.empleado_id).push(n); });
    const fm = [...gm.entries()].map(([id, l]) => ({ e: porId.get(id), l })).sort((a, b) => nombreEmpleado(a.e).localeCompare(nombreEmpleado(b.e)));
    $("tabla-desc-mes").innerHTML = `<thead><tr><th>Empleado</th>${tipos.map(t => `<th class="num">${esc(corto(t))}</th>`).join("")}<th class="num">Total</th></tr></thead>
      <tbody>${fm.map(({ e, l }) => `<tr class="clic" data-empleado="${e ? e.id : ""}"><td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e && e.sucursal_id))}</small></td>
        ${tipos.map(t => `<td class="num${suma(l, t.clave) ? "" : " cero"}">${suma(l, t.clave) ? esc(pesos(suma(l, t.clave))) : "0"}</td>`).join("")}
        <td class="num"><strong>${esc(pesos(suma(l)))}</strong></td></tr>`).join("") || `<tr><td colspan="${tipos.length + 2}" class="vacio">No se descontó nada en el sueldo de ${esc(mesTexto(mes))}.</td></tr>`}</tbody>`;
  }

  const seleccionadas = () => [...document.querySelectorAll("#tabla-desc-pendientes .desc-check:checked")].map(c => Number(c.value));

  function actualizarSeleccion() {
    const ids = seleccionadas(), l = pendientes.filter(n => ids.includes(n.id));
    $("desc-liq-btn").disabled = !ids.length;
    $("desc-liq-resumen").textContent = ids.length ? `${ids.length} seleccionados · ${pesos(suma(l))} (${tiposTexto(l)})` : "Tildá lo que se descuenta en ese sueldo.";
  }
  const tiposTexto = l => R.estado.tipos.filter(t => t.descuenta_sueldo).map(t => `${corto(t).toLowerCase()} ${pesos(suma(l, t.clave))}`).join(" · ");

  async function descontar(ev) {
    ev.preventDefault();
    const ids = seleccionadas(), mes = $("desc-liq-mes").value;
    if (!ids.length || !mes) return;
    const l = pendientes.filter(n => ids.includes(n.id));
    if (!await R.util.confirmar(`Se marcan como descontados ${ids.length} ${ids.length === 1 ? "movimiento" : "movimientos"} por ${pesos(suma(l))} en el sueldo de ${mesTexto(mes)}.`, { titulo: "Descontar del sueldo", aceptar: "Descontar" })) return;
    $("desc-liq-btn").disabled = true;
    try {
      await R.api.novedades.liquidar(ids, mes + "-01");
      toast(`Descontado en el sueldo de ${mesTexto(mes)}.`);
      $("desc-mes").value = mes;
      mostrar();
    } catch (e) { toast(e.message, "error", 6000); $("desc-liq-btn").disabled = false; }
  }

  function iniciar() {
    $("desc-mes").addEventListener("change", mostrar);
    $("form-desc-liquidar").addEventListener("submit", descontar);
    $("desc-nueva-compra").addEventListener("click", () => R.vistaNovedades.abrirFormulario({ tipo: "compra_cuenta_corriente" }));
    $("desc-nuevo-adelanto").addEventListener("click", () => R.vistaNovedades.abrirFormulario({ tipo: "adelanto" }));
    $("vista-descuentos").addEventListener("change", e => {
      if (e.target.id === "desc-todas") document.querySelectorAll("#tabla-desc-pendientes .desc-check").forEach(c => { c.checked = e.target.checked; });
      if (e.target.id === "desc-todas" || e.target.classList.contains("desc-check")) actualizarSeleccion();
    });
    $("vista-descuentos").addEventListener("click", e => {
      const ed = e.target.closest("[data-editar]");
      if (ed) return R.vistaNovedades.editar(Number(ed.dataset.editar));
      const f = e.target.closest("[data-empleado]");
      if (f && f.dataset.empleado) R.vistaFicha.abrir(Number(f.dataset.empleado));
    });
  }

  R.vistaDescuentos = { iniciar, mostrar };
})(window.RRHH);
