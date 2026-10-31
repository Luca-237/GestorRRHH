// =====================================================================
//  Vista: Asistencia. Planilla del día: se carga la hora de entrada y de
//  salida de cada empleado y se calculan solos los minutos de llegada tarde
//  y los minutos a favor (reglas en R.calc.minutosAsistencia; los horarios
//  y los mínimos se cambian en Configuración y, por empleado, en su ficha).
//  Abajo, el resumen del mes del día elegido.
// =====================================================================
(function (R) {
  const { $, esc, fmtFecha, fmtNum, nombreEmpleado, toast, info, hoy, sumarDias, aFecha, rangoMes, mesTexto } = R.util;
  const app = () => R.app;
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  let porClave = new Map();   // "empleado|fecha" -> fila de asistencia del mes cargado
  let mesCargado = "";
  const clave = (empleadoId, fecha) => `${empleadoId}|${fecha}`;
  const fecha = () => $("as-fecha").value || hoy();
  const min = n => `${fmtNum(n)} min`;

  async function cargarMes(mes) {
    const { desde, hasta } = rangoMes(mes);
    const filas = await R.api.asistencia.entre(desde, hasta);
    porClave = new Map(filas.map(f => [clave(f.empleado_id, f.fecha.slice(0, 10)), f]));
    mesCargado = mes;
  }

  // Lo que se muestra en las celdas calculadas de un empleado ese día
  function calculo(e, f) {
    const fila = porClave.get(clave(e.id, f));
    const h = R.calc.horarioDe(e);
    const m = fila ? R.calc.minutosAsistencia(fila.entrada, fila.salida, h) : null;
    return { fila, h, m };
  }
  const celdaTarde = m => !m || !m.tarde ? `<span class="cero">—</span>` : `<span class="debe">${esc(min(m.tarde))}</span>`;
  const celdaFavor = m => {
    if (!m || !m.aFavor) return `<span class="cero">—</span>`;
    const partes = [m.extraEntrada ? `${fmtNum(m.extraEntrada)} antes` : "", m.extraSalida ? `${fmtNum(m.extraSalida)} después` : ""].filter(Boolean).join(" + ");
    return `<span class="a-favor">+${esc(min(m.aFavor))}</span><small>${esc(partes)}</small>`;
  };

  function pintarDia() {
    const f = fecha(), d = aFecha(f).getUTCDay();
    const feriado = R.estado.feriados.find(x => x.fecha === f);
    $("as-dia").innerHTML = `${DIAS[d]} ${fmtFecha(f)}` + (feriado ? ` · <span class="texto-alerta">feriado: ${esc(feriado.descripcion)}</span>` : d === 0 || d === 6 ? " · fin de semana" : "");
    const conSucursal = !R.estado.filtroSucursal;
    const lista = app().empleadosVisibles().sort((a, b) => nombreEmpleado(a).localeCompare(nombreEmpleado(b)));
    $("tabla-asistencia").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th>Horario${info("Hora en que tiene que entrar y salir. Sale de su ficha si tiene un horario propio; si no, el de su sucursal (Configuración → Sucursales).")}</th>
      <th>Entrada</th><th>Salida</th>
      <th class="num">Llegó tarde${info("Minutos que pasaron desde su hora de entrada hasta que llegó.")}</th>
      <th class="num">A favor${info("Minutos extra que se suman a su favor: los que llegó antes de su hora de entrada (si fueron al menos el mínimo de minutos antes) más los que se quedó después de su hora de salida (si fueron al menos el mínimo después). Los mínimos se cambian en Configuración → Horarios y minutos a favor, o en la ficha de cada empleado.")}</th>
      <th>Observación</th></tr></thead>
      <tbody>${lista.map(e => {
        const { fila, h, m } = calculo(e, f);
        return `<tr data-empleado="${e.id}">
          <td>${esc(nombreEmpleado(e))}<small>${esc(e.puesto || "")}</small></td>
          ${conSucursal ? `<td>${esc(app().sucursalNombre(e.sucursal_id))}</td>` : ""}
          <td>${esc(h.entrada)} – ${esc(h.salida)}${h.propio ? "<small>horario propio</small>" : ""}
            <small>mínimo ${fmtNum(h.extraEntrada)} antes · ${fmtNum(h.extraSalida)} después</small></td>
          <td><input type="time" data-campo="entrada" value="${esc((fila && fila.entrada || "").slice(0, 5))}" aria-label="Entrada de ${esc(nombreEmpleado(e))}"></td>
          <td><input type="time" data-campo="salida" value="${esc((fila && fila.salida || "").slice(0, 5))}" aria-label="Salida de ${esc(nombreEmpleado(e))}"></td>
          <td class="num" data-celda="tarde">${celdaTarde(m)}</td>
          <td class="num" data-celda="favor">${celdaFavor(m)}</td>
          <td><input type="text" data-campo="observacion" value="${esc(fila ? fila.observacion : "")}" placeholder="opcional" maxlength="200" aria-label="Observación de ${esc(nombreEmpleado(e))}"></td>
        </tr>`;
      }).join("") || `<tr><td colspan="${conSucursal ? 8 : 7}" class="vacio">No hay empleados para mostrar.</td></tr>`}</tbody>`;
  }

  function pintarResumen() {
    const mes = fecha().slice(0, 7), { desde, hasta } = rangoMes(mes);
    $("as-mes-titulo").textContent = `Resumen de ${mesTexto(mes)}`;
    const conSucursal = !R.estado.filtroSucursal;
    const filas = app().empleadosVisibles().sort((a, b) => nombreEmpleado(a).localeCompare(nombreEmpleado(b))).map(e => {
      let dias = 0, tardes = 0, minTarde = 0, aFavor = 0;
      for (const [k, fila] of porClave) {
        if (!k.startsWith(e.id + "|")) continue;
        const dia = fila.fecha.slice(0, 10);
        if (dia < desde || dia > hasta) continue;
        const m = R.calc.minutosAsistencia(fila.entrada, fila.salida, R.calc.horarioDe(e));
        dias++; aFavor += m.aFavor;
        if (m.tarde > 0) { tardes++; minTarde += m.tarde; }
      }
      return { e, dias, tardes, minTarde, aFavor };
    }).filter(r => r.dias > 0);
    $("tabla-asistencia-mes").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th class="num">Días cargados</th>
      <th class="num">Llegadas tarde${info("Cantidad de días del mes en que llegó después de su hora de entrada.")}</th>
      <th class="num">Minutos tarde</th>
      <th class="num">Minutos a favor${info("Suma del mes de los minutos extra (antes de la entrada y después de la salida) que superaron el mínimo.")}</th></tr></thead>
      <tbody>${filas.map(r => `<tr class="clic" data-ficha="${r.e.id}">
        <td>${esc(nombreEmpleado(r.e))}</td>
        ${conSucursal ? `<td>${esc(app().sucursalNombre(r.e.sucursal_id))}</td>` : ""}
        <td class="num">${r.dias}</td>
        <td class="num ${r.tardes ? "debe" : "cero"}">${r.tardes}</td>
        <td class="num ${r.minTarde ? "debe" : "cero"}">${r.minTarde ? esc(min(r.minTarde)) : "—"}</td>
        <td class="num ${r.aFavor ? "a-favor" : "cero"}">${r.aFavor ? "+" + esc(min(r.aFavor)) : "—"}</td>
      </tr>`).join("") || `<tr><td colspan="${conSucursal ? 6 : 5}" class="vacio">Todavía no hay horas cargadas en ${esc(mesTexto(mes))}.</td></tr>`}</tbody>`;
  }

  async function mostrar() {
    if (!$("as-fecha").value) $("as-fecha").value = hoy();
    $("as-sub").textContent = `${app().textoSucursal()} · hora de entrada y de salida de cada día`;
    const mes = fecha().slice(0, 7);
    if (mes !== mesCargado || !$("tabla-asistencia").innerHTML) {
      $("tabla-asistencia").innerHTML = R.util.esqueleto.tabla(7, 6);
      $("tabla-asistencia-mes").innerHTML = R.util.esqueleto.tabla(5, 3);
    }
    try { await cargarMes(mes); }
    catch (e) { $("tabla-asistencia").innerHTML = ""; return toast(e.message, "error", 6000); }
    pintarDia(); pintarResumen();
  }

  async function guardarFila(tr, input) {
    const e = app().empleado(Number(tr.dataset.empleado)), f = fecha();
    const val = campo => tr.querySelector(`[data-campo="${campo}"]`).value.trim();
    const entrada = val("entrada") || null, salida = val("salida") || null, observacion = val("observacion");
    const existente = porClave.get(clave(e.id, f));
    try {
      if (!entrada && !salida) {
        if (observacion && input.dataset.campo === "observacion") { toast("Cargá la entrada o la salida para poder guardar la observación.", "error"); return; }
        if (existente) { await R.api.asistencia.eliminar(e.id, f); porClave.delete(clave(e.id, f)); toast("Se borró la asistencia de ese día."); }
        tr.querySelector('[data-campo="observacion"]').value = "";
      } else {
        porClave.set(clave(e.id, f), await R.api.asistencia.guardar({ empleado_id: e.id, fecha: f, entrada, salida, observacion }));
      }
    } catch (err) { toast(err.message, "error", 6000); return pintarDia(); }
    const { m } = calculo(e, f);
    tr.querySelector('[data-celda="tarde"]').innerHTML = celdaTarde(m);
    tr.querySelector('[data-celda="favor"]').innerHTML = celdaFavor(m);
    pintarResumen();
  }

  function moverDia(n) { $("as-fecha").value = sumarDias(fecha(), n); mostrar(); }

  function iniciar() {
    $("as-fecha").addEventListener("change", mostrar);
    $("as-anterior").addEventListener("click", () => moverDia(-1));
    $("as-siguiente").addEventListener("click", () => moverDia(1));
    $("as-hoy").addEventListener("click", () => { $("as-fecha").value = hoy(); mostrar(); });
    $("tabla-asistencia").addEventListener("change", e => {
      const tr = e.target.closest("tr[data-empleado]");
      if (tr && e.target.dataset.campo) guardarFila(tr, e.target);
    });
    $("tabla-asistencia-mes").addEventListener("click", e => {
      const fila = e.target.closest("[data-ficha]");
      if (fila) R.vistaFicha.abrir(Number(fila.dataset.ficha));
    });
  }

  R.vistaAsistencia = { iniciar, mostrar };
})(window.RRHH);
