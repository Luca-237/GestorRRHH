// =====================================================================
//  Vista: Horas extra. Las pendientes de liquidar (de cualquier fecha) se
//  tildan y se marcan como liquidadas en el sueldo de un mes, como en la
//  planilla anterior. Abajo, lo liquidado en cada mes por empleado.
// =====================================================================
(function (R) {
  const { $, esc, mesActual, mesTexto, fmtFecha, fmtNum, nombreEmpleado, toast } = R.util;
  const app = () => R.app;
  let pendientes = [];

  const horas = n => R.calc.fmtHoras(n);
  const suma = (lista, rec) => R.calc.sumarHoras(lista.filter(n => rec == null || Number(n.recargo) === rec));
  let revision = new Map();   // id -> motivos para revisar
  const marca = id => revision.has(id) ? `<span class="marca-revisar" tabindex="0" data-info="${esc(revision.get(id).join(" "))}">Revisar</span>` : "";

  async function mostrar() {
    if (!$("he-mes").value) $("he-mes").value = mesActual();
    if (!$("he-liq-mes").value) $("he-liq-mes").value = mesActual();
    const mes = $("he-mes").value;
    $("he-sub").textContent = `${app().textoSucursal()} · 50%: días comunes · 100%: sábados desde las 13, domingos y feriados`;
    $("he-kpis").innerHTML = R.util.esqueleto.kpis(3);
    $("tabla-he-pendientes").innerHTML = R.util.esqueleto.tabla(7, 5);
    $("tabla-he-liquidadas").innerHTML = R.util.esqueleto.tabla(5, 4);
    let liquidadas, todas;
    try {
      [pendientes, liquidadas, todas] = await Promise.all([R.api.novedades.horasExtraPendientes(), R.api.novedades.horasExtraLiquidadas(mes + "-01"), R.api.novedades.deTipos(["horas_extra"])]);
    } catch (e) { $("he-kpis").innerHTML = ""; return toast(e.message, "error", 6000); }
    pendientes = pendientes.filter(n => app().esVisible(n.empleado_id));
    liquidadas = liquidadas.filter(n => app().esVisible(n.empleado_id));
    revision = R.calc.revisarHorasExtra(todas.filter(n => app().esVisible(n.empleado_id)), R.estado.feriados);
    const paraRevisar = pendientes.filter(n => revision.has(n.id));

    const personas = l => new Set(l.map(n => n.empleado_id)).size;
    const kpi = (et, val, det, ayuda, dest) => `<div class="kpi${dest ? " destacado" : ""}"><div class="etiqueta">${esc(et)}${R.util.info(ayuda)}</div><div class="valor">${val}</div><div class="detalle">${det}</div></div>`;
    $("he-kpis").innerHTML = [
      kpi("Pendientes de liquidar", esc(horas(suma(pendientes))),
        pendientes.length ? `50%: ${horas(suma(pendientes, 50))} · 100%: ${horas(suma(pendientes, 100))} · ${personas(pendientes)} ${personas(pendientes) === 1 ? "persona" : "personas"}` : "nada pendiente",
        "Horas extra cargadas que todavía no se pagaron en ningún recibo.", true),
      kpi(`Liquidadas en el sueldo de ${mesTexto(mes)}`, esc(horas(suma(liquidadas))),
        liquidadas.length ? `50%: ${horas(suma(liquidadas, 50))} · 100%: ${horas(suma(liquidadas, 100))}` : "ninguna",
        "Horas extra que se pagaron en el sueldo del mes elegido abajo (sin importar en qué fecha se trabajaron)."),
      kpi("Para revisar", fmtNum(paraRevisar.length), paraRevisar.length ? "pendientes que pueden estar repetidas o superpuestas" : "nada raro en las pendientes",
        "Cargas pendientes que parecen repetidas o superpuestas con otras (por ejemplo, un total del mes que incluye días que también están cargados sueltos). Pasá el mouse por \"Revisar\" en la tabla para ver el motivo."),
    ].join("");

    // ---------- Pendientes ----------
    const esAdmin = app().esAdmin();
    const porId = new Map(R.estado.empleados.map(e => [e.id, e]));
    $("tabla-he-pendientes").innerHTML = `<thead><tr>${esAdmin ? `<th style="width:34px"><input type="checkbox" id="he-todas" aria-label="Seleccionar todas"></th>` : ""}
      <th>Fecha</th><th>Empleado</th><th class="num">Desde</th><th class="num">Horas</th><th class="num">Recargo</th><th>Observación</th></tr></thead>
      <tbody>${pendientes.map(n => {
        const e = porId.get(n.empleado_id);
        return `<tr data-novedad="${n.id}">
          ${esAdmin ? `<td><input type="checkbox" class="he-check" value="${n.id}" aria-label="Seleccionar"></td>` : ""}
          <td class="clic" data-editar="${n.id}" style="cursor:pointer">${fmtFecha(n.fecha_desde)}</td>
          <td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e && e.sucursal_id))}</small></td>
          <td class="num">${n.hora ? n.hora.slice(0, 5) : "—"}</td>
          <td class="num">${esc(horas(R.calc.enHoras(n.cantidad)))}${marca(n.id)}</td>
          <td class="num">${n.recargo ? n.recargo + "%" : "—"}</td>
          <td style="white-space:pre-line">${esc(n.observacion)}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="7" class="vacio">No hay horas extra pendientes de liquidar.</td></tr>`}</tbody>`;
    actualizarSeleccion();

    // ---------- Liquidadas en el mes, por empleado ----------
    const grupos = new Map();
    liquidadas.forEach(n => { if (!grupos.has(n.empleado_id)) grupos.set(n.empleado_id, []); grupos.get(n.empleado_id).push(n); });
    const filas = [...grupos.entries()].map(([id, l]) => ({ e: porId.get(id), l })).sort((a, b) => nombreEmpleado(a.e).localeCompare(nombreEmpleado(b.e)));
    $("tabla-he-liquidadas").innerHTML = `<thead><tr><th>Empleado</th><th class="num">Al 50%</th><th class="num">Al 100%</th><th class="num">Total</th><th>Detalle</th></tr></thead>
      <tbody>${filas.map(({ e, l }) => `<tr class="clic" data-empleado="${e ? e.id : ""}">
        <td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e && e.sucursal_id))}</small></td>
        <td class="num">${horas(suma(l, 50))}</td><td class="num">${horas(suma(l, 100))}</td><td class="num"><strong>${horas(suma(l))}</strong></td>
        <td><small>${l.map(n => `${fmtFecha(n.fecha_desde)}: ${horas(R.calc.enHoras(n.cantidad))} al ${n.recargo}%`).join(" · ")}</small>${l.some(n => revision.has(n.id)) ? `<span class="marca-revisar" tabindex="0" data-info="${esc(l.filter(n => revision.has(n.id)).map(n => fmtFecha(n.fecha_desde) + ": " + revision.get(n.id).join(" ")).join(" · "))}">Revisar</span>` : ""}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="vacio">No se liquidaron horas extra en el sueldo de ${mesTexto(mes)}.</td></tr>`}</tbody>`;
  }

  function seleccionadas() { return [...document.querySelectorAll("#tabla-he-pendientes .he-check:checked")].map(c => Number(c.value)); }

  function actualizarSeleccion() {
    const ids = seleccionadas(), l = pendientes.filter(n => ids.includes(n.id));
    $("he-liq-btn").disabled = !ids.length;
    $("he-liq-resumen").textContent = ids.length ? `${ids.length} seleccionadas · ${horas(suma(l))} (50%: ${horas(suma(l, 50))} · 100%: ${horas(suma(l, 100))})` : "Tildá las horas que entran en ese sueldo.";
  }

  async function liquidar(ev) {
    ev.preventDefault();
    const ids = seleccionadas(), mes = $("he-liq-mes").value;
    if (!ids.length || !mes) return;
    if (!await R.util.confirmar(`¿Marcar ${ids.length} ${ids.length === 1 ? "registro" : "registros"} de horas extra como liquidados en el sueldo de ${mesTexto(mes)}?`)) return;
    $("he-liq-btn").disabled = true;
    try {
      await R.api.novedades.liquidar(ids, mes + "-01");
      toast(`Liquidadas en ${mesTexto(mes)}.`);
      $("he-mes").value = mes;
      mostrar();
    } catch (e) { toast(e.message, "error", 6000); $("he-liq-btn").disabled = false; }
  }

  function iniciar() {
    $("he-mes").addEventListener("change", mostrar);
    $("he-nueva").addEventListener("click", () => R.vistaNovedades.abrirFormulario({ tipo: "horas_extra" }));
    $("form-he-liquidar").addEventListener("submit", liquidar);
    $("vista-horas-extra").addEventListener("change", e => {
      if (e.target.id === "he-todas") document.querySelectorAll("#tabla-he-pendientes .he-check").forEach(c => { c.checked = e.target.checked; });
      if (e.target.id === "he-todas" || e.target.classList.contains("he-check")) actualizarSeleccion();
    });
    $("vista-horas-extra").addEventListener("click", e => {
      const ed = e.target.closest("[data-editar]");
      if (ed) return R.vistaNovedades.editar(Number(ed.dataset.editar));
      const f = e.target.closest("[data-empleado]");
      if (f && f.dataset.empleado) R.vistaFicha.abrir(Number(f.dataset.empleado));
    });
  }

  R.vistaHorasExtra = { iniciar, mostrar };
})(window.RRHH);
