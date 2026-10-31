// =====================================================================
//  Vista: Novedades (lista del mes, alta/edición y exportación para
//  la liquidación de sueldos).
// =====================================================================
(function (R) {
  const { $, esc, hoy, mesActual, rangoMes, mesTexto, diasEntre, fmtFecha, fmtNum, fmtMinutos, nombreEmpleado, toast, descargarCSV } = R.util;
  const app = () => R.app;
  let lista = [];      // novedades del mes mostradas
  let editando = null; // novedad que se está editando

  const cantidadTexto = n => R.calc.cantidadTexto(n, app().tipo(n.tipo));

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
    $("tabla-novedades").innerHTML = R.util.esqueleto.tabla(5, 8);
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
          <td class="num">${cantidadTexto(n)}${n.hora ? `<small>${n.tipo === "llegada_tarde" ? "llegó" : "desde"} ${n.hora.slice(0, 5)}</small>` : ""}</td>
          <td>${esc(n.observacion)}${n.tipo === "horas_extra" ? `<small>${n.liquidado_en ? "Liquidada en " + esc(mesTexto(n.liquidado_en.slice(0, 7))) : "Sin liquidar"}</small>` : ""}${app().tipo(n.tipo).descuenta_sueldo ? `<small>${n.liquidado_en ? "Descontado en el sueldo de " + esc(mesTexto(n.liquidado_en.slice(0, 7))) : "Pendiente de descontar"}</small>` : ""}${n.generada_por ? "<small>Generada sola (llegadas tarde)</small>" : ""}</td>
        </tr>`;
      }).join("") || `<tr><td colspan="5" class="vacio">No hay novedades en ${mesTexto($("novedades-mes").value)} con este filtro.</td></tr>`}</tbody>`;
  }

  // ---------- Formulario ----------
  // Tipos agrupados para encontrarlos rápido (los que agrega un admin van en "Otros")
  const GRUPOS_TIPOS = [
    ["Ausencias", ["vacaciones", "franco", "licencia_medica", "licencia_accidente", "licencia_especial", "falta", "dia_a_devolver"]],
    ["Horario", ["llegada_tarde", "horas_extra", "permiso_horas", "devolucion_horas"]],
    ["Montos", ["adelanto", "compra_cuenta_corriente", "viatico"]],
    ["Registros", ["cambio_obra_social", "alta", "baja"]],
  ];
  function opcionesTipos(actual) {
    const disponibles = R.estado.tipos.filter(t => t.activo || t.clave === actual);
    const usados = new Set(GRUPOS_TIPOS.flatMap(g => g[1]));
    const op = t => `<option value="${esc(t.clave)}">${esc(t.nombre)}</option>`;
    const grupos = GRUPOS_TIPOS.map(([nombre, claves]) => [nombre, claves.map(c => disponibles.find(t => t.clave === c)).filter(Boolean)]);
    grupos.push(["Otros", disponibles.filter(t => !usados.has(t.clave))]);
    return `<option value="" disabled>Elegí el tipo</option>` + grupos.filter(g => g[1].length)
      .map(([nombre, ts]) => `<optgroup label="${esc(nombre)}">${ts.map(op).join("")}</optgroup>`).join("");
  }

  function ajustarFormulario() {
    const t = app().tipo($("no-tipo").value);
    const porDias = t.unidad === "dias";
    $("no-hasta-wrap").hidden = !porDias;
    $("no-desde-label").textContent = porDias ? "Desde" : "Fecha";
    $("no-cantidad-wrap").hidden = porDias || t.unidad === "registro";
    $("no-cantidad-label").textContent = { minutos: "Minutos tarde", pesos: "Monto ($)", horas: "Horas" }[t.unidad] || "Cantidad";
    $("no-cantidad").step = t.unidad === "minutos" ? "1" : "any"; // "any": 0,33 h (20 min) tiene que ser válido
    $("no-recargo-wrap").hidden = t.clave !== "horas_extra";
    // Hora: de llegada (calcula los minutos) o de inicio de las horas extra (sugiere el recargo)
    const conHora = t.clave === "llegada_tarde" || t.clave === "horas_extra";
    $("no-hora-wrap").hidden = !conHora;
    $("no-hora-label").textContent = t.clave === "llegada_tarde" ? "Hora de llegada" : "Hora de inicio";
    $("no-hora-fin-wrap").hidden = t.clave !== "horas_extra";
    $("no-compensa-wrap").hidden = t.clave !== "horas_extra" || !!editando;
    if (t.clave !== "horas_extra") $("no-compensa").checked = false;
    $("no-liq-he-wrap").hidden = t.clave !== "horas_extra";
    // Adelantos y compras en cuenta corriente: ambos se descuentan del sueldo, pero son cosas distintas
    $("no-desc-wrap").hidden = !t.descuenta_sueldo;
    $("no-tipo-hint").textContent = { adelanto: "Plata que se le da al empleado por adelantado y se descuenta del sueldo.",
      compra_cuenta_corriente: "Mercadería que compró en la tienda y paga después: se descuenta del sueldo.",
      viatico: "Se paga al empleado; no se descuenta." }[t.clave] || "";
    $("no-liq-vac-wrap").hidden = !t.descuenta_vacaciones;
    ajustarHora();
    $("no-vacaciones-wrap").hidden = !t.descuenta_vacaciones;
    $("no-certificado-wrap").hidden = t.clave !== "licencia_medica";
    if (!$("no-hasta").value || $("no-hasta").value < $("no-desde").value) $("no-hasta").value = $("no-desde").value;
    const d = $("no-desde").value, h = $("no-hasta").value;
    $("no-dias").textContent = porDias && d && h && h >= d ? `${diasEntre(d, h)} ${diasEntre(d, h) === 1 ? "día corrido" : "días corridos"}` : "";
    // Vacaciones dentro de un período bloqueado: avisar antes de guardar (la base no las deja pasar)
    if (t.descuenta_vacaciones && d && h) {
      const b = R.calc.periodoBloqueado(d, h, app().empleado(Number($("no-empleado").value)));
      if (b) $("no-dias").innerHTML = `${esc($("no-dias").textContent)} · <strong class="texto-alerta">Toca un período sin vacaciones (del ${fmtFecha(b.fecha_desde)} al ${fmtFecha(b.fecha_hasta)}): no se va a poder guardar.</strong>`;
    }
    // Vacaciones de alguien que comparte puesto: avisar con quién (la base no deja superponerlas)
    if (t.descuenta_vacaciones) {
      const id = Number($("no-empleado").value);
      const comp = (R.estado.compartidos || []).filter(pc => pc.miembros.includes(id));
      const otros = comp.map(pc => `${pc.nombre} (con ${pc.miembros.filter(m => m !== id).map(m => nombreEmpleado(app().empleado(m))).join(", ") || "nadie más"})`);
      if (otros.length) $("no-dias").insertAdjacentText("beforeend", ` · Comparte puesto: ${otros.join("; ")}. No puede superponerse con sus vacaciones.`);
    }
    // Período de vacaciones: el que sugiere la fecha, salvo que lo hayan elegido a mano
    if (t.descuenta_vacaciones && d && !$("no-anio").dataset.manual) $("no-anio").value = String(R.calc.anioVacacionesDe(d));
    avisoHoras();
  }

  // Llegada tarde: minutos según la hora de entrada del empleado. Horas extra: recargo sugerido.
  function ajustarHora() {
    const t = app().tipo($("no-tipo").value), hora = $("no-hora").value, hint = $("no-hora-hint");
    hint.textContent = "";
    if (t.clave === "llegada_tarde") {
      const e = app().empleado(Number($("no-empleado").value));
      const ent = R.calc.horaEntrada(e);
      // Con hora, los minutos se calculan (y la base los vuelve a calcular); sin hora se cargan a mano
      $("no-cantidad-wrap").hidden = !!hora;
      if (hora) {
        const min = R.calc.minutosTarde(hora, e);
        $("no-cantidad").value = min;
        hint.textContent = `Entra a las ${ent.hora} (${ent.origen}): llegó ${min} min tarde.`;
      } else hint.textContent = `Cargá la hora de llegada y los minutos se calculan solos (entra a las ${ent.hora}, ${ent.origen}). Si no la sabés, escribí los minutos.`;
    } else if (t.clave === "horas_extra") {
      const fin = $("no-hora-fin").value;
      const partes = [];
      if (hora && fin) {
        const h = Math.round(R.calc.horasEntre(hora, fin) * 100) / 100;
        $("no-cantidad").value = h;
        partes.push(`De ${hora} a ${fin}: ${R.calc.fmtHoras(h)}.`);
      } else if (Number($("no-cantidad").value)) partes.push(`= ${R.calc.fmtHoras(Number($("no-cantidad").value))}.`);
      if (!$("no-recargo").dataset.manual) {
        const sug = R.calc.recargoSugerido($("no-desde").value, hora, R.estado.feriados);
        $("no-recargo").value = String(sug);
        const fer = R.estado.feriados.find(f => f.fecha === $("no-desde").value);
        if (sug === 100) partes.push(`Se sugiere 100%: ${fer ? "feriado (" + fer.descripcion + ")" : "domingo o sábado desde las 13"}.`);
      }
      hint.textContent = partes.join(" ");
    }
  }

  // Antes de guardar algo nuevo: ¿ya hay una carga del mismo tipo ese día (o esos días)?
  async function posibleRepetida(d, t) {
    if (editando) return null;
    let delEmpleado;
    try { delEmpleado = await R.api.novedades.deEmpleado(d.empleado_id); } catch (e) { return null; }
    const choca = delEmpleado.filter(n => n.tipo === d.tipo && n.fecha_desde <= d.fecha_hasta && n.fecha_hasta >= d.fecha_desde);
    if (!choca.length) return null;
    return choca.map(n => `${fmtFecha(n.fecha_desde)}${n.fecha_hasta !== n.fecha_desde ? " al " + fmtFecha(n.fecha_hasta) : ""}: ${R.calc.cantidadTexto(n, t)}${n.observacion ? " (" + n.observacion.split("\n")[0].slice(0, 40) + ")" : ""}`).join("\n");
  }

  // Si el tipo mueve la cuenta de horas: cuánto debe hoy el empleado y cómo queda
  let saldoCache = { id: null, cuenta: null }, pedido = 0;
  async function avisoHoras(tipoForzado) {
    const compensa = $("no-compensa").checked && app().tipo($("no-tipo").value).clave === "horas_extra";
    const t = app().tipo(typeof tipoForzado === "string" ? tipoForzado : compensa ? "devolucion_horas" : $("no-tipo").value), el = $("no-horas");
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
    $("no-tipo").innerHTML = opcionesTipos(datos.tipo);
    $("no-tipo").value = datos.tipo || "";
    $("no-compensa").checked = false;
    $("no-hora-fin").value = "";
    $("no-desde").value = datos.fecha_desde || hoy();
    $("no-hasta").value = datos.fecha_hasta || datos.fecha_desde || hoy();
    $("no-cantidad").value = datos.cantidad ?? "";
    $("no-recargo").value = String(datos.recargo || 50);
    if (editando) $("no-recargo").dataset.manual = "1"; else delete $("no-recargo").dataset.manual;
    $("no-hora").value = (datos.hora || "").slice(0, 5);
    $("no-liq-mes").value = datos.tipo === "horas_extra" && datos.liquidado_en ? datos.liquidado_en.slice(0, 7) : "";
    $("no-desc-mes").value = datos.liquidado_en && app().tipo(datos.tipo).descuenta_sueldo ? datos.liquidado_en.slice(0, 7) : "";
    $("no-liq-fecha").value = datos.tipo !== "horas_extra" && datos.liquidado_en ? datos.liquidado_en : "";
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
    if (!$("no-tipo").value) return ($("novedad-error").textContent = "Elegí el tipo de novedad.");
    let t = app().tipo($("no-tipo").value);
    // Horas extra que devuelven horas adeudadas: se guardan como devolución (no se pagan)
    const compensa = t.clave === "horas_extra" && $("no-compensa").checked && !editando;
    const d = {
      empleado_id: Number($("no-empleado").value) || null,
      tipo: t.clave,
      fecha_desde: $("no-desde").value,
      fecha_hasta: t.unidad === "dias" ? $("no-hasta").value : $("no-desde").value,
      cantidad: t.unidad === "dias" || t.unidad === "registro" ? 0 : Number($("no-cantidad").value),
      hora: t.clave === "llegada_tarde" || t.clave === "horas_extra" ? $("no-hora").value : null,
      liquidado_en: t.clave === "horas_extra" ? ($("no-liq-mes").value ? $("no-liq-mes").value + "-01" : null)
                  : t.descuenta_sueldo ? ($("no-desc-mes").value ? $("no-desc-mes").value + "-01" : null)
                  : t.descuenta_vacaciones ? ($("no-liq-fecha").value || null) : null,
      recargo: t.clave === "horas_extra" ? Number($("no-recargo").value) : null,
      anio_vacaciones: t.descuenta_vacaciones ? Number($("no-anio").value) : null,
      con_certificado: t.clave === "licencia_medica" ? $("no-certificado").checked : null,
      observacion: $("no-observacion").value,
    };
    if (!d.empleado_id) return ($("novedad-error").textContent = "Elegí un empleado.");
    if (compensa) {
      t = app().tipo("devolucion_horas");
      Object.assign(d, { tipo: t.clave, recargo: null, liquidado_en: null, hora: null,
        observacion: ["Horas extra para devolver horas adeudadas" + ($("no-hora").value ? ` (desde las ${$("no-hora").value}${$("no-hora-fin").value ? " hasta las " + $("no-hora-fin").value : ""})` : ""), d.observacion].filter(Boolean).join(" — ") });
    }
    if (t.clave === "llegada_tarde" && !d.hora && !(d.cantidad > 0)) return ($("novedad-error").textContent = "Cargá la hora de llegada (o los minutos).");
    if (d.fecha_hasta < d.fecha_desde) return ($("novedad-error").textContent = "La fecha \"hasta\" no puede ser anterior a \"desde\".");
    if (!["dias", "registro"].includes(t.unidad) && !(d.cantidad > 0)) return ($("novedad-error").textContent = `Indicá ${{ minutos: "los minutos (o la hora de llegada)", pesos: "el monto", horas: "las horas" }[t.unidad] || "la cantidad"}.`);

    $("no-guardar").disabled = true;
    const repetida = await posibleRepetida(d, t);
    if (repetida && !await R.util.confirmar(`${nombreEmpleado(app().empleado(d.empleado_id))} ya tiene ${t.nombre.toLowerCase()} cargada para esa fecha:\n\n${repetida}\n\n¿Guardar igual?`)) {
      $("no-guardar").disabled = false;
      return;
    }
    try {
      let creada = null;
      if (editando) await R.api.novedades.actualizar(editando.id, d);
      else creada = await R.api.novedades.crear(d);
      $("dlg-novedad").close();
      // Cada 3 llegadas tarde acumuladas la base genera una falta: avisarlo
      const falta = creada && creada.tipo === "llegada_tarde" ? await R.api.novedades.generadaPor(creada.id).catch(() => null) : null;
      if (falta) toast(`Novedad cargada. ${falta.observacion}: se registró una falta injustificada el ${fmtFecha(falta.fecha_desde)}.`, "error", 8000);
      else toast(compensa ? "Guardado como devolución de horas: se descontó de su cuenta de horas." : editando ? "Novedad actualizada." : "Novedad cargada.");
      app().refrescar();
      R.vistaFicha.refrescarSiAbierta();
    } catch (err) {
      $("novedad-error").textContent = err.message;
    } finally { $("no-guardar").disabled = false; }
  }

  async function eliminar() {
    if (!editando || !await R.util.confirmar("¿Eliminar esta novedad? No se puede deshacer.")) return;
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
    const tiposOtros = tipos.filter(t => !["dias", "registro"].includes(t.unidad) && !["llegada_tarde", "horas_extra"].includes(t.clave));
    const encabezado = ["Apellido y nombre", "DNI", "CUIL", "Sucursal", "Puesto", "Llegadas tarde (cant.)", "Llegadas tarde (min)",
      "Horas extra trabajadas en el mes 50% (h)", "Horas extra trabajadas en el mes 100% (h)", ...tiposDias.map(t => `${t.nombre} (días)`),
      ...tiposOtros.map(t => `${t.nombre} (${t.unidad === "pesos" ? "$" : t.unidad})`),
      `Horas extra liquidadas en el sueldo de ${mesTexto(mes)} 50% (h)`, `Horas extra liquidadas en el sueldo de ${mesTexto(mes)} 100% (h)`,
      "Horas extra pendientes de liquidar 50% (h, todas las fechas)", "Horas extra pendientes de liquidar 100% (h, todas las fechas)",
      `Descontado en el sueldo de ${mesTexto(mes)} — adelantos ($)`, `Descontado en el sueldo de ${mesTexto(mes)} — compras en cuenta corriente ($)`,
      "Pendiente de descontar — adelantos ($, todas las fechas)", "Pendiente de descontar — compras en cuenta corriente ($, todas las fechas)",
      "Cuenta de horas: saldo al exportar (h)", "Observaciones"];
    // Saldo de la cuenta de horas (de todo el historial, no solo del mes)
    const clavesDesc = tipos.filter(t => t.descuenta_sueldo).map(t => t.clave);
    let movsHoras = [], pendientes = [], liquidadas = [], descPend = [], descMes = [];
    try { [movsHoras, pendientes, liquidadas, descPend, descMes] = await Promise.all([R.api.novedades.deTipos(R.vistaHoras.clavesCuenta()), R.api.novedades.horasExtraPendientes(), R.api.novedades.horasExtraLiquidadas(mes + "-01"),
      R.api.novedades.descuentosPendientes(clavesDesc), R.api.novedades.descuentosDelMes(clavesDesc, mes + "-01")]); }
    catch (err) { return toast(err.message, "error", 6000); }
    const filas = app().empleadosVisibles({ inactivos: true })
      .filter(e => e.activo || resumen.has(e.id))
      .map(e => {
        const saldoHoras = Math.round(R.calc.cuentaHoras(e, movsHoras, tipos).saldo * 100) / 100;
        const montoDe = (l, clave) => l.filter(n => n.empleado_id === e.id && n.tipo === clave).reduce((a, n) => a + Number(n.cantidad || 0), 0);
        const horasDe = (l, rec) => R.calc.sumarHoras(l.filter(n => n.empleado_id === e.id && Number(n.recargo) === rec));
        const r = resumen.get(e.id) || { tardanzas: 0, minutosTarde: 0, horasExtra50: 0, horasExtra100: 0, dias: {}, otros: {} };
        const obs = lista.filter(n => n.empleado_id === e.id && n.observacion).map(n => `${app().tipo(n.tipo).nombre} ${R.util.fmtCorta(n.fecha_desde)}: ${n.observacion}`).join(" | ");
        const num = n => String(Math.round((n || 0) * 100) / 100).replace(".", ",");
        return [nombreEmpleado(e), e.dni, e.cuil, app().sucursalNombre(e.sucursal_id), e.puesto, r.tardanzas, r.minutosTarde,
          num(r.horasExtra50), num(r.horasExtra100), ...tiposDias.map(t => r.dias[t.clave] || 0),
          ...tiposOtros.map(t => num(r.otros[t.clave])), num(horasDe(liquidadas, 50)), num(horasDe(liquidadas, 100)),
          num(horasDe(pendientes, 50)), num(horasDe(pendientes, 100)),
          num(montoDe(descMes, "adelanto")), num(montoDe(descMes, "compra_cuenta_corriente")), num(montoDe(descPend, "adelanto")), num(montoDe(descPend, "compra_cuenta_corriente")),
          num(saldoHoras), obs];
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
    $("no-empleado").addEventListener("change", ajustarFormulario);
    $("no-cantidad").addEventListener("input", avisoHoras);
    $("no-hora").addEventListener("input", ajustarHora);
    $("no-hora-fin").addEventListener("input", ajustarHora);
    $("no-cantidad").addEventListener("input", () => { if (app().tipo($("no-tipo").value).clave === "horas_extra") ajustarHora(); });
    $("no-compensa").addEventListener("change", () => {
      // Al marcarlo, mostrar cómo queda la cuenta de horas
      if (!$("no-compensa").checked) { $("no-horas").hidden = true; return; }
      avisoHoras("devolucion_horas");
    });
    $("no-desde").addEventListener("change", ajustarHora);
    $("no-empleado").addEventListener("change", ajustarHora);
    $("no-recargo").addEventListener("change", () => { $("no-recargo").dataset.manual = "1"; });
    $("no-anio").addEventListener("change", () => { $("no-anio").dataset.manual = "1"; });
    $("form-novedad").addEventListener("submit", guardar);
    $("no-eliminar").addEventListener("click", eliminar);
  }

  R.vistaNovedades = { iniciar, mostrar, abrirFormulario, editar };
})(window.RRHH);
