// =====================================================================
//  Vista: Cuenta de horas. Muestra solo lo que cada empleado debe hoy: los permisos
//  y días pedidos suman horas a devolver; las devoluciones las descuentan (primero
//  las deudas más viejas).
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

  async function mostrar() {
    $("horas-sub").textContent = `${app().textoSucursal()} · horas que todavía deben devolver los empleados (permisos y días pedidos)`;
    $("horas-kpis").innerHTML = R.util.esqueleto.kpis(2);
    $("tabla-horas").innerHTML = R.util.esqueleto.tabla(5, 4);
    $("tabla-horas-movimientos").innerHTML = R.util.esqueleto.tabla(6, 4);
    let movs;
    try { movs = await cargarMovimientos(); }
    catch (e) { $("horas-kpis").innerHTML = ""; return toast(e.message, "error", 6000); }

    const tipos = R.estado.tipos;
    const filas = app().empleadosVisibles().map(e => ({ e, c: R.calc.cuentaHoras(e, movs, tipos) }));
    // Solo quienes deben horas hoy
    const deben = filas.filter(f => f.c.saldo > 0.005).sort((a, b) => b.c.saldo - a.c.saldo);
    const totalDeuda = deben.reduce((s, f) => s + f.c.saldo, 0);

    const kpi = (etiqueta, valor, detalle, ayuda, destacado) => `<div class="kpi${destacado ? " destacado" : ""}"><div class="etiqueta">${esc(etiqueta)}${info(ayuda)}</div>
      <div class="valor">${valor}</div><div class="detalle">${detalle}</div></div>`;
    $("horas-kpis").innerHTML = [
      kpi("Horas que se adeudan", esc(fmtH(totalDeuda)), deben.length ? `entre ${deben.length} ${deben.length === 1 ? "empleado" : "empleados"}` : "nadie debe horas",
        "Suma de lo que deben todos los empleados hoy. Es lo que todavía tienen que devolver.", true),
      kpi("Empleados que deben", fmtNum(deben.length), `de ${fmtNum(filas.length)} activos`, "Empleados que hoy tienen horas por devolver."),
    ].join("");

    // ---------- Lo que se debe, por empleado ----------
    const conSucursal = !R.estado.filtroSucursal;
    $("tabla-horas").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th class="num">Adeuda${info("Horas que debe devolver hoy. Los días pedidos se pasan a horas con la jornada del empleado (8 si no tiene jornada cargada).")}</th>
      <th class="num">Deudas pendientes${info("Cantidad de permisos o días pedidos que todavía no se terminaron de devolver.")}</th>
      <th>La más antigua${info("Fecha de la deuda pendiente más vieja.")}</th></tr></thead>
      <tbody>${deben.map(({ e, c }) => `<tr class="clic" data-empleado="${e.id}">
          <td>${esc(nombreEmpleado(e))}<small>${esc(e.puesto || "")}${e.jornada_horas ? ` · jornada ${fmtNum(e.jornada_horas, 1)} h` : ""}</small></td>
          ${conSucursal ? `<td>${esc(app().sucursalNombre(e.sucursal_id))}</td>` : ""}
          <td class="num debe">${esc(fmtH(c.saldo))}</td>
          <td class="num">${c.pendientes.length}</td>
          <td>${c.pendientes.length ? fmtFecha(c.pendientes[0].novedad.fecha_desde) : "—"}</td>
        </tr>`).join("") || `<tr><td colspan="${conSucursal ? 5 : 4}" class="vacio">Nadie debe horas.</td></tr>`}</tbody>`;

    // ---------- Deudas pendientes ----------
    const todas = deben.flatMap(({ e, c }) => c.pendientes.map(p => ({ e, ...p })))
      .sort((x, y) => x.novedad.fecha_desde.localeCompare(y.novedad.fecha_desde) || x.novedad.id - y.novedad.id);
    $("tabla-horas-movimientos").innerHTML = `<thead><tr><th>Fecha</th><th>Empleado</th><th>Motivo</th>
      <th class="num">Adeuda${info("Lo que falta devolver de esta deuda.")}</th>
      <th class="num">Era de${info("Horas que se pidieron en total. Si es más que lo que adeuda, una parte ya se devolvió.")}</th><th>Observación</th></tr></thead>
      <tbody>${todas.map(({ e, novedad: n, original, pendiente }) => {
        const t = app().tipo(n.tipo);
        const dias = t.unidad === "dias" ? `<small>${fmtNum(n.cantidad)} ${Number(n.cantidad) === 1 ? "día" : "días"} × ${fmtNum(Number(e.jornada_horas) || R.calc.JORNADA_POR_DEFECTO, 1)} h</small>` : "";
        const parcial = pendiente < original - 0.005;
        return `<tr class="clic" data-novedad="${n.id}">
          <td>${fmtFecha(n.fecha_desde)}</td>
          <td>${esc(nombreEmpleado(e))}</td>
          <td>${app().chipTipo(n.tipo)}</td>
          <td class="num debe">${esc(fmtH(pendiente))}</td>
          <td class="num${parcial ? "" : " cero"}">${parcial ? esc(fmtH(original)) + "<small>devuelto en parte</small>" : esc(fmtH(original))}${dias}</td>
          <td>${esc(n.observacion)}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="6" class="vacio">No hay deudas pendientes. Usá "Registrar horas a devolver" cuando alguien se tome un permiso o un día para devolver.</td></tr>`}</tbody>`;
  }

  // Saldo actual de un empleado (para el aviso del formulario de novedades)
  async function saldoDe(empleadoId) {
    const e = app().empleado(empleadoId);
    if (!e) return null;
    const movs = (await R.api.novedades.deTipos(clavesCuenta())).filter(n => n.empleado_id === empleadoId);
    return R.calc.cuentaHoras(e, movs, R.estado.tipos);
  }

  function iniciar() {
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
