// =====================================================================
//  Vista: ficha de un empleado (datos, saldo de vacaciones, historial
//  de novedades y asistencia). Se abre desde cualquier tabla.
// =====================================================================
(function (R) {
  const { $, esc, hoy, fmtFecha, fmtNum, fmtMinutos, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  let empleadoId = null;

  const cantidadTexto = n => R.calc.cantidadTexto(n, app().tipo(n.tipo));

  // Detalle extra de una novedad: certificado, hora, liquidado
  function detalle(n) {
    const t = app().tipo(n.tipo), partes = [];
    if (n.con_certificado === true) partes.push("Con certificado");
    else if (n.con_certificado === false && n.tipo === "licencia_medica") partes.push("Sin certificado");
    if (n.hora) partes.push((n.tipo === "llegada_tarde" ? "Llegó " : "Desde las ") + n.hora.slice(0, 5));
    if (n.tipo === "horas_extra") partes.push(n.liquidado_en ? "Liquidada en " + R.util.mesTexto(n.liquidado_en.slice(0, 7)) : "Sin liquidar");
    if (t.descuenta_vacaciones) partes.push(`Período ${n.anio_vacaciones}` + (n.liquidado_en ? ` · liquidado el ${fmtFecha(n.liquidado_en)}` : " · sin liquidar"));
    if (n.generada_por) partes.push("Generada sola");
    return partes.length ? `<small>${esc(partes.join(" · "))}</small>` : "";
  }

  // Edad a hoy
  function edad(nac, hoyISO) {
    if (!nac) return "";
    const [a1, m1, d1] = nac.split("-").map(Number), [a2, m2, d2] = hoyISO.split("-").map(Number);
    const anios = a2 - a1 - ((m2 < m1 || (m2 === m1 && d2 < d1)) ? 1 : 0);
    return `${fmtFecha(nac)} (${anios} años)`;
  }

  async function abrir(id) {
    empleadoId = id;
    const e = app().empleado(id);
    if (!e) return;
    $("ficha-titulo").textContent = nombreEmpleado(e);
    $("ficha-cuerpo").innerHTML = R.util.esqueleto.ficha();
    if (!$("dlg-ficha").open) $("dlg-ficha").showModal();

    const hoyISO = hoy(), anioVac = R.calc.anioVacacionesDe(hoyISO);
    let novedades, asistenciaMes, ajustes, ajustesAnt, vacAnt;
    try {
      [novedades, asistenciaMes, ajustes, ajustesAnt, vacAnt] = await Promise.all([
        R.api.novedades.deEmpleado(id),
        (({ desde, hasta }) => R.api.asistencia.entre(desde, hasta, id).catch(() => []))(R.util.rangoMes(hoyISO.slice(0, 7))),
        R.api.ajustes.delAnio(anioVac),
        R.api.ajustes.delAnio(anioVac - 1),
        R.api.novedades.deVacaciones(anioVac - 1),
      ]);
    } catch (err) { $("ficha-cuerpo").innerHTML = ""; return toast(err.message, "error", 6000); }
    const hz = R.calc.horarioDe(e);
    let aFavorMes = 0, tardesMes = 0, minTardeMes = 0;
    asistenciaMes.forEach(f => { const m = R.calc.minutosAsistencia(f.entrada, f.salida, hz); aFavorMes += m.aFavor; if (m.tarde > 0) { tardesMes++; minTardeMes += m.tarde; } });

    const tipos = R.estado.tipos;
    const s = R.calc.saldoVacaciones(e, anioVac, novedades, ajustes, tipos);
    const sAnt = R.calc.saldoVacaciones(e, anioVac - 1, vacAnt.filter(n => n.empleado_id === id), ajustesAnt, tipos);
    const saldoTxt = x => x.saldo == null ? "falta la fecha de ingreso" : `quedan ${fmtNum(x.saldo, 1)} de ${fmtNum(x.corresponden + x.ajuste, 1)} días`;
    const periodo = a => `del período ${a} (de octubre ${a} a abril ${a + 1})`;
    const ch = R.calc.cuentaHoras(e, novedades, tipos), fmtH = R.calc.fmtHoras;
    const saldoHoras = Math.abs(ch.saldo) < 0.005 ? "0 h" : ch.saldo > 0 ? fmtH(ch.saldo) : `${fmtH(ch.saldo)} a favor`;
    const filasHoras = [...ch.movimientos].reverse().map(m => `
      <tr class="clic" data-novedad="${m.novedad.id}">
        <td>${fmtFecha(m.novedad.fecha_desde)}</td><td>${app().chipTipo(m.novedad.tipo)}</td>
        <td class="num ${m.horas > 0 ? "debe" : "a-favor"}">${m.horas > 0 ? "+" : "−"}${esc(fmtH(m.horas))}</td>
        <td class="num">${m.saldo > 0.005 ? esc(fmtH(m.saldo)) : m.saldo < -0.005 ? `${esc(fmtH(m.saldo))} a favor` : "0"}</td>
        <td>${esc(m.novedad.observacion)}</td>
      </tr>`).join("");

    const dato = (t, v, ayuda) => `<div><dt>${esc(t)}${ayuda ? info(ayuda) : ""}</dt><dd>${v ? esc(v) : "—"}</dd></div>`;
    const filasNov = novedades.map(n => `
      <tr class="clic" data-novedad="${n.id}">
        <td>${fmtFecha(n.fecha_desde)}${n.fecha_hasta !== n.fecha_desde ? ` al ${fmtFecha(n.fecha_hasta)}` : ""}</td>
        <td>${app().chipTipo(n.tipo)}</td>
        <td class="num">${cantidadTexto(n)}</td>
        <td>${esc(n.observacion)}${detalle(n)}</td>
      </tr>`).join("");

    $("ficha-cuerpo").innerHTML = `
      <dl class="ficha-datos">
        ${dato("Legajo", e.legajo)}
        ${dato("Sucursal", app().sucursalNombre(e.sucursal_id))}
        ${dato("Puesto", e.puesto)}
        ${dato("Sector", e.sector)}
        ${dato("Jornada", e.jornada_horas ? `${fmtNum(e.jornada_horas, 1)} h` : "")}
        ${dato("Horario", hz.entrada + " a " + hz.salida + (e.hora_entrada || e.hora_salida ? " (propio)" : " (de su sucursal)"), "Hora de entrada y de salida. Si el empleado no tiene una propia, se usa la de su sucursal. Se cambia en Editar datos.")}
        ${dato("Minutos a favor desde", hz.extraEntrada + " min antes de la entrada · " + hz.extraSalida + " min después de la salida" + (e.extra_entrada_min != null || e.extra_salida_min != null ? " (propios)" : ""), "Mínimo de minutos de anticipación o de permanencia para que se cuenten a favor. Si el empleado no tiene los suyos, valen los generales (Configuración → Horarios y minutos a favor).")}
        ${dato("Ingreso", e.fecha_ingreso ? fmtFecha(e.fecha_ingreso) : "")}
        ${dato("Antigüedad", R.calc.antiguedad(e.fecha_ingreso, hoyISO), "Tiempo desde la fecha de ingreso hasta hoy. Para las vacaciones se cuenta la antigüedad al 31/12 de cada período.")}
        ${dato("Estado", e.activo ? "Activo" : `De baja${e.fecha_egreso ? " desde " + fmtFecha(e.fecha_egreso) : ""}${e.motivo_baja ? " · " + e.motivo_baja : ""}`)}
        ${dato("DNI", e.dni)}
        ${dato("CUIL", e.cuil)}
        ${dato("Nacimiento", edad(e.fecha_nacimiento, hoyISO))}
        ${dato("Teléfono", e.telefono)}
        ${dato("Email", e.email)}
        ${dato("Dirección", e.direccion)}
        ${dato("Obra social", e.obra_social)}
        ${dato("Banco", e.banco)}
        ${dato("Emergencia", [e.contacto_emergencia_nombre, e.contacto_emergencia_tel].filter(Boolean).join(" · "), "Contacto en caso de emergencia: nombre (y vínculo) y teléfono.")}
      </dl>
      ${e.notas ? `<p class="hint" style="white-space:pre-line">${esc(e.notas)}</p>` : ""}
      <div class="kpis" style="margin-top:8px">
        <div class="kpi destacado"><div class="etiqueta">Saldo vacaciones ${anioVac}${info(`Días de vacaciones que le quedan ${periodo(anioVac)}. Se calcula así: días que corresponden por antigüedad, más o menos los ajustes, menos los días ya tomados.`)}</div><div class="valor">${s.saldo == null ? "—" : fmtNum(s.saldo, 1)}<small>días</small></div><div class="detalle">${s.saldo == null ? "falta la fecha de ingreso" : `corresponden ${s.corresponden}${s.ajuste ? ` ${s.ajuste > 0 ? "+" : "−"} ${fmtNum(Math.abs(s.ajuste), 1)} de ajuste` : ""} · tomados ${fmtNum(s.tomados, 1)}${s.programados ? ` (${fmtNum(s.programados, 1)} programados)` : ""}`}</div></div>
        <div class="kpi"><div class="etiqueta">Período ${anioVac - 1}${info(`Lo que le quedó sin tomar ${periodo(anioVac - 1)}. "Quedan X de Y": X son los días disponibles y Y el total que le correspondía (con ajustes). Si las vacaciones de ese período no se cargaron en el sistema, figura como si no hubiera tomado ninguna.`)}</div><div class="valor">${sAnt.saldo == null ? "—" : fmtNum(sAnt.saldo, 1)}<small>días</small></div><div class="detalle">${saldoTxt(sAnt)}</div></div>
        <div class="kpi"><div class="etiqueta">Cuenta de horas${info("Horas que debe devolver hoy por permisos o días pedidos, descontando lo que ya devolvió. Si dice \"a favor\", devolvió de más.")}</div><div class="valor" style="font-size:26px">${esc(saldoHoras)}</div><div class="detalle">${ch.movimientos.length ? (ch.saldo > 0.005 ? `adeuda ${esc(fmtH(ch.saldo))} en ${ch.pendientes.length} ${ch.pendientes.length === 1 ? "deuda pendiente" : "deudas pendientes"}` : ch.saldo < -0.005 ? "devolvió de más" : "no adeuda nada") : "sin movimientos"}</div></div>
        <div class="kpi"><div class="etiqueta">Asistencia del mes${info("Minutos a favor y llegadas tarde de este mes, según las horas cargadas en la planilla de Asistencia.")}</div><div class="valor" style="font-size:26px">${aFavorMes ? "+" + esc(fmtMinutos(aFavorMes)) : "0 min"}</div><div class="detalle">${tardesMes ? `${tardesMes} ${tardesMes === 1 ? "llegada tarde" : "llegadas tarde"} · ${esc(fmtMinutos(minTardeMes))}` : "sin llegadas tarde"}</div></div>
      </div>
      <div class="filtros" style="justify-content:flex-end">
        ${app().esAdmin() ? `<button type="button" class="btn-sec" id="ficha-editar">Editar datos</button>` : ""}
        <button type="button" class="btn-sec primario" id="ficha-novedad">Cargar novedad</button>
      </div>
      <h2>Novedades</h2>
      <div class="tabla-wrap"><table class="tabla grilla"><thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Cantidad</th><th>Observación</th></tr></thead>
        <tbody>${filasNov || `<tr><td colspan="4" class="vacio">Sin novedades cargadas.</td></tr>`}</tbody></table></div>
      <h2 style="margin-top:20px">Cuenta de horas${info("Movimientos de la cuenta, del más nuevo al más viejo. \"Saldo\" es lo que debía después de cada movimiento, como en un resumen de cuenta corriente.")}</h2>
      <div class="tabla-wrap"><table class="tabla grilla"><thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Horas</th><th class="num">Saldo</th><th>Observación</th></tr></thead>
        <tbody>${filasHoras || `<tr><td colspan="5" class="vacio">Sin movimientos en la cuenta de horas.</td></tr>`}</tbody></table></div>`;
  }

  function iniciar() {
    $("ficha-cuerpo").addEventListener("click", ev => {
      if (ev.target.closest("#ficha-editar")) return R.vistaEmpleados.abrirFormulario(empleadoId);
      if (ev.target.closest("#ficha-novedad")) return R.vistaNovedades.abrirFormulario({ empleado_id: empleadoId });
      const fila = ev.target.closest("[data-novedad]");
      if (fila) R.vistaNovedades.editar(Number(fila.dataset.novedad));
    });
  }

  // Si la ficha está abierta, se vuelve a dibujar (después de guardar algo)
  function refrescarSiAbierta() { if ($("dlg-ficha").open && empleadoId) abrir(empleadoId); }

  R.vistaFicha = { iniciar, abrir, refrescarSiAbierta };
})(window.RRHH);
