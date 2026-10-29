// =====================================================================
//  Vista: Tablero. Indicadores del mes, quién falta hoy, próximas
//  ausencias y un resumen por empleado y por sucursal.
// =====================================================================
(function (R) {
  const { $, esc, hoy, mesActual, rangoMes, mesTexto, sumarDias, fmtNum, fmtMinutos, fmtCorta, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  const TARDANZAS_ALERTA = 3;

  // Textos de las ayudas "i" del tablero
  const AYUDA = {
    activos: "Empleados dados de alta y no dados de baja, de la sucursal elegida arriba.",
    hoy: "Empleados que hoy tienen cargada una novedad que es ausencia: vacaciones, franco, licencia médica, falta o licencia especial.",
    tarde: "Cantidad de llegadas tarde registradas en el mes elegido. Abajo, el total de minutos sumados y cuántas personas llegaron tarde al menos una vez.",
    extra: "Horas extra registradas en el mes. Al 50%: días comunes. Al 100%: sábados después de las 13 h, domingos y feriados.",
    licencia: "Días corridos de licencia médica que caen dentro del mes elegido (si la licencia sigue el mes siguiente, solo cuentan los días de este mes).",
    faltas: "Días de inasistencia (faltas) cargados en el mes elegido.",
    horas: "Horas que deben los empleados por permisos o días pedidos, menos las que ya devolvieron. Es el saldo total de la cuenta de horas (no solo del mes). Detalle en Cuenta de horas.",
    evaluacion: "Promedio de la última evaluación de cada empleado (de 1 a 5). Los que nunca fueron evaluados no cuentan.",
    minTarde: "Total de minutos de llegadas tarde del empleado en el mes.",
    otras: "Licencias especiales y cualquier otro tipo (que no mueva la cuenta de horas) de novedad agregado en Configuración, en su unidad (días, horas o minutos).",
    ausencia: "Suma de los días de todas las novedades que son ausencia (vacaciones, francos, licencias y faltas) en el mes elegido.",
  };

  function kpi(etiqueta, valor, detalle, destacado, ayuda) {
    return `<div class="kpi${destacado ? " destacado" : ""}"><div class="etiqueta">${esc(etiqueta)}${ayuda ? info(ayuda) : ""}</div>
      <div class="valor">${valor}</div><div class="detalle">${detalle}</div></div>`;
  }

  const celda = (n, txt, alto) => `<td class="num${!n ? " cero" : ""}${alto ? " alto" : ""}">${n ? txt : "0"}</td>`;

  function puntaje(prom) {
    if (prom == null) return `<span class="cero">—</span>`;
    const lleno = Math.round(prom);
    return `<span class="puntaje" title="${fmtNum(prom, 2)} de 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lleno ? "lleno" : ""}"></i>`).join("")}</span> ${fmtNum(prom, 1)}`;
  }

  async function mostrar() {
    const mes = $("tablero-mes").value || mesActual();
    $("tablero-mes").value = mes;
    const { desde, hasta } = rangoMes(mes);
    const hoyISO = hoy(), en30 = sumarDias(hoyISO, 30);
    const anioVac = R.calc.anioVacacionesDe(hoyISO);
    $("tablero-sub").textContent = `${app().textoSucursal()} · ${mesTexto(mes)}`;
    $("tablero-kpis").innerHTML = `<p class="cargando">Cargando…</p>`;

    let novedades, vacaciones, ajustes, evaluaciones, movsHoras;
    try {
      [novedades, vacaciones, ajustes, evaluaciones, movsHoras] = await Promise.all([
        R.api.novedades.entre(desde < hoyISO ? desde : hoyISO, hasta > en30 ? hasta : en30),
        R.api.novedades.deVacaciones(anioVac),
        R.api.ajustes.delAnio(anioVac),
        R.api.evaluaciones.listar(),
        R.api.novedades.deTipos(R.vistaHoras.clavesCuenta()),
      ]);
    } catch (e) { $("tablero-kpis").innerHTML = ""; return toast(e.message, "error", 6000); }

    const empleados = app().empleadosVisibles();
    const ids = new Set(empleados.map(e => e.id));
    novedades = novedades.filter(n => ids.has(n.empleado_id));
    const tipos = R.estado.tipos;
    const resumen = R.calc.resumirNovedades(novedades, desde, hasta, tipos);
    const vacio = { tardanzas: 0, minutosTarde: 0, horasExtra: 0, horasExtra50: 0, horasExtra100: 0, dias: {}, diasAusente: 0, otros: {} };
    const de = id => resumen.get(id) || vacio;

    // Última evaluación de cada empleado
    const ultimaEval = new Map();
    evaluaciones.forEach(ev => { if (ids.has(ev.empleado_id) && !ultimaEval.has(ev.empleado_id)) ultimaEval.set(ev.empleado_id, ev); });

    // ---------- Indicadores ----------
    let tardanzas = 0, minTarde = 0, conTarde = 0, he = 0, he50 = 0, he100 = 0, licMed = 0, conLic = 0, faltas = 0;
    empleados.forEach(e => {
      const r = de(e.id);
      tardanzas += r.tardanzas; minTarde += r.minutosTarde; if (r.tardanzas) conTarde++;
      he += r.horasExtra; he50 += r.horasExtra50; he100 += r.horasExtra100;
      licMed += r.dias.licencia_medica || 0; if (r.dias.licencia_medica) conLic++;
      faltas += r.dias.falta || 0;
    });
    const hoyFuera = R.calc.ausentesEn(hoyISO, novedades, tipos);
    const fueraIds = new Set(hoyFuera.map(n => n.empleado_id));
    const proms = [...ultimaEval.values()].map(ev => Number(ev.promedio)).filter(n => !isNaN(n));
    const promedio = proms.length ? proms.reduce((a, b) => a + b, 0) / proms.length : null;
    // Cuenta de horas (todo el historial)
    const saldoHoras = new Map(empleados.map(e => [e.id, R.calc.cuentaHoras(e, movsHoras, tipos).saldo]));
    const deben = [...saldoHoras.values()].filter(h => h > 0.005);
    const horasDeuda = deben.reduce((a, b) => a + b, 0);

    $("tablero-kpis").innerHTML = [
      kpi("Empleados activos", fmtNum(empleados.length), esc(app().textoSucursal()), true, AYUDA.activos),
      kpi("Hoy no están", fmtNum(fueraIds.size), `de ${fmtNum(empleados.length)} activos`, false, AYUDA.hoy),
      kpi("Llegadas tarde", fmtNum(tardanzas), tardanzas ? `${fmtMinutos(minTarde)} en total · ${conTarde} ${conTarde === 1 ? "persona" : "personas"}` : "ninguna en el mes", false, AYUDA.tarde),
      kpi("Horas extra", `${fmtNum(he, 1)}<small>h</small>`, he ? `al 50%: ${fmtNum(he50, 1)} h · al 100%: ${fmtNum(he100, 1)} h` : "ninguna en el mes", false, AYUDA.extra),
      kpi("Licencia médica", `${fmtNum(licMed)}<small>${licMed === 1 ? "día" : "días"}</small>`, licMed ? `${conLic} ${conLic === 1 ? "persona" : "personas"}` : "ninguna en el mes", false, AYUDA.licencia),
      kpi("Faltas", `${fmtNum(faltas)}<small>${faltas === 1 ? "día" : "días"}</small>`, "inasistencias del mes", false, AYUDA.faltas),
      kpi("Evaluación promedio", promedio == null ? "—" : `${fmtNum(promedio, 1)}<small>/ 5</small>`, proms.length ? `última de ${proms.length} ${proms.length === 1 ? "empleado" : "empleados"}` : "sin evaluaciones", false, AYUDA.evaluacion),
      kpi("Horas adeudadas", esc(R.calc.fmtHoras(horasDeuda)), deben.length ? `${deben.length} ${deben.length === 1 ? "empleado debe" : "empleados deben"} horas` : "nadie debe horas", false, AYUDA.horas),
    ].join("");

    // ---------- Hoy no están / próximas ausencias ----------
    const item = n => {
      const e = app().empleado(n.empleado_id);
      const vuelve = n.fecha_hasta === n.fecha_desde ? `el ${fmtCorta(n.fecha_desde)}` : `${fmtCorta(n.fecha_desde)} al ${fmtCorta(n.fecha_hasta)}`;
      return `<li data-empleado="${n.empleado_id}" class="clic" style="cursor:pointer"><span>${esc(nombreEmpleado(e))}<br><small>${esc(app().sucursalNombre(e && e.sucursal_id))} · ${vuelve}</small></span>${app().chipTipo(n.tipo)}</li>`;
    };
    $("tablero-hoy").innerHTML = hoyFuera.length ? hoyFuera.map(item).join("") : `<li class="vacio">Están todos.</li>`;
    const ausencia = new Set(tipos.filter(t => t.es_ausencia).map(t => t.clave));
    const proximas = novedades
      .filter(n => ausencia.has(n.tipo) && n.fecha_desde > hoyISO && n.fecha_desde <= en30)
      .sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde));
    $("tablero-proximas").innerHTML = proximas.length ? proximas.map(item).join("") : `<li class="vacio">No hay ausencias cargadas para los próximos 30 días.</li>`;

    // ---------- Por sucursal (solo admin mirando todas) ----------
    const verSucursales = app().esAdmin() && !R.estado.filtroSucursal;
    $("tablero-sucursales-caja").hidden = !verSucursales;
    if (verSucursales) {
      const filas = R.estado.sucursales.filter(s => s.activa).map(s => {
        const emps = empleados.filter(e => e.sucursal_id === s.id);
        const t = { n: emps.length, fuera: 0, tarde: 0, he: 0, aus: 0 };
        emps.forEach(e => { const r = de(e.id); t.tarde += r.tardanzas; t.he += r.horasExtra; t.aus += r.diasAusente; if (fueraIds.has(e.id)) t.fuera++; });
        return `<tr class="clic" data-sucursal="${s.id}"><td>${esc(s.nombre)}</td><td class="num">${t.n}</td>${celda(t.fuera, t.fuera)}${celda(t.tarde, t.tarde)}${celda(t.he, fmtNum(t.he, 1))}${celda(t.aus, t.aus)}</tr>`;
      });
      $("tablero-sucursales").innerHTML = `<thead><tr><th>Sucursal</th><th class="num">Empleados</th><th class="num">Hoy no están${info(AYUDA.hoy)}</th><th class="num">Llegadas tarde</th><th class="num">Horas extra${info(AYUDA.extra)}</th><th class="num">Días de ausencia${info(AYUDA.ausencia)}</th></tr></thead><tbody>${filas.join("")}</tbody>`;
    }

    // ---------- Resumen por empleado ----------
    const conSucursal = !R.estado.filtroSucursal;
    const otrosTipos = tipos.filter(t => !Number(t.cuenta_horas) && !["vacaciones", "franco", "llegada_tarde", "horas_extra", "licencia_medica", "falta"].includes(t.clave));
    const filas = empleados.map(e => {
      const r = de(e.id);
      const s = R.calc.saldoVacaciones(e, anioVac, vacaciones, ajustes, tipos);
      const otros = otrosTipos.reduce((acc, t) => acc + (r.dias[t.clave] || 0) + (r.otros[t.clave] || 0), 0);
      const ev = ultimaEval.get(e.id);
      return `<tr class="clic" data-empleado="${e.id}">
        <td>${esc(nombreEmpleado(e))}<small>${esc(e.puesto || "")}</small></td>
        ${conSucursal ? `<td>${esc(app().sucursalNombre(e.sucursal_id))}</td>` : ""}
        ${celda(r.tardanzas, r.tardanzas, r.tardanzas >= TARDANZAS_ALERTA)}
        ${celda(r.minutosTarde, fmtMinutos(r.minutosTarde))}
        ${celda(r.horasExtra, fmtNum(r.horasExtra, 1) + " h")}
        ${celda(r.dias.franco, r.dias.franco)}
        ${celda(r.dias.vacaciones, r.dias.vacaciones)}
        ${celda(r.dias.licencia_medica, r.dias.licencia_medica)}
        ${celda(r.dias.falta, r.dias.falta)}
        ${celda(otros, fmtNum(otros, 1))}
        <td class="num${s.saldo != null && s.saldo < 0 ? " alto" : ""}">${s.saldo == null ? `—${info("No se puede calcular: falta la fecha de ingreso del empleado.")}` : fmtNum(s.saldo, 1)}</td>
        ${(h => Math.abs(h) < 0.005 ? `<td class="num cero">0</td>` : `<td class="num ${h > 0 ? "debe" : "a-favor"}">${esc(R.calc.fmtHoras(h))}${h < 0 ? " a favor" : ""}</td>`)(saldoHoras.get(e.id) || 0)}
        <td>${puntaje(ev ? Number(ev.promedio) : null)}</td>
      </tr>`;
    });
    $("tablero-empleados").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th class="num">Llegadas tarde</th><th class="num">Min. tarde${info(AYUDA.minTarde)}</th><th class="num">Horas extra${info(AYUDA.extra)}</th><th class="num">Francos</th>
      <th class="num">Vacaciones</th><th class="num">Lic. médica</th><th class="num">Faltas</th><th class="num">Otras${info(AYUDA.otras)}</th>
      <th class="num">Saldo vac. ${anioVac}${info(`Días de vacaciones que le quedan del período ${anioVac} (de octubre ${anioVac} a abril ${anioVac + 1}): los que corresponden por antigüedad, más o menos los ajustes, menos los ya tomados. Si es negativo, tomó de más.`)}</th><th class="num">Horas adeud.${info("Saldo de la cuenta de horas del empleado: lo que debe por permisos o días pedidos menos lo que ya devolvió. En verde, si tiene horas a favor.")}</th><th>Últ. evaluación${info("Puntaje promedio de la última evaluación de desempeño (de 1 a 5).")}</th></tr></thead>
      <tbody>${filas.join("") || `<tr><td colspan="13" class="vacio">No hay empleados activos${R.estado.filtroSucursal ? " en esta sucursal" : ""}. ${app().esAdmin() ? "Cargalos en Empleados." : ""}</td></tr>`}</tbody>`;
  }

  function iniciar() {
    $("tablero-mes").addEventListener("change", mostrar);
    $("vista-tablero").addEventListener("click", e => {
      const fila = e.target.closest("[data-empleado]");
      if (fila) return R.vistaFicha.abrir(Number(fila.dataset.empleado));
      const suc = e.target.closest("[data-sucursal]");
      if (suc) {
        $("filtro-sucursal").value = suc.dataset.sucursal;
        $("filtro-sucursal").dispatchEvent(new Event("change"));
      }
    });
  }

  R.vistaTablero = { iniciar, mostrar };
})(window.RRHH);
