// =====================================================================
//  Vista: Calendario. Mes completo, como Google Calendar: cada ausencia y
//  cada evento (inventario, capacitación, cierre…) es un rectángulo redondeado
//  del color de su tipo, que se estira por los días que dura. Clic en un día:
//  nuevo evento. En el celular se muestra como lista día por día.
//  Un día con dos integrantes del mismo puesto compartido de vacaciones
//  queda marcado (pasa con datos viejos; la base ya no lo deja cargar).
// =====================================================================
(function (R) {
  const { $, esc, hoy, mesActual, mesTexto, aFecha, aISO, sumarDias, diasEntre, fmtFecha, fmtCorta, nombreEmpleado, toast } = R.util;
  const app = () => R.app;
  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const COLORES = ["#e84e1b", "#c63f12", "#b3261e", "#7a4a2a", "#2f6b3a", "#3c7a89", "#1f5f8b", "#6b4a8a", "#1c1410"];
  const MAX_CARRILES = 4;   // rectángulos visibles por semana; el resto queda en "+N más"
  let mes = null, dias = new Map(), eventos = [], editandoEvento = null;

  // Color del texto sobre un fondo de color: blanco, o casi negro si el fondo es claro
  function textoSobre(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 175 ? "#1c1410" : "#fff";
  }

  const diaSemana = iso => (aFecha(iso).getUTCDay() + 6) % 7; // 0 = lunes
  const puedeCargar = () => !!R.estado.perfil;              // admin: cualquiera; encargado: su sucursal (lo controla la base)

  async function mostrar() {
    if (!mes) mes = mesActual();
    const primero = `${mes}-01`;
    const ultimo = aISO(new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)));
    const desde = sumarDias(primero, -diaSemana(primero)), hasta = sumarDias(ultimo, 6 - diaSemana(ultimo));
    $("cal-titulo").textContent = mesTexto(mes).replace(/^./, c => c.toUpperCase());
    $("cal-sub").textContent = `${app().textoSucursal()} · ausencias y eventos`;
    $("cal-grilla").innerHTML = R.util.esqueleto.calendario();

    let novedades;
    try {
      [novedades, eventos] = await Promise.all([
        R.api.novedades.entre(desde, hasta),
        R.api.eventos.entre(desde, hasta).catch(() => []),   // si falta la migración, sin eventos
      ]);
    } catch (e) { $("cal-grilla").innerHTML = ""; return toast(e.message, "error", 6000); }

    const tipos = R.estado.tipos;
    const ausencia = new Set(tipos.filter(t => t.es_ausencia).map(t => t.clave));
    const vacacion = new Set(tipos.filter(t => t.descuenta_vacaciones).map(t => t.clave));
    const verAus = $("cal-ver-ausencias").checked, verEv = $("cal-ver-eventos").checked;
    const ausencias = novedades.filter(n => ausencia.has(n.tipo) && app().esVisible(n.empleado_id));
    const f = R.estado.filtroSucursal;
    const evVisibles = eventos.filter(e => !f || !e.sucursal_id || e.sucursal_id === Number(f));

    // Días con dos integrantes de un mismo puesto compartido de vacaciones
    const choques = new Map();
    (R.estado.compartidos || []).forEach(pc => {
      const vac = novedades.filter(n => vacacion.has(n.tipo) && pc.miembros.includes(n.empleado_id));
      for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
        const quienes = [...new Set(vac.filter(n => n.fecha_desde <= d && n.fecha_hasta >= d).map(n => n.empleado_id))];
        if (quienes.length > 1) choques.set(d, `${pc.nombre}: ${quienes.map(id => nombreEmpleado(app().empleado(id))).join(" y ")} de vacaciones a la vez.`);
      }
    });

    // Armar los días
    dias = new Map();
    const hoyISO = hoy();
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      dias.set(d, {
        eventos: verEv ? evVisibles.filter(e => e.fecha_desde <= d && e.fecha_hasta >= d) : [],
        ausencias: verAus ? ausencias.filter(n => n.fecha_desde <= d && n.fecha_hasta >= d)
          .sort((a, b) => nombreEmpleado(app().empleado(a.empleado_id)).localeCompare(nombreEmpleado(app().empleado(b.empleado_id)))) : [],
        feriado: R.estado.feriados.find(x => x.fecha === d),
        bloqueo: (R.estado.periodos || []).find(p => p.fecha_desde <= d && p.fecha_hasta >= d && (!p.sucursal_id || !f || p.sucursal_id === Number(f))),
      });
    }

    // Cada evento y cada ausencia es una pieza: un rectángulo de color que se estira por los días que dura
    const rango = (a, b) => a === b ? fmtFecha(a) : fmtCorta(a) + " al " + fmtCorta(b);
    const piezas = [
      ...(verEv ? evVisibles.map(e => ({
        desde: e.fecha_desde, hasta: e.fecha_hasta, color: e.color, orden: 0, texto: e.titulo, dato: `data-evento="${e.id}"`,
        ayuda: `${e.titulo} · ${rango(e.fecha_desde, e.fecha_hasta)}${e.sucursal_id ? " · " + app().sucursalNombre(e.sucursal_id) : " · todas las sucursales"}${e.descripcion ? " — " + e.descripcion : ""}`,
      })) : []),
      ...(verAus ? ausencias.map(n => {
        const emp = app().empleado(n.empleado_id), t = app().tipo(n.tipo), dura = n.fecha_hasta !== n.fecha_desde;
        const quien = emp ? `${emp.apellido}${emp.nombre ? " " + emp.nombre[0] + "." : ""}` : "?";
        return { desde: n.fecha_desde, hasta: n.fecha_hasta, color: t.color, orden: 1, texto: dura ? `${quien} · ${t.nombre}` : quien, dato: `data-empleado="${n.empleado_id}"`,
          ayuda: `${nombreEmpleado(emp)} · ${t.nombre} · ${rango(n.fecha_desde, n.fecha_hasta)}${emp ? " · " + app().sucursalNombre(emp.sucursal_id) : ""}` };
      }) : []),
    ].sort((a, b) => a.desde.localeCompare(b.desde) || b.hasta.localeCompare(a.hasta) || a.orden - b.orden || a.texto.localeCompare(b.texto));

    const boton = (p, clases = "", estilo = "") => `<button type="button" class="cal-barra ${clases}" style="--c:${esc(p.color)}; --t:${textoSobre(p.color)}${estilo}" ${p.dato} data-info="${esc(p.ayuda)}">${esc(p.texto)}</button>`;

    // Una semana: los 7 días de fondo y, encima, las piezas acomodadas en carriles (como Google Calendar)
    const semana = inicio => {
      const fin = sumarDias(inicio, 6);
      const segmentos = piezas.filter(p => p.desde <= fin && p.hasta >= inicio).map((p, idx) => {
        const a = p.desde < inicio ? inicio : p.desde, b = p.hasta > fin ? fin : p.hasta;
        return { p, idx, col: diasEntre(inicio, a), largo: diasEntre(a, b), izq: p.desde < inicio, der: p.hasta > fin };
      }).sort((x, y) => x.col - y.col || y.largo - x.largo || x.idx - y.idx);
      const ocupado = [];   // último día (columna) ocupado de cada carril
      segmentos.forEach(s => {
        let c = ocupado.findIndex(fin => fin < s.col);
        if (c < 0) c = ocupado.length;
        ocupado[c] = s.col + s.largo - 1;
        s.carril = c;
      });
      const carriles = Math.max(3, Math.min(MAX_CARRILES, ocupado.length));
      const ocultas = Array(8).fill(0);
      segmentos.filter(s => s.carril >= MAX_CARRILES).forEach(s => { for (let c = s.col; c < s.col + s.largo; c++) ocultas[c]++; });

      const celdas = Array.from({ length: 7 }, (_, c) => {
        const d = sumarDias(inicio, c), x = dias.get(d);
        const clases = ["cal-dia", d.slice(0, 7) !== mes ? "fuera" : "", d === hoyISO ? "hoy" : "", c >= 5 ? "finde" : "",
          choques.has(d) ? "choque" : "", x.bloqueo ? "bloqueado" : ""].filter(Boolean).join(" ");
        // Vacaciones cargadas dentro de un período bloqueado (se cargaron antes de bloquearlo)
        const vacAdentro = x.bloqueo && x.ausencias.some(n => vacacion.has(n.tipo));
        const ayuda = [choques.get(d), x.bloqueo ? `Sin vacaciones del ${fmtFecha(x.bloqueo.fecha_desde)} al ${fmtFecha(x.bloqueo.fecha_hasta)}${x.bloqueo.motivo ? " (" + x.bloqueo.motivo + ")" : ""}${x.bloqueo.sucursal_id ? " · " + app().sucursalNombre(x.bloqueo.sucursal_id) : ""}.${vacAdentro ? " Hay vacaciones cargadas antes del bloqueo." : ""}` : ""].filter(Boolean).join(" ");
        return `<div class="${clases}${vacAdentro ? " vac-adentro" : ""}" data-fecha="${d}" style="grid-column:${c + 1}" ${ayuda ? `data-info="${esc(ayuda)}"` : ""}>
          <div class="cal-num"><span>${Number(d.slice(8))}</span>${x.feriado ? `<span class="cal-feriado" title="${esc(x.feriado.descripcion)}">${esc(x.feriado.descripcion)}</span>` : ""}</div></div>`;
      }).join("");
      const barras = segmentos.filter(s => s.carril < MAX_CARRILES)
        .map(s => boton(s.p, `${s.izq ? "corta-izq " : ""}${s.der ? "corta-der" : ""}`, `; grid-row:${s.carril + 2}; grid-column:${s.col} / span ${s.largo}`)).join("");
      const mas = ocultas.map((n, c) => n ? `<button type="button" class="cal-mas" data-dia="${sumarDias(inicio, c - 1)}" style="grid-row:${carriles + 2}; grid-column:${c}">+${n} más</button>` : "").join("");
      return `<div class="cal-semana" style="--carriles:${carriles}">${celdas}${barras}${mas}</div>`;
    };
    const semanas = [];
    for (let d = desde; d <= hasta; d = sumarDias(d, 7)) semanas.push(semana(d));

    // En el celular no entra una grilla de 7 columnas: se muestra una lista día por día
    const agenda = [...dias.entries()].filter(([d, x]) => d.slice(0, 7) === mes && (x.eventos.length || x.ausencias.length || x.feriado)).map(([d, x]) => {
      const deldia = piezas.filter(p => p.desde <= d && p.hasta >= d);
      return `<div class="cal-ag-dia${d === hoyISO ? " hoy" : ""}${choques.has(d) ? " choque" : ""}">
        <div class="cal-ag-fecha"><strong>${Number(d.slice(8))}</strong><span>${DIAS[diaSemana(d)]}</span></div>
        <div class="cal-ag-items">${x.feriado ? `<span class="cal-feriado">Feriado: ${esc(x.feriado.descripcion)}</span>` : ""}${choques.has(d) ? `<span class="cal-feriado">${esc(choques.get(d))}</span>` : ""}${deldia.map(p => boton(p)).join("")}</div>
      </div>`;
    }).join("") || `<div class="cal-ag-vacio">No hay nada cargado en ${esc(mesTexto(mes))}.</div>`;

    $("cal-grilla").innerHTML = `<div class="cal-vista-grilla"><div class="cal-cabecera">${DIAS.map(n => `<div>${n}</div>`).join("")}</div><div class="cal-mes">${semanas.join("")}</div></div><div class="cal-agenda">${agenda}</div>`;

    // Leyenda: los tipos que aparecen este mes
    const usados = [...new Set(ausencias.map(n => n.tipo))].map(c => app().tipo(c));
    $("cal-leyenda").innerHTML = usados.map(t => `<span class="chip" style="--c:${esc(t.color)}">${esc(t.nombre)}</span>`).join("") +
      (evVisibles.length ? `<span class="chip chip-evento">Eventos</span>` : "") +
      ([...dias.values()].some(x => x.bloqueo) ? `<span class="chip chip-bloqueo">Sin vacaciones</span>` : "") +
      (choques.size ? `<span class="chip chip-choque">Puesto compartido con dos de vacaciones</span>` : "");
  }

  // ---------- Detalle de un día ----------
  function abrirDia(d) {
    const x = dias.get(d);
    if (!x) return;
    $("dia-titulo").textContent = `${DIAS_LARGOS[diaSemana(d)].replace(/^./, c => c.toUpperCase())} ${fmtFecha(d)}`;
    const lista = [
      ...x.eventos.map(e => `<li class="clic" data-evento="${e.id}"><span><span class="chip" style="--c:${esc(e.color)}">${esc(e.titulo)}</span>${e.descripcion ? `<br><small>${esc(e.descripcion)}</small>` : ""}</span><small>${e.sucursal_id ? esc(app().sucursalNombre(e.sucursal_id)) : "Todas"}</small></li>`),
      ...x.ausencias.map(n => { const emp = app().empleado(n.empleado_id), t = app().tipo(n.tipo);
        return `<li class="clic" data-empleado="${n.empleado_id}"><span>${esc(nombreEmpleado(emp))}<br><small>${esc(app().sucursalNombre(emp && emp.sucursal_id))} · ${fmtCorta(n.fecha_desde)}${n.fecha_hasta !== n.fecha_desde ? " al " + fmtCorta(n.fecha_hasta) : ""}</small></span>${app().chipTipo(n.tipo)}</li>`; }),
    ];
    $("dia-cuerpo").innerHTML = `${x.feriado ? `<p class="hint">Feriado: ${esc(x.feriado.descripcion)}</p>` : ""}
      <ul class="lista-simple">${lista.join("") || `<li class="vacio">Nada cargado este día.</li>`}</ul>
      <div class="dlg-pie"><button type="button" class="btn-sec primario" data-nuevo-evento="${d}">Agregar evento este día</button></div>`;
    if (!$("dlg-dia").open) $("dlg-dia").showModal();
  }

  // ---------- Eventos ----------
  function pintarColores(sel) {
    $("evt-colores").innerHTML = COLORES.map(c => `<label class="color-op"><input type="radio" name="evt-color" value="${c}" ${c === sel ? "checked" : ""}><span style="background:${c}" aria-label="${c}"></span></label>`).join("") +
      `<label class="color-op color-libre" title="Otro color"><input type="radio" name="evt-color" value="otro" ${COLORES.includes(sel) ? "" : "checked"}><input type="color" id="evt-color-libre" value="${COLORES.includes(sel) ? "#7a4a2a" : sel}" aria-label="Elegir otro color"></label>`;
  }
  const colorElegido = () => {
    const r = document.querySelector('input[name="evt-color"]:checked');
    return !r || r.value === "otro" ? $("evt-color-libre").value : r.value;
  };

  function abrirEvento(datos = {}) {
    editandoEvento = datos.id ? datos : null;
    const esAdmin = app().esAdmin(), miSuc = R.estado.perfil && R.estado.perfil.sucursal_id;
    $("dlg-evento-titulo").textContent = editandoEvento ? "Editar evento" : "Nuevo evento";
    $("evt-titulo").value = datos.titulo || "";
    $("evt-desde").value = datos.fecha_desde || hoy();
    $("evt-hasta").value = datos.fecha_hasta || datos.fecha_desde || hoy();
    $("evt-descripcion").value = datos.descripcion || "";
    pintarColores(datos.color || COLORES[0]);
    $("evt-sucursal").innerHTML = (esAdmin ? `<option value="">Todas las sucursales</option>` : "") +
      R.estado.sucursales.filter(s => s.activa && (esAdmin || s.id === miSuc)).map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
    $("evt-sucursal").value = datos.id ? (datos.sucursal_id || "") : esAdmin ? (R.estado.filtroSucursal || "") : String(miSuc || "");
    $("evt-sucursal").disabled = !esAdmin;
    $("evt-eliminar").hidden = !editandoEvento;
    $("evento-error").textContent = "";
    $("dlg-evento").showModal();
    $("evt-titulo").focus();
  }

  async function guardarEvento(ev) {
    ev.preventDefault();
    $("evento-error").textContent = "";
    const d = { titulo: $("evt-titulo").value.trim(), descripcion: $("evt-descripcion").value.trim(),
      fecha_desde: $("evt-desde").value, fecha_hasta: $("evt-hasta").value || $("evt-desde").value,
      color: colorElegido(), sucursal_id: Number($("evt-sucursal").value) || null };
    if (d.fecha_hasta < d.fecha_desde) return ($("evento-error").textContent = "La fecha \"hasta\" no puede ser anterior a \"desde\".");
    $("evt-guardar").disabled = true;
    try {
      if (editandoEvento) await R.api.eventos.actualizar(editandoEvento.id, d); else await R.api.eventos.crear(d);
      $("dlg-evento").close();
      if ($("dlg-dia").open) $("dlg-dia").close();
      toast(editandoEvento ? "Evento actualizado." : "Evento agregado.");
      mes = d.fecha_desde.slice(0, 7);
      mostrar();
    } catch (err) { $("evento-error").textContent = err.message; }
    finally { $("evt-guardar").disabled = false; }
  }

  async function eliminarEvento() {
    if (!editandoEvento || !await R.util.confirmar(`¿Eliminar el evento "${editandoEvento.titulo}"?`)) return;
    try {
      await R.api.eventos.eliminar(editandoEvento.id);
      $("dlg-evento").close();
      if ($("dlg-dia").open) $("dlg-dia").close();
      toast("Evento eliminado.");
      mostrar();
    } catch (err) { $("evento-error").textContent = err.message; }
  }

  function clic(e) {
    const ev = e.target.closest("[data-evento]");
    if (ev) { const x = eventos.find(y => y.id === Number(ev.dataset.evento)); if (x) abrirEvento(x); return; }
    const emp = e.target.closest("[data-empleado]");
    if (emp) { if ($("dlg-dia").open) $("dlg-dia").close(); return R.vistaFicha.abrir(Number(emp.dataset.empleado)); }
    const mas = e.target.closest("[data-dia]");
    if (mas) return abrirDia(mas.dataset.dia);
    const nuevo = e.target.closest("[data-nuevo-evento]");
    if (nuevo) return abrirEvento({ fecha_desde: nuevo.dataset.nuevoEvento });
    const dia = e.target.closest(".cal-dia");
    if (dia && puedeCargar()) abrirEvento({ fecha_desde: dia.dataset.fecha });
  }

  function iniciar() {
    const mover = n => { const [a, m] = (mes || mesActual()).split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); mes = aISO(d).slice(0, 7); mostrar(); };
    $("cal-anterior").addEventListener("click", () => mover(-1));
    $("cal-siguiente").addEventListener("click", () => mover(1));
    $("cal-hoy").addEventListener("click", () => { mes = mesActual(); mostrar(); });
    $("cal-nuevo-evento").addEventListener("click", () => abrirEvento({ fecha_desde: mes === mesActual() ? hoy() : `${mes}-01` }));
    $("cal-ver-ausencias").addEventListener("change", mostrar);
    $("cal-ver-eventos").addEventListener("change", mostrar);
    $("cal-grilla").addEventListener("click", clic);
    $("dia-cuerpo").addEventListener("click", clic);
    $("form-evento").addEventListener("submit", guardarEvento);
    $("evt-eliminar").addEventListener("click", eliminarEvento);
    $("evt-desde").addEventListener("change", () => { if (!$("evt-hasta").value || $("evt-hasta").value < $("evt-desde").value) $("evt-hasta").value = $("evt-desde").value; });
    $("evt-colores").addEventListener("input", e => { if (e.target.id === "evt-color-libre") document.querySelector('input[name="evt-color"][value="otro"]').checked = true; });
  }

  R.vistaCalendario = { iniciar, mostrar };
})(window.RRHH);
