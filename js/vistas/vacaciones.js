// =====================================================================
//  Vista: Vacaciones (días que corresponden, tomados, ajustes y saldo
//  de cada empleado para un período).
// =====================================================================
(function (R) {
  const { $, esc, hoy, fmtFecha, fmtNum, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  let ajustes = [];
  let ajusteEmpleado = null;

  function anioElegido() { return Number($("vacaciones-anio").value) || R.calc.anioVacacionesDe(hoy()); }

  async function mostrar() {
    const actual = R.calc.anioVacacionesDe(hoy());
    if (!$("vacaciones-anio").options.length) {
      $("vacaciones-anio").innerHTML = [actual + 1, actual, actual - 1, actual - 2, actual - 3]
        .map(a => `<option value="${a}" ${a === actual ? "selected" : ""}>${a} (oct ${a} – abr ${a + 1})</option>`).join("");
    }
    const anio = anioElegido();
    $("tabla-vacaciones").innerHTML = `<tbody><tr><td class="cargando">Cargando…</td></tr></tbody>`;
    let novedades;
    try { [novedades, ajustes] = await Promise.all([R.api.novedades.deVacaciones(anio), R.api.ajustes.delAnio(anio)]); }
    catch (e) { return toast(e.message, "error", 6000); }

    const tipos = R.estado.tipos;
    const esAdmin = app().esAdmin();
    const filas = app().empleadosVisibles().map(e => {
      const s = R.calc.saldoVacaciones(e, anio, novedades, ajustes, tipos);
      const tomadas = novedades.filter(n => n.empleado_id === e.id).sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde));
      const detalle = tomadas.map(n => `${fmtFecha(n.fecha_desde)} al ${fmtFecha(n.fecha_hasta)} (${fmtNum(n.cantidad)})`).join(" · ");
      const pct = s.corresponden ? Math.min(100, Math.round(s.tomados / (s.corresponden + s.ajuste || 1) * 100)) : 0;
      return `<tr>
        <td class="clic" data-empleado="${e.id}" style="cursor:pointer">${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e.sucursal_id))} · ingreso ${fmtFecha(e.fecha_ingreso)}</small></td>
        <td>${esc(R.calc.antiguedad(e.fecha_ingreso, `${anio}-12-31`))}</td>
        <td class="num">${s.corresponden == null ? `<span title="Falta la fecha de ingreso">—</span>` : s.corresponden}</td>
        <td class="num${s.ajuste ? "" : " cero"}">${s.ajuste ? (s.ajuste > 0 ? "+" : "") + fmtNum(s.ajuste, 1) : "0"}</td>
        <td class="num">${fmtNum(s.tomados, 1)}${s.corresponden ? `<small>${pct}%</small>` : ""}</td>
        <td class="num${s.saldo != null && s.saldo < 0 ? " alto" : ""}"><strong>${s.saldo == null ? "—" : fmtNum(s.saldo, 1)}</strong></td>
        <td><small style="max-width:340px">${esc(detalle) || "—"}</small></td>
        <td>${esAdmin ? `<button type="button" class="link" data-ajuste="${e.id}">Ajuste</button>` : ""}</td>
      </tr>`;
    });
    $("tabla-vacaciones").innerHTML = `<thead><tr><th>Empleado</th><th>Antigüedad al 31/12${info("La ley mide la antigüedad al 31 de diciembre del año del período, no a hoy.")}</th><th class="num">Corresponden${info("Días por antigüedad (LCT art. 150): hasta 5 años, 14; más de 5 hasta 10, 21; más de 10 hasta 20, 28; más de 20, 35. Con menos de 6 meses en el año: 1 día cada 20 trabajados.")}</th><th class="num">Ajustes${info("Días sumados o restados a mano por un admin: arrastres del período anterior, acuerdos o correcciones. Se cargan con el botón Ajuste.")}</th><th class="num">Tomados${info("Días de vacaciones ya cargados para este período. El porcentaje indica cuánto del total disponible ya usó.")}</th><th class="num">Saldo${info("Días que le quedan: corresponden + ajustes − tomados. En rojo si tomó más de lo que le correspondía.")}</th><th>Detalle${info("Fechas de cada vacación tomada en el período y, entre paréntesis, cuántos días fueron.")}</th><th></th></tr></thead>
      <tbody>${filas.join("") || `<tr><td colspan="8" class="vacio">No hay empleados activos.</td></tr>`}</tbody>`;
  }

  // ---------- Ajustes (solo admin) ----------
  function pintarAjustes() {
    const lista = ajustes.filter(a => a.empleado_id === ajusteEmpleado);
    $("aj-lista").innerHTML = lista.length ? `<table class="tabla" style="margin-bottom:8px"><thead><tr><th class="num">Días</th><th>Motivo</th><th></th></tr></thead><tbody>${
      lista.map(a => `<tr><td class="num">${a.dias > 0 ? "+" : ""}${fmtNum(a.dias, 1)}</td><td>${esc(a.motivo)}</td><td><button type="button" class="link peligro" data-borrar-ajuste="${a.id}">Quitar</button></td></tr>`).join("")
    }</tbody></table>` : `<p class="vacio">Sin ajustes en este período.</p>`;
  }

  function abrirAjuste(id) {
    ajusteEmpleado = id;
    $("dlg-ajuste-titulo").textContent = `Ajustes ${anioElegido()} · ${nombreEmpleado(app().empleado(id))}`;
    $("form-ajuste").reset();
    $("ajuste-error").textContent = "";
    pintarAjustes();
    $("dlg-ajuste").showModal();
  }

  async function guardarAjuste(ev) {
    ev.preventDefault();
    $("ajuste-error").textContent = "";
    const dias = Number($("aj-dias").value);
    if (!dias) return ($("ajuste-error").textContent = "Indicá los días (positivo suma, negativo resta).");
    try {
      await R.api.ajustes.crear({ empleado_id: ajusteEmpleado, anio: anioElegido(), dias, motivo: $("aj-motivo").value.trim() });
      ajustes = await R.api.ajustes.delAnio(anioElegido());
      $("form-ajuste").reset();
      pintarAjustes();
      toast("Ajuste guardado.");
      mostrar();
    } catch (err) { $("ajuste-error").textContent = err.message; }
  }

  function iniciar() {
    $("vacaciones-anio").addEventListener("change", mostrar);
    $("tabla-vacaciones").addEventListener("click", e => {
      const aj = e.target.closest("[data-ajuste]");
      if (aj) return abrirAjuste(Number(aj.dataset.ajuste));
      const f = e.target.closest("[data-empleado]");
      if (f) R.vistaFicha.abrir(Number(f.dataset.empleado));
    });
    $("form-ajuste").addEventListener("submit", guardarAjuste);
    $("aj-lista").addEventListener("click", async e => {
      const b = e.target.closest("[data-borrar-ajuste]");
      if (!b || !confirm("¿Quitar este ajuste?")) return;
      try {
        await R.api.ajustes.eliminar(Number(b.dataset.borrarAjuste));
        ajustes = await R.api.ajustes.delAnio(anioElegido());
        pintarAjustes();
        mostrar();
      } catch (err) { $("ajuste-error").textContent = err.message; }
    });
  }

  R.vistaVacaciones = { iniciar, mostrar };
})(window.RRHH);
