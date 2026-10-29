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
          r.horasExtra += c;
          if (Number(n.recargo) === 100) r.horasExtra100 += c; else r.horasExtra50 += c;
        } else {
          r.otros[n.tipo] = (r.otros[n.tipo] || 0) + c;
        }
      }
    }
    return res;
  }

  // Saldo de vacaciones de un empleado para el período `anio`
  function saldoVacaciones(empleado, anio, novedades, ajustes, tipos) {
    const descuentan = new Set(tipos.filter(t => t.descuenta_vacaciones).map(t => t.clave));
    const corresponden = vacacionesCorresponden(empleado.fecha_ingreso, anio);
    const tomados = novedades
      .filter(n => n.empleado_id === empleado.id && descuentan.has(n.tipo) && Number(n.anio_vacaciones) === anio)
      .reduce((s, n) => s + Number(n.cantidad || 0), 0);
    const ajuste = ajustes
      .filter(a => a.empleado_id === empleado.id && Number(a.anio) === anio)
      .reduce((s, a) => s + Number(a.dias || 0), 0);
    const saldo = corresponden === null ? null : corresponden + ajuste - tomados;
    return { corresponden, tomados, ajuste, saldo };
  }

  // ---------- Cuenta corriente de horas ----------
  const JORNADA_POR_DEFECTO = 8;
  // Horas que representa una novedad: horas tal cual, minutos /60, días × jornada del empleado
  function horasDeNovedad(n, tipo, empleado) {
    const c = Number(n.cantidad) || 0;
    if (tipo.unidad === "horas") return c;
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
    return { adeudadas, devueltas, saldo: adeudadas - devueltas, movimientos };
  }

  // 2,5 h -> "2 h 30 min"; para mostrar saldos de la cuenta
  function fmtHoras(h) {
    const min = Math.round(Math.abs(h) * 60);
    const hh = Math.floor(min / 60), mm = min % 60;
    if (!hh && !mm) return "0 h";
    return [hh ? `${hh} h` : "", mm ? `${mm} min` : ""].filter(Boolean).join(" ");
  }

  // Período vacacional por defecto de una fecha (enero-abril -> año anterior)
  const anioVacacionesDe = iso => Number(iso.slice(0, 4)) - (Number(iso.slice(5, 7)) <= 4 ? 1 : 0);

  // Novedades de ausencia que cubren el día `iso`
  function ausentesEn(iso, novedades, tipos) {
    const ausencia = new Set(tipos.filter(t => t.es_ausencia).map(t => t.clave));
    return novedades.filter(n => ausencia.has(n.tipo) && n.fecha_desde <= iso && n.fecha_hasta >= iso);
  }

  R.calc = { vacacionesCorresponden, antiguedad, resumirNovedades, saldoVacaciones, anioVacacionesDe, ausentesEn,
    horasDeNovedad, cuentaHoras, fmtHoras, JORNADA_POR_DEFECTO };
})(window.RRHH);
