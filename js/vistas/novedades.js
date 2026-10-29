// =====================================================================
//  Vista: Novedades (lista del mes, alta/edición y exportación para
//  la liquidación de sueldos).
// =====================================================================
(function (R) {
  const { $, esc, hoy, mesActual, rangoMes, mesTexto, diasEntre, fmtFecha, fmtNum, fmtMinutos, nombreEmpleado, toast, descargarCSV } = R.util;
  const app = () => R.app;
  let lista = [];      // novedades del mes mostradas
  let editando = null; // novedad que se está editando

  function cantidadTexto(n) {
    const t = app().tipo(n.tipo);
    if (t.unidad === "minutos") return fmtMinutos(n.cantidad);
    if (t.unidad === "horas") return `${fmtNum(n.cantidad, 2)} h${n.recargo ? ` · ${n.recargo}%` : ""}`;
    return `${fmtNum(n.cantidad)} ${Number(n.cantidad) === 1 ? "día" : "días"}`;
  }

  function pintarFiltros() {
    const tipo = $("novedades-tipo").value, emp = $("novedades-empleado").value;
    $("novedades-tipo").innerHTML = `<option value="">Todos</option>` +
      R.estado.tipos.map(t => `<option value="${esc(t.clave)}">${esc(t.nombre)}</option>`).join("");
    $("novedades-tipo").value = tipo;
    $("novedades-empleado").innerHTML = app().opcionesEmpleados(emp || null, { vacia: "Todos" });
    if (![...$("novedades-empleado").options].some(o => o.value === emp)) $("novedades-empleado").value = "";
  }

  async function mostrar() {
    if (!$("novedades-mes").value) $("novedades-mes").value = mesActual();
    pintarFiltros();
    const { desde, hasta } = rangoMes($("novedades-mes").value);
    $("tabla-novedades").innerHTML = `<tbody><tr><td class="cargando">Cargando…</td></tr></tbody>`;
    try { lista = await R.api.novedades.entre(desde, hasta); }
    catch (e) { lista = []; toast(e.message, "error", 6000); }
    pintar();
  }

  function filtradas() {
    const tipo = $("novedades-tipo").value, emp = Number($("novedades-empleado").value) || null;
    return lista.filter(n => app().esVisible(n.empleado_id) && (!tipo || n.tipo === tipo) && (!emp || n.empleado_id === emp));
  }

  function pintar() {
    const filas = filtradas();
    $("tabla-novedades").innerHTML = `<thead><tr><th>Fecha</th><th>Empleado</th><th>Tipo</th><th class="num">Cantidad</th><th>Observación</th></tr></thead>
      <tbody>${filas.map(n => {
        const e = app().empleado(n.empleado_id);
        return `<tr class="clic" data-novedad="${n.id}">
          <td>${fmtFecha(n.fecha_desde)}${n.fecha_hasta !== n.fecha_desde ? `<small>al ${fmtFecha(n.fecha_hasta)}</small>` : ""}</td>
          <td>${esc(nombreEmpleado(e))}<small>${esc(app().sucursalNombre(e && e.sucursal_id))}</small></td>
          <td>${app().chipTipo(n.tipo)}</td>
          <td class="num">${cantidadTexto(n)}</td>
          <td>${esc(n.observacion)}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="5" class="vacio">No hay novedades en ${mesTexto($("novedades-mes").value)} con este filtro.</td></tr>`}</tbody>`;
  }

  // ---------- Formulario ----------
  function ajustarFormulario() {
    const t = app().tipo($("no-tipo").value);
    const porDias = t.unidad === "dias";
    $("no-hasta-wrap").hidden = !porDias;
    $("no-desde-label").textContent = porDias ? "Desde" : "Fecha";
    $("no-cantidad-wrap").hidden = porDias;
    $("no-cantidad-label").textContent = t.unidad === "minutos" ? "Minutos tarde" : "Horas";
    $("no-cantidad").step = t.unidad === "minutos" ? "1" : "0.25";
    $("no-recargo-wrap").hidden = t.clave !== "horas_extra";
    $("no-vacaciones-wrap").hidden = !t.descuenta_vacaciones;
    $("no-certificado-wrap").hidden = t.clave !== "licencia_medica";
    if (!$("no-hasta").value || $("no-hasta").value < $("no-desde").value) $("no-hasta").value = $("no-desde").value;
    const d = $("no-desde").value, h = $("no-hasta").value;
    $("no-dias").textContent = porDias && d && h && h >= d ? `${diasEntre(d, h)} ${diasEntre(d, h) === 1 ? "día corrido" : "días corridos"}` : "";
    // Período de vacaciones: el que sugiere la fecha, salvo que lo hayan elegido a mano
    if (t.descuenta_vacaciones && d && !$("no-anio").dataset.manual) $("no-anio").value = String(R.calc.anioVacacionesDe(d));
    avisoHoras();
  }

  // Si el tipo mueve la cuenta de horas: cuánto debe hoy el empleado y cómo queda
  let saldoCache = { id: null, cuenta: null }, pedido = 0;
  async function avisoHoras() {
    const t = app().tipo($("no-tipo").value), el = $("no-horas");
    const signo = Number(t.cuenta_horas);
    if (!signo) { el.hidden = true; return; }
    el.hidden = false;
    const id = Number($("no-empleado").value) || null, e = app().empleado(id);
    if (!e) { el.textContent = signo > 0 ? "Estas horas se suman a la cuenta de horas que el empleado debe." : "Estas horas se descuentan de la cuenta de horas que el empleado debe."; return; }
    const d = $("no-desde").value, h = $("no-hasta").value;
    const cantidad = t.unidad === "dias" ? (d && h && h >= d ? diasEntre(d, h) : 0) : Number($("no-cantidad").value) || 0;
    const mov = R.calc.horasDeNovedad({ cantidad }, t, e) * signo;
    const mio = ++pedido;
    if (saldoCache.id !== id) {
      el.textContent = "Calculando la cuenta de horas…";
      try { saldoCache = { id, cuenta: await R.vistaHoras.saldoDe(id) }; }
      catch (err) { el.textContent = err.message; return; }
      if (mio !== pedido) return; // ya cambiaron algo mientras se calculaba
    }
    // Si se está editando, el saldo actual no tiene que contar este mismo movimiento
    let saldo = saldoCache.cuenta.saldo;
    if (editando) {
      const previo = saldoCache.cuenta.movimientos.find(m => m.novedad.id === editando.id);
      if (previo) saldo -= previo.horas;
    }
    const fmtH = R.calc.fmtHoras;
    const txt = x => Math.abs(x) < 0.005 ? "0 h" : x > 0 ? `debe ${fmtH(x)}` : `tiene ${fmtH(x)} a favor`;
    const dias = t.unidad === "dias" ? ` (${fmtNum(cantidad)} ${cantidad === 1 ? "día" : "días"} × jornada de ${fmtNum(Number(e.jornada_horas) || R.calc.JORNADA_POR_DEFECTO, 1)} h)` : "";
    el.innerHTML = `Cuenta de horas de ${esc(e.nombre || e.apellido)}: hoy <strong>${esc(txt(saldo))}</strong>.` +
      (mov ? ` Este movimiento ${signo > 0 ? "suma" : "descuenta"} ${esc(fmtH(mov))}${esc(dias)} → queda: <strong>${esc(txt(saldo + mov))}</strong>.` : "");
  }

  function abrirFormulario(datos = {}) {
    editando = datos.id ? datos : null;
    saldoCache = { id: null, cuenta: null }; // la cuenta puede haber cambiado desde la última vez
    $("dlg-novedad-titulo").textContent = editando ? "Editar novedad" : "Cargar novedad";
    $("no-empleado").innerHTML = app().opcionesEmpleados(datos.empleado_id ?? null, { vacia: "Elegí un empleado" });
    $("no-tipo").innerHTML = R.estado.tipos.filter(t => t.activo || t.clave === datos.tipo)
      .map(t => `<option value="${esc(t.clave)}">${esc(t.nombre)}</option>`).join("");
    $("no-tipo").value = datos.tipo || "vacaciones";
    $("no-desde").value = datos.fecha_desde || hoy();
    $("no-hasta").value = datos.fecha_hasta || datos.fecha_desde || hoy();
    $("no-cantidad").value = datos.cantidad ?? "";
    $("no-recargo").value = String(datos.recargo || 50);
    const anio = R.calc.anioVacacionesDe(hoy());
    $("no-anio").innerHTML = [anio + 1, anio, anio - 1, anio - 2].map(a => `<option value="${a}">Período ${a}</option>`).join("");
    delete $("no-anio").dataset.manual;
    if (datos.anio_vacaciones) { $("no-anio").value = String(datos.anio_vacaciones); $("no-anio").dataset.manual = "1"; }
    $("no-certificado").checked = datos.con_certificado === true;
    $("no-observacion").value = datos.observacion || "";
    $("no-eliminar").hidden = !editando;
    $("novedad-error").textContent = "";
    ajustarFormulario();
    $("dlg-novedad").showModal();
    (datos.empleado_id ? $("no-tipo") : $("no-empleado")).focus();
  }

  async function editar(id) {
    let n = lista.find(x => x.id === id);
    if (!n) {
      // Viene de la ficha: puede ser de otro mes
      try { n = await R.api.novedades.obtener(id); }
      catch (err) { return toast(err.message, "error", 6000); }
    }
    if (n) abrirFormulario(n);
  }

  async function guardar(ev) {
    ev.preventDefault();
    $("novedad-error").textContent = "";
    const t = app().tipo($("no-tipo").value);
    const d = {
      empleado_id: Number($("no-empleado").value) || null,
      tipo: t.clave,
      fecha_desde: $("no-desde").value,
      fecha_hasta: t.unidad === "dias" ? $("no-hasta").value : $("no-desde").value,
      cantidad: t.unidad === "dias" ? 0 : Number($("no-cantidad").value),
      recargo: t.clave === "horas_extra" ? Number($("no-recargo").value) : null,
      anio_vacaciones: t.descuenta_vacaciones ? Number($("no-anio").value) : null,
      con_certificado: t.clave === "licencia_medica" ? $("no-certificado").checked : null,
      observacion: $("no-observacion").value,
    };
    if (!d.empleado_id) return ($("novedad-error").textContent = "Elegí un empleado.");
    if (d.fecha_hasta < d.fecha_desde) return ($("novedad-error").textContent = "La fecha \"hasta\" no puede ser anterior a \"desde\".");
    if (t.unidad !== "dias" && !(d.cantidad > 0)) return ($("novedad-error").textContent = `Indicá ${t.unidad === "minutos" ? "los minutos" : "las horas"}.`);

    $("no-guardar").disabled = true;
    try {
      if (editando) await R.api.novedades.actualizar(editando.id, d);
      else await R.api.novedades.crear(d);
      $("dlg-novedad").close();
      toast(editando ? "Novedad actualizada." : "Novedad cargada.");
      app().refrescar();
      R.vistaFicha.refrescarSiAbierta();
    } catch (err) {
      $("novedad-error").textContent = err.message;
    } finally { $("no-guardar").disabled = false; }
  }

  async function eliminar() {
    if (!editando || !confirm("¿Eliminar esta novedad? No se puede deshacer.")) return;
    try {
      await R.api.novedades.eliminar(editando.id);
      $("dlg-novedad").close();
      toast("Novedad eliminada.");
      app().refrescar();
      R.vistaFicha.refrescarSiAbierta();
    } catch (err) { $("novedad-error").textContent = err.message; }
  }

  // ---------- Exportación para el estudio contable ----------
  // Una fila por empleado con los totales del mes (lo que se manda para liquidar sueldos)
  async function exportar() {
    const mes = $("novedades-mes").value || mesActual();
    const { desde, hasta } = rangoMes(mes);
    const tipos = R.estado.tipos;
    const resumen = R.calc.resumirNovedades(lista, desde, hasta, tipos);
    const tiposDias = tipos.filter(t => t.unidad === "dias");
    const tiposOtros = tipos.filter(t => t.unidad !== "dias" && !["llegada_tarde", "horas_extra"].includes(t.clave));
    const encabezado = ["Apellido y nombre", "DNI", "CUIL", "Sucursal", "Puesto", "Llegadas tarde (cant.)", "Llegadas tarde (min)",
      "Horas extra 50%", "Horas extra 100%", ...tiposDias.map(t => `${t.nombre} (días)`),
      ...tiposOtros.map(t => `${t.nombre} (${t.unidad})`), "Cuenta de horas: saldo al exportar (h)", "Observaciones"];
    // Saldo de la cuenta de horas (de todo el historial, no solo del mes)
    let movsHoras = [];
    try { movsHoras = await R.api.novedades.deTipos(R.vistaHoras.clavesCuenta()); }
    catch (err) { return toast(err.message, "error", 6000); }
    const filas = app().empleadosVisibles({ inactivos: true })
      .filter(e => e.activo || resumen.has(e.id))
      .map(e => {
        const saldoHoras = Math.round(R.calc.cuentaHoras(e, movsHoras, tipos).saldo * 100) / 100;
        const r = resumen.get(e.id) || { tardanzas: 0, minutosTarde: 0, horasExtra50: 0, horasExtra100: 0, dias: {}, otros: {} };
        const obs = lista.filter(n => n.empleado_id === e.id && n.observacion).map(n => `${app().tipo(n.tipo).nombre} ${R.util.fmtCorta(n.fecha_desde)}: ${n.observacion}`).join(" | ");
        const num = n => String(n || 0).replace(".", ",");
        return [nombreEmpleado(e), e.dni, e.cuil, app().sucursalNombre(e.sucursal_id), e.puesto, r.tardanzas, r.minutosTarde,
          num(r.horasExtra50), num(r.horasExtra100), ...tiposDias.map(t => r.dias[t.clave] || 0),
          ...tiposOtros.map(t => num(r.otros[t.clave])), num(saldoHoras), obs];
      });
    if (!filas.length) return toast("No hay empleados para exportar.", "error");
    const suc = R.estado.filtroSucursal ? "-" + app().sucursalNombre(Number(R.estado.filtroSucursal)).toLowerCase().replace(/\s+/g, "-") : "";
    descargarCSV(`novedades-${mes}${suc}.csv`, [encabezado, ...filas]);
    toast(`Exportadas ${filas.length} filas (${mesTexto(mes)}).`);
  }

  function iniciar() {
    $("novedades-mes").addEventListener("change", mostrar);
    $("novedades-tipo").addEventListener("change", pintar);
    $("novedades-empleado").addEventListener("change", pintar);
    $("exportar-novedades").addEventListener("click", exportar);
    $("tabla-novedades").addEventListener("click", e => {
      const fila = e.target.closest("[data-novedad]");
      if (fila) editar(Number(fila.dataset.novedad));
    });
    $("no-tipo").addEventListener("change", ajustarFormulario);
    $("no-desde").addEventListener("change", ajustarFormulario);
    $("no-hasta").addEventListener("change", ajustarFormulario);
    $("no-empleado").addEventListener("change", avisoHoras);
    $("no-cantidad").addEventListener("input", avisoHoras);
    $("no-anio").addEventListener("change", () => { $("no-anio").dataset.manual = "1"; });
    $("form-novedad").addEventListener("submit", guardar);
    $("no-eliminar").addEventListener("click", eliminar);
  }

  R.vistaNovedades = { iniciar, mostrar, abrirFormulario, editar };
})(window.RRHH);
