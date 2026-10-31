// =====================================================================
//  Cálculos de RRHH (sin pantalla): vacaciones por antigüedad, resumen
//  de novedades de un período y quién está ausente un día.
// =====================================================================
(function (R) {
  const { aFecha, diasEntre, solapamiento } = R.util;

  // Días de vacaciones del período `anio` según la LCT (art. 150 y 153).
  // La antigüedad se mide al 31/12 de ese año. Días corridos.
  function vacacionesCorresponden(fechaIngreso, anio) {
    if (!fechaIngreso) return null;
    const fin = `${anio}-12-31`;
    if (fechaIngreso > fin) return 0;
    // Menos de 6 meses trabajados en el año: 1 día cada 20 días de trabajo.
    // Se aproxima con 6 días de trabajo por semana; corregir con un ajuste si hace falta.
    if (fechaIngreso > `${anio}-06-30`) {
      return Math.floor(diasEntre(fechaIngreso, fin) * 6 / 7 / 20);
    }
    const anios = (aFecha(fin) - aFecha(fechaIngreso)) / (365.25 * 86400000);
    if (anios <= 5) return 14;
    if (anios <= 10) return 21;
    if (anios <= 20) return 28;
    return 35;
  }

  // Antigüedad legible a una fecha: "3 años y 2 meses"
  function antiguedad(fechaIngreso, hastaISO) {
    if (!fechaIngreso || fechaIngreso > hastaISO) return "—";
    const [a1, m1, d1] = fechaIngreso.split("-").map(Number);
    const [a2, m2, d2] = hastaISO.split("-").map(Number);
    let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
    const anios = Math.floor(meses / 12); meses %= 12;
    const partes = [];
    if (anios) partes.push(`${anios} ${anios === 1 ? "año" : "años"}`);
    if (meses) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
    return partes.join(" y ") || "menos de un mes";
  }

  // Horas redondeadas al minuto: en la planilla 0,33 significa 20 min, y sumadas sin redondear
  // tres de esas darían 0,99 h. Todas las sumas de horas pasan por acá.
  const enHoras = c => Math.round((Number(c) || 0) * 60) / 60;
  const sumarHoras = lista => lista.reduce((a, n) => a + enHoras(n.cantidad), 0);

  // Resumen de novedades por empleado dentro de [desde, hasta].
  // Devuelve Map(empleado_id -> { tardanzas, minutosTarde, horasExtra, horasExtra50, horasExtra100, dias: {tipo: n}, diasAusente })
  function resumirNovedades(novedades, desde, hasta, tipos) {
    const porTipo = new Map(tipos.map(t => [t.clave, t]));
    const res = new Map();
    const de = id => {
      if (!res.has(id)) res.set(id, { tardanzas: 0, minutosTarde: 0, horasExtra: 0, horasExtra50: 0, horasExtra100: 0, dias: {}, diasAusente: 0, otros: {} });
      return res.get(id);
    };
    for (const n of novedades) {
      const t = porTipo.get(n.tipo);
      if (!t) continue;
      const r = de(n.empleado_id);
      if (t.unidad === "dias") {
        const d = solapamiento(n.fecha_desde, n.fecha_hasta, desde, hasta);
        if (!d) continue;
        r.dias[n.tipo] = (r.dias[n.tipo] || 0) + d;
        if (t.es_ausencia) r.diasAusente += d;
      } else {
        if (n.fecha_desde < desde || n.fecha_desde > hasta) continue;
        const c = Number(n.cantidad) || 0;
        if (n.tipo === "llegada_tarde") { r.tardanzas++; r.minutosTarde += c; }
        else if (n.tipo === "horas_extra") {
          const h = enHoras(c);
          r.horasExtra += h;
          if (Number(n.recargo) === 100) r.horasExtra100 += h; else r.horasExtra50 += h;
        } else {
          r.otros[n.tipo] = (r.otros[n.tipo] || 0) + c;
        }
      }
    }
    return res;
  }

  // Saldo de vacaciones de un empleado para el período `anio`
  // tomados = todos los días cargados del período (los ya gozados + los programados a futuro)
  function saldoVacaciones(empleado, anio, novedades, ajustes, tipos, hoyISO = R.util.hoy()) {
    const descuentan = new Set(tipos.filter(t => t.descuenta_vacaciones).map(t => t.clave));
    const corresponden = vacacionesCorresponden(empleado.fecha_ingreso, anio);
    const goces = novedades.filter(n => n.empleado_id === empleado.id && descuentan.has(n.tipo) && Number(n.anio_vacaciones) === anio);
    const tomados = goces.reduce((s, n) => s + Number(n.cantidad || 0), 0);
    const gozados = goces.reduce((s, n) => s + solapamiento(n.fecha_desde, n.fecha_hasta, "1900-01-01", hoyISO), 0);
    const programados = tomados - gozados;
    const ajuste = ajustes
      .filter(a => a.empleado_id === empleado.id && Number(a.anio) === anio)
      .reduce((s, a) => s + Number(a.dias || 0), 0);
    const saldo = corresponden === null ? null : corresponden + ajuste - tomados;
    return { corresponden, tomados, gozados, programados, ajuste, saldo };
  }

  // ---------- Cuenta corriente de horas ----------
  const JORNADA_POR_DEFECTO = 8;
  // Horas que representa una novedad: horas tal cual, minutos /60, días × jornada del empleado
  function horasDeNovedad(n, tipo, empleado) {
    const c = Number(n.cantidad) || 0;
    if (tipo.unidad === "horas") return enHoras(c);
    if (tipo.unidad === "minutos") return c / 60;
    return c * (Number(empleado && empleado.jornada_horas) || JORNADA_POR_DEFECTO);
  }

  // Saldo de horas de un empleado: positivo = debe horas; negativo = tiene horas a favor
  function cuentaHoras(empleado, novedades, tipos) {
    const porTipo = new Map(tipos.map(t => [t.clave, t]));
    let adeudadas = 0, devueltas = 0;
    const movimientos = [];
    for (const n of novedades) {
      const t = porTipo.get(n.tipo);
      if (n.empleado_id !== empleado.id || !t || !Number(t.cuenta_horas)) continue;
      const h = horasDeNovedad(n, t, empleado);
      if (Number(t.cuenta_horas) > 0) adeudadas += h; else devueltas += h;
      movimientos.push({ novedad: n, horas: h * Number(t.cuenta_horas) });
    }
    movimientos.sort((a, b) => a.novedad.fecha_desde.localeCompare(b.novedad.fecha_desde));
    let acumulado = 0;
    movimientos.forEach(m => { acumulado += m.horas; m.saldo = acumulado; });
    // Deudas que todavía se deben: cada devolución cancela primero las deudas más viejas (como en la planilla)
    let porCancelar = enHoras(devueltas);
    const pendientes = movimientos.filter(m => m.horas > 0).map(m => {
      const aplicado = Math.min(m.horas, porCancelar); porCancelar -= aplicado;
      return { novedad: m.novedad, original: m.horas, pendiente: m.horas - aplicado };
    }).filter(p => p.pendiente > 0.005);
    return { adeudadas, devueltas, saldo: adeudadas - devueltas, movimientos, pendientes };
  }

  // 2,5 h -> "2 h 30 min"; para mostrar saldos de la cuenta
  function fmtHoras(h) {
    const min = Math.round(Math.abs(h) * 60);
    const hh = Math.floor(min / 60), mm = min % 60;
    if (!hh && !mm) return "0 h";
    return [hh ? `${hh} h` : "", mm ? `${mm} min` : ""].filter(Boolean).join(" ");
  }

  // ---------- Montos, cantidades y horarios ----------
  const fmtPesos = n => "$ " + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  // Cantidad de una novedad en su unidad: "3 días", "25 min", "4 h · 100%", "$ 15.000" o "—"
  function cantidadTexto(n, tipo) {
    const c = Number(n.cantidad) || 0;
    switch (tipo.unidad) {
      case "minutos": return R.util.fmtMinutos(c);
      case "horas": return `${fmtHoras(c)}${n.recargo ? ` · ${n.recargo}%` : ""}`;
      case "pesos": return fmtPesos(c);
      case "registro": return "—";
      default: return `${R.util.fmtNum(c)} ${c === 1 ? "día" : "días"}`;
    }
  }

  // "09:34:00" -> minutos desde las 00:00
  const aMinutos = h => { if (!h) return null; const [a, b] = String(h).split(":").map(Number); return a * 60 + (b || 0); };
  const HORA_ENTRADA_POR_DEFECTO = "09:00";
  // Hora de entrada de un empleado: la suya, si no la de su sucursal, si no 09:00 (igual que la base)
  function horaEntrada(empleado) {
    if (empleado && empleado.hora_entrada) return { hora: empleado.hora_entrada.slice(0, 5), origen: "propia" };
    const s = empleado && R.estado && (R.estado.sucursales || []).find(x => x.id === empleado.sucursal_id);
    if (s && s.hora_entrada) return { hora: s.hora_entrada.slice(0, 5), origen: "sucursal " + s.nombre };
    return { hora: HORA_ENTRADA_POR_DEFECTO, origen: "por defecto" };
  }
  function minutosTarde(horaLlegada, empleado) {
    const llegada = aMinutos(horaLlegada), entrada = aMinutos(horaEntrada(empleado).hora);
    return llegada == null ? null : Math.max(0, llegada - entrada);
  }
  // Horas entre dos horarios ("16:00" → "20:20" = 4,33 h); cruza la medianoche si hace falta
  function horasEntre(desde, hasta) {
    const a = aMinutos(desde), b = aMinutos(hasta);
    if (a == null || b == null) return null;
    return ((b - a + 1440) % 1440) / 60;
  }

  // Horas extra: 100% los domingos, feriados y sábados desde las 13; 50% el resto (LCT art. 201)
  function recargoSugerido(fechaISO, hora, feriados) {
    const dia = new Date(fechaISO + "T00:00:00Z").getUTCDay(); // 0 domingo, 6 sábado
    if (dia === 0 || (feriados || []).some(f => f.fecha === fechaISO)) return 100;
    if (dia === 6 && aMinutos(hora) != null && aMinutos(hora) >= 13 * 60) return 100;
    return 50;
  }

  // ---------- Revisión de horas extra ----------
  // Devuelve Map(id -> [motivos]) con las cargas que conviene revisar antes de liquidar:
  //  · repetidas (mismo empleado, día, hora y cantidad)
  //  · más de una carga el mismo día
  //  · una carga "agrupada" que nombra días (dd/mm) que también están cargados aparte
  //  · una carga "x N sábados" cuando ese mes ya hay sábados cargados aparte
  //  · sábado desde las 13, domingo o feriado al 50%
  function revisarHorasExtra(lista, feriados) {
    const res = new Map();
    const marcar = (id, m) => { if (!res.has(id)) res.set(id, []); if (!res.get(id).includes(m)) res.get(id).push(m); };
    const fmt = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
    const esSabado = iso => new Date(iso + "T00:00:00Z").getUTCDay() === 6;
    const delEmpleado = new Map();
    lista.forEach(n => { if (!delEmpleado.has(n.empleado_id)) delEmpleado.set(n.empleado_id, []); delEmpleado.get(n.empleado_id).push(n); });
    for (const propias of delEmpleado.values()) {
      for (const n of propias) {
        const mismoDia = propias.filter(o => o.id !== n.id && o.fecha_desde === n.fecha_desde);
        if (mismoDia.some(o => o.hora === n.hora && Number(o.cantidad) === Number(n.cantidad))) marcar(n.id, "Repetida: hay otra carga igual el mismo día.");
        else if (mismoDia.length) marcar(n.id, `Hay ${mismoDia.length + 1} cargas el ${fmt(n.fecha_desde)}: revisar que no se superpongan.`);
        const obs = n.observacion || "";
        const dias = [...obs.matchAll(/(\d{1,2})\/(\d{1,2})/g)]
          .map(m => `${n.fecha_desde.slice(0, 4)}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`)
          .filter(d => d !== n.fecha_desde && propias.some(o => o.id !== n.id && o.fecha_desde === d));
        if (dias.length) {
          marcar(n.id, `Incluye días que también están cargados aparte (${dias.map(fmt).join(", ")}): posible doble carga.`);
          propias.filter(o => dias.includes(o.fecha_desde)).forEach(o => marcar(o.id, `También está sumada en la carga del ${fmt(n.fecha_desde)} ("${obs.split(/\r?\n/)[0].trim().slice(0, 40)}").`));
        }
        if (/s[aá]b/i.test(obs) && /\d/.test(obs)) {
          const mes = n.fecha_desde.slice(0, 7);
          const sabados = propias.filter(o => o.id !== n.id && o.fecha_desde.startsWith(mes) && esSabado(o.fecha_desde) && o.fecha_desde <= n.fecha_desde && !/s[aá]b/i.test(o.observacion || ""));
          if (sabados.length) {
            marcar(n.id, `Suma varios sábados, y ese mes también hay sábados cargados aparte (${[...new Set(sabados.map(o => fmt(o.fecha_desde)))].join(", ")}): posible doble carga.`);
            sabados.forEach(o => marcar(o.id, `Puede estar incluida en la carga de sábados del ${fmt(n.fecha_desde)}.`));
          }
        }
        if (Number(n.recargo) === 50 && recargoSugerido(n.fecha_desde, n.hora, feriados) === 100) marcar(n.id, "Domingo, feriado o sábado desde las 13 cargado al 50%.");
      }
    }
    return res;
  }

  // ---------- Asistencia: horarios, llegadas tarde y minutos a favor ----------
  const HORARIO_POR_DEFECTO = { entrada: "09:00", salida: "18:00", extraEntrada: 30, extraSalida: 10, modo: "todo" };
  const hhmm = h => (h ? String(h).slice(0, 5) : null);

  // Horario de un empleado. Entrada y salida: las suyas, si no las de su sucursal, si no las de por defecto.
  // Umbrales: los suyos, si no los generales (Configuración → Horarios y minutos a favor).
  function horarioDe(empleado, estado = R.estado) {
    const suc = empleado && ((estado && estado.sucursales) || []).find(x => x.id === empleado.sucursal_id);
    const gen = (estado && estado.horarios) || {};
    const num = (a, b, c) => [a, b, c].find(v => v !== null && v !== undefined && v !== "" && !isNaN(Number(v)));
    return {
      entrada: hhmm(empleado && empleado.hora_entrada) || hhmm(suc && suc.hora_entrada) || HORARIO_POR_DEFECTO.entrada,
      salida: hhmm(empleado && empleado.hora_salida) || hhmm(suc && suc.hora_salida) || HORARIO_POR_DEFECTO.salida,
      extraEntrada: Number(num(empleado && empleado.extra_entrada_min, gen.extra_entrada_min, HORARIO_POR_DEFECTO.extraEntrada)),
      extraSalida: Number(num(empleado && empleado.extra_salida_min, gen.extra_salida_min, HORARIO_POR_DEFECTO.extraSalida)),
      modo: gen.modo_extra || HORARIO_POR_DEFECTO.modo,
      propio: !!(empleado && (empleado.hora_entrada || empleado.hora_salida || empleado.extra_entrada_min != null || empleado.extra_salida_min != null)),
    };
  }

  // Minutos de un día a partir de lo que marcó el empleado:
  //  · tarde: minutos que llegó después de su hora de entrada.
  //  · extraEntrada: si llegó 'extraEntrada' minutos o más ANTES de su hora de entrada, esos minutos
  //    (desde que llegó hasta la hora de entrada de la jornada común).
  //  · extraSalida: si salió 'extraSalida' minutos o más DESPUÉS de su hora de salida, esos minutos.
  //  En modo "todo" se cuentan todos los minutos una vez superado el umbral; en "excedente", solo los que lo pasan.
  function minutosAsistencia(entrada, salida, horario) {
    const e = aMinutos(entrada), sa = aMinutos(salida), he = aMinutos(horario.entrada), hs = aMinutos(horario.salida);
    const contar = (min, umbral) => min >= umbral && min > 0 ? (horario.modo === "excedente" ? min - umbral : min) : 0;
    const tarde = e != null ? Math.max(0, e - he) : 0;
    const extraEntrada = e != null ? contar(Math.max(0, he - e), horario.extraEntrada) : 0;
    const extraSalida = sa != null ? contar(Math.max(0, sa - hs), horario.extraSalida) : 0;
    return { tarde, extraEntrada, extraSalida, aFavor: extraEntrada + extraSalida };
  }

  // ---------- Planilla de saldos de cuenta corriente (reporte del sistema de gestión) ----------
  // "160,752.94" (o "1.234,56") -> 160752.94
  const numeroDeReporte = s => {
    let t = String(s == null ? "" : s).trim();
    if (!t) return NaN;
    t = /^-?\d{1,3}(\.\d{3})*,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    return Number(t);
  };
  // Filas de la hoja -> { filas: [{ codigo, nombre, saldo }], total } (total = el "Total General" de la planilla, para controlar la suma)
  function leerSaldosCuentaCorriente(hoja) {
    const cab = hoja.findIndex(f => f.some(c => /saldo\s+actual/i.test(String(c))));
    if (cab < 0) throw new Error('No parece la planilla de saldos: falta la columna "Saldo Actual".');
    const colSaldo = hoja[cab].findIndex(c => /saldo\s+actual/i.test(String(c)));
    const filas = []; let total = null;
    for (const f of hoja.slice(cab + 1)) {
      const codigo = String(f[0] == null ? "" : f[0]).trim(), nombre = String(f[2] == null ? "" : f[2]).trim(), saldo = numeroDeReporte(f[colSaldo]);
      if (/^total/i.test(codigo) && !isNaN(saldo)) total = saldo;
      else if (/^\d+$/.test(codigo) && nombre && !isNaN(saldo)) filas.push({ codigo, nombre, saldo: Math.round(saldo * 100) / 100 });
    }
    return { filas, total };
  }
  // A qué empleado corresponde una fila: por número de cliente; si no, por nombre (sin importar el orden ni las tildes).
  // via: "codigo" | "nombre" (seguro) | "dudoso" (hay que elegir) | "ninguno"
  const palabras = s => R.util.norm(s).replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  function emparejarEmpleado(fila, empleados) {
    const porCodigo = empleados.find(e => e.codigo_cliente && String(e.codigo_cliente).trim() === fila.codigo);
    if (porCodigo) return { via: "codigo", empleado: porCodigo, candidatos: [] };
    const clave = ps => [...ps].sort().join(" "), pf = palabras(fila.nombre);
    const iguales = empleados.filter(e => clave(palabras(e.apellido + " " + e.nombre)) === clave(pf));
    if (iguales.length === 1 && !iguales[0].codigo_cliente) return { via: "nombre", empleado: iguales[0], candidatos: [] };
    if (iguales.length) return { via: "dudoso", empleado: null, candidatos: iguales };
    const parecidos = empleados.filter(e => palabras(e.apellido + " " + e.nombre).filter(p => pf.includes(p)).length >= 2);
    return { via: parecidos.length ? "dudoso" : "ninguno", empleado: null, candidatos: parecidos };
  }

  // Período sin vacaciones que toca [desde, hasta] para un empleado (general o de su sucursal)
  function periodoBloqueado(desde, hasta, empleado) {
    return (R.estado && R.estado.periodos || []).find(p => (!p.sucursal_id || (empleado && p.sucursal_id === empleado.sucursal_id))
      && p.fecha_desde <= hasta && p.fecha_hasta >= desde) || null;
  }

  // Período vacacional por defecto de una fecha (enero-abril -> año anterior)
  const anioVacacionesDe = iso => Number(iso.slice(0, 4)) - (Number(iso.slice(5, 7)) <= 4 ? 1 : 0);

  // Novedades de ausencia que cubren el día `iso`
  function ausentesEn(iso, novedades, tipos) {
    const ausencia = new Set(tipos.filter(t => t.es_ausencia).map(t => t.clave));
    return novedades.filter(n => ausencia.has(n.tipo) && n.fecha_desde <= iso && n.fecha_hasta >= iso);
  }

  R.calc = { vacacionesCorresponden, antiguedad, resumirNovedades, saldoVacaciones, anioVacacionesDe, ausentesEn,
    horasDeNovedad, cuentaHoras, fmtHoras, JORNADA_POR_DEFECTO,
    fmtPesos, cantidadTexto, minutosTarde, recargoSugerido, HORA_ENTRADA_POR_DEFECTO,
    enHoras, sumarHoras, horaEntrada, horasEntre, revisarHorasExtra, periodoBloqueado,
    HORARIO_POR_DEFECTO, horarioDe, minutosAsistencia, leerSaldosCuentaCorriente, emparejarEmpleado };
})(window.RRHH);
