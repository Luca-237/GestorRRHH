// =====================================================================
//  Vista: Cuenta de horas. Como una cuenta corriente: los permisos y días
//  pedidos suman horas que el empleado debe; las devoluciones las descuentan.
//  Los movimientos son novedades de los tipos que mueven la cuenta
//  (tipos_novedad.cuenta_horas = 1 o -1).
// =====================================================================
(function (R) {
  const { $, esc, fmtFecha, fmtNum, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  const fmtH = h => R.calc.fmtHoras(h);

  // Tipos que mueven la cuenta
  const tiposCuenta = () => R.estado.tipos.filter(t => Number(t.cuenta_horas));
  const clavesCuenta = () => tiposCuenta().map(t => t.clave);

  // Movimientos de todos los empleados visibles (sin límite de fechas)
  async function cargarMovimientos() {
    const todos = await R.api.novedades.deTipos(clavesCuenta());
    return todos.filter(n => app().esVisible(n.empleado_id));
  }

  // Saldo con signo, para celdas: "7 h" (debe) / "2 h a favor"
  function celdaSaldo(saldo) {
    if (Math.abs(saldo) < 0.005) return `<td class="num cero">0</td>`;
    return saldo > 0 ? `<td class="num debe">${fmtH(saldo)}</td>` : `<td class="num a-favor">${fmtH(saldo)} a favor</td>`;
  }

  async function mostrar() {
    $("horas-sub").textContent = `${app().textoSucursal()} · horas que deben los empleados por permisos o días pedidos`;
    $("horas-kpis").innerHTML = `<p class="cargando">Cargando…</p>`;
    let movs;
    try { movs = await cargarMovimientos(); }
    catch (e) { $("horas-kpis").innerHTML = ""; return toast(e.message, "error", 6000); }

    const tipos = R.estado.tipos;
    const filas = app().empleadosVisibles().map(e => ({ e, c: R.calc.cuentaHoras(e, movs, tipos) }));
    const deben = filas.filter(f => f.c.saldo > 0.005), aFavor = filas.filter(f => f.c.saldo < -0.005);
    const totalDeuda = deben.reduce((s, f) => s + f.c.saldo, 0);
    const totalFavor = aFavor.reduce((s, f) => s - f.c.saldo, 0);

    const kpi = (etiqueta, valor, detalle, ayuda, destacado) => `<div class="kpi${destacado ? " destacado" : ""}"><div class="etiqueta">${esc(etiqueta)}${info(ayuda)}</div>
      <div class="valor">${valor}</div><div class="detalle">${detalle}</div></div>`;
    $("horas-kpis").innerHTML = [
      kpi("Horas adeudadas", esc(fmtH(totalDeuda)), deben.length ? `entre ${deben.length} ${deben.length === 1 ? "empleado" : "empleados"}` : "nadie debe horas",
        "Suma de los saldos de los empleados que deben horas. Es lo que todavía tienen que devolver.", true),
      kpi("Empleados que deben", fmtNum(deben.length), `de ${fmtNum(filas.length)} activos`, "Empleados con saldo positivo en la cuenta de horas."),
      kpi("Horas a favor", esc(fmtH(totalFavor)), aFavor.length ? `de ${aFavor.length} ${aFavor.length === 1 ? "empleado" : "empleados"}` : "nadie tiene horas a favor",
        "Horas que algunos empleados devolvieron de más: se les descuentan de su próximo permiso."),
    ].join("");

    // ---------- Saldo por empleado ----------
    const soloDeben = $("horas-solo-deben").checked;
    const conSucursal = !R.estado.filtroSucursal;
    const lista = filas.filter(f => !soloDeben || Math.abs(f.c.saldo) > 0.005).sort((a, b) => b.c.saldo - a.c.saldo);
    $("tabla-horas").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th class="num">Adeudó${info("Total de horas de permisos y días pedidos a devolver, desde que se usa el sistema. Los días se pasan a horas con la jornada del empleado (8 si no tiene jornada cargada).")}</th>
      <th class="num">Devolvió${info("Total de horas que el empleado ya devolvió trabajando de más.")}</th>
      <th class="num">Saldo${info("Adeudó − Devolvió. Positivo: debe horas. Negativo: tiene horas a favor.")}</th>
      <th>Último movimiento</th></tr></thead>
      <tbody>${lista.map(({ e, c }) => {
        const ult = c.movimientos[c.movimientos.length - 1];
        return `<tr class="clic" data-empleado="${e.id}">
          <td>${esc(nombreEmpleado(e))}<small>${esc(e.puesto || "")}${e.jornada_horas ? ` · jornada ${fmtNum(e.jornada_horas, 1)} h` : ""}</small></td>
          ${conSucursal ? `<td>${esc(app().sucursalNombre(e.sucursal_id))}</td>` : ""}
          <td class="num${c.adeudadas ? "" : " cero"}">${c.adeudadas ? esc(fmtH(c.adeudadas)) : "0"}</td>
          <td class="num${c.devueltas ? "" : " cero"}">${c.devueltas ? esc(fmtH(c.devueltas)) : "0"}</td>
          ${celdaSaldo(c.saldo)}
          <td>${ult ? `${fmtFecha(ult.novedad.fecha_desde)}<small>${esc(app().tipo(ult.novedad.tipo).nombre)}</small>` : "—"}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="6" class="vacio">${soloDeben ? "Nadie debe ni tiene horas a favor." : "No hay empleados activos."}</td></tr>`}</tbody>`;

    // ---------- Movimientos ----------
    const porId = new Map(R.estado.empleados.map(e => [e.id, e]));
    const recientes = [...movs].sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde) || b.id - a.id).slice(0, 200);
    $("tabla-horas-movimientos").innerHTML = `<thead><tr><th>Fecha</th><th>Empleado</th><th>Tipo</th>
      <th class="num">Horas${info("En naranja con +: suma a la deuda. En verde con −: devolución.")}</th><th>Observación</th></tr></thead>
      <tbody>${recientes.map(n => {
        const e = porId.get(n.empleado_id), t = app().tipo(n.tipo);
        const h = R.calc.horasDeNovedad(n, t, e) * Number(t.cuenta_horas);
        const dias = t.unidad === "dias" ? `<small>${fmtNum(n.cantidad)} ${Number(n.cantidad) === 1 ? "día" : "días"} × ${fmtNum(Number(e && e.jornada_horas) || R.calc.JORNADA_POR_DEFECTO, 1)} h</small>` : "";
        return `<tr class="clic" data-novedad="${n.id}">
          <td>${fmtFecha(n.fecha_desde)}${n.fecha_hasta !== n.fecha_desde ? `<small>al ${fmtFecha(n.fecha_hasta)}</small>` : ""}</td>
          <td>${esc(nombreEmpleado(e))}</td>
          <td>${app().chipTipo(n.tipo)}</td>
          <td class="num ${h > 0 ? "debe" : "a-favor"}">${h > 0 ? "+" : "−"}${esc(fmtH(h))}${dias}</td>
          <td>${esc(n.observacion)}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="5" class="vacio">Todavía no hay movimientos. Usá los botones de arriba para registrar el primero.</td></tr>`}</tbody>`;
  }

  // Saldo actual de un empleado (para el aviso del formulario de novedades)
  async function saldoDe(empleadoId) {
    const e = app().empleado(empleadoId);
    if (!e) return null;
    const movs = (await R.api.novedades.deTipos(clavesCuenta())).filter(n => n.empleado_id === empleadoId);
    return R.calc.cuentaHoras(e, movs, R.estado.tipos);
  }

  function iniciar() {
    $("horas-solo-deben").addEventListener("change", mostrar);
    $("horas-deuda").addEventListener("click", () => R.vistaNovedades.abrirFormulario({ tipo: "permiso_horas" }));
    $("horas-devolucion").addEventListener("click", () => R.vistaNovedades.abrirFormulario({ tipo: "devolucion_horas" }));
    $("vista-horas").addEventListener("click", e => {
      const nov = e.target.closest("[data-novedad]");
      if (nov) return R.vistaNovedades.editar(Number(nov.dataset.novedad));
      const fila = e.target.closest("[data-empleado]");
      if (fila) R.vistaFicha.abrir(Number(fila.dataset.empleado));
    });
  }

  R.vistaHoras = { iniciar, mostrar, saldoDe, clavesCuenta };
})(window.RRHH);
