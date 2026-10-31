// =====================================================================
//  Base FALSA en memoria para probar la pantalla sin Supabase.
//  Solo se carga en la PC (localhost o archivo) abriendo index.html?demo
//  (admin) o index.html?demo=encargado. Los nombres son INVENTADOS:
//  acá nunca van datos reales de empleados. En el servidor esta carpeta
//  está bloqueada por .htaccess.
// =====================================================================
(function (R) {
  const { hoy, sumarDias, diasEntre } = R.util;
  const comoEncargado = /[?&]demo=encargado\b/.test(location.search);
  const copia = x => JSON.parse(JSON.stringify(x));
  let sec = 1000;
  const nuevoId = () => ++sec;
  const espera = v => new Promise(ok => setTimeout(() => ok(copia(v)), 120));

  const sucursales = [
    { id: 1, nombre: "Central", orden: 1, activa: true, hora_entrada: "09:00", hora_salida: "18:00" }, { id: 2, nombre: "Indarte", orden: 2, activa: true, hora_entrada: "09:30", hora_salida: "18:30" },
    { id: 3, nombre: "Peatonal", orden: 3, activa: true, hora_entrada: "09:00", hora_salida: "18:00" }, { id: 4, nombre: "Chimola", orden: 4, activa: true, hora_entrada: "09:00", hora_salida: "18:00" },
  ];
  const puestos = ["Vendedor B", "Auxiliar B", "Administrativo B", "Encargado", "Marketing"]
    .map((nombre, i) => ({ id: i + 1, nombre, orden: i + 1, activo: true }));
  const tipos = [
    ["vacaciones", "Vacaciones", "dias", true, true, "#e84e1b"], ["franco", "Franco", "dias", false, true, "#000000"],
    ["llegada_tarde", "Llegada tarde", "minutos", false, false, "#c63f12"], ["horas_extra", "Horas extra", "horas", false, false, "#3a3a3a"],
    ["licencia_medica", "Licencia médica", "dias", false, true, "#8a8a8a"], ["falta", "Falta / inasistencia", "dias", false, true, "#b00020"],
    ["licencia_especial", "Licencia especial", "dias", false, true, "#5a5a5a"],
    ["permiso_horas", "Permiso de horas (a devolver)", "horas", false, false, "#7a4a2a", 1],
    ["dia_a_devolver", "Día pedido (a devolver)", "dias", false, true, "#a0522d", 1],
    ["devolucion_horas", "Devolución de horas", "horas", false, false, "#2f6b3a", -1],
    ["licencia_accidente", "Licencia por accidente", "dias", false, true, "#6b4a8a"],
    ["adelanto", "Adelanto de sueldo (plata adelantada)", "pesos", false, false, "#1f5f8b"], ["compra_cuenta_corriente", "Compra en cuenta corriente (a descontar)", "pesos", false, false, "#8a5a1f"], ["viatico", "Viático", "pesos", false, false, "#3c7a89"],
    ["alta", "Alta laboral", "registro", false, false, "#2f6b3a"], ["baja", "Baja laboral", "registro", false, false, "#7a1f1f"],
    ["cambio_obra_social", "Cambio de obra social", "registro", false, false, "#8a8a8a"],
  ].map(([clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, cuenta_horas = 0], i) =>
    ({ clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, cuenta_horas, orden: i + 1, activo: true, del_sistema: true }));
  tipos.forEach(t => { t.descuenta_sueldo = ["adelanto", "compra_cuenta_corriente"].includes(t.clave); });
  const nombres = [
    ["Prueba", "Ana", 1, "Vendedor B", "2015-03-02"], ["Ejemplo", "Bruno", 1, "Auxiliar B", "2022-07-11"],
    ["Demo", "Carla", 1, "Administrativo B", "2019-11-04"], ["Ficticio", "Diego", 1, "Vendedor B", "2026-08-01"],
    ["Muestra", "Elena", 2, "Vendedor B", "2008-05-19"], ["Inventado", "Fede", 2, "Encargado", "2001-02-01"],
    ["Ensayo", "Gabi", 2, "Vendedor B", "2024-04-15"], ["Simulado", "Hugo", 3, "Vendedor B", "2021-09-20"],
    ["Modelo", "Inés", 3, "Vendedor B", "2017-01-09"], ["Testigo", "Juan", 4, "Vendedor B", "2023-10-02"],
  ];
  const empleados = nombres.map(([apellido, nombre, sucursal_id, puesto, fecha_ingreso], i) => ({
    id: i + 1, apellido, nombre, dni: String(30000000 + i * 1111111), cuil: "", sucursal_id, puesto, jornada_horas: 8,
    fecha_ingreso, fecha_egreso: null, activo: true, telefono: "", notas: "",
    legajo: String(30000000 + i * 1111111).slice(-3) + nombre[0] + apellido[0], sector: ["Salón", "Caja", "Depósito", "Ventas"][i % 4],
    hora_entrada: i === 4 ? "09:30" : null, fecha_nacimiento: "1995-0" + (1 + i % 9) + "-15", email: "", direccion: "Calle Inventada " + (100 + i),
    obra_social: ["OSECAC", "SOS SALUD", "SANCOR"][i % 3], banco: i % 2 ? "Galicia" : "BBVA",
    contacto_emergencia_nombre: "Contacto de prueba", contacto_emergencia_tel: "3534 00-0000", motivo_baja: "",
  }));
  empleados.push({ id: 11, apellido: "Dado de baja", nombre: "Ivo", dni: "", cuil: "", sucursal_id: 1, puesto: "Auxiliar B", jornada_horas: 8,
    fecha_ingreso: "2020-01-01", fecha_egreso: "2026-06-30", activo: false, telefono: "", notas: "", legajo: "000ID", sector: "Depósito", motivo_baja: "Renuncia" });
  const feriados = [{ fecha: "2026-05-25", descripcion: "Día de la Revolución de Mayo" }, { fecha: "2026-07-09", descripcion: "Día de la Independencia" },
    { fecha: "2026-11-23", descripcion: "Día de la Soberanía Nacional" }, { fecha: "2026-12-08", descripcion: "Inmaculada Concepción" }];
  const liquidaciones = [];
  const eventosDemo = [];
  const periodosDemo = [{ id: 1, fecha_desde: "2026-11-16", fecha_hasta: "2026-12-20", motivo: "Fin de año", sucursal_id: null }];
  const compartidosDemo = [{ id: 1, nombre: "Caja de Central", descripcion: "Se cubren entre sí", miembros: [1, 3] }];

  const novedades = [];
  function completar(n) {
    const t = tipos.find(x => x.clave === n.tipo);
    if (!n.fecha_hasta) n.fecha_hasta = n.fecha_desde;
    if (t.unidad === "dias") n.cantidad = diasEntre(n.fecha_desde, n.fecha_hasta); else n.fecha_hasta = n.fecha_desde;
    n.anio_vacaciones = t.descuenta_vacaciones ? (n.anio_vacaciones || R.calc.anioVacacionesDe(n.fecha_desde)) : null;
    if (t.unidad === "registro") n.cantidad = 0;
    if (n.tipo !== "horas_extra") n.recargo = null;
    if (!["horas_extra", "llegada_tarde"].includes(n.tipo)) n.hora = null;
    if (n.tipo !== "horas_extra" && !t.descuenta_vacaciones && !t.descuenta_sueldo) n.liquidado_en = null;
    if (n.liquidado_en === undefined) n.liquidado_en = null;
    if (n.observacion == null) n.observacion = "";
    return n;
  }
  const h = hoy(), mes = h.slice(0, 8);
  [
    [1, "vacaciones", sumarDias(h, -3), sumarDias(h, 10)], [5, "licencia_medica", sumarDias(h, -1), sumarDias(h, 2), 0, null, "Con reposo"],
    [8, "franco", h, h], [2, "llegada_tarde", mes + "03", null, 15], [2, "llegada_tarde", mes + "08", null, 25],
    [2, "llegada_tarde", mes + "14", null, 10], [7, "llegada_tarde", mes + "06", null, 5], [3, "horas_extra", mes + "02", null, 2.5, 50],
    [6, "horas_extra", mes + "10", null, 4, 100], [9, "falta", mes + "07", mes + "07", 0, null, "Sin aviso"],
    [10, "vacaciones", sumarDias(h, 12), sumarDias(h, 25)], [4, "franco", sumarDias(h, 5), sumarDias(h, 5)],
    [5, "vacaciones", "2026-01-05", "2026-01-25"],
    // Cuenta de horas: Carla pidió 2 h y un día, devolvió 3 h; Hugo devolvió de más
    [3, "permiso_horas", mes + "04", null, 2, null, "Turno médico"], [3, "dia_a_devolver", mes + "16", mes + "16", 0, null, "Trámite personal"],
    [3, "devolucion_horas", mes + "21", null, 3, null, "Se quedó al cierre"], [8, "permiso_horas", mes + "09", null, 1.5],
    [8, "devolucion_horas", mes + "12", null, 2.5],
    [9, "viatico", mes + "05", null, 15000], [9, "viatico", mes + "12", null, 15000], [4, "adelanto", mes + "15", null, 80000, null, "Del mes anterior"],
    [2, "compra_cuenta_corriente", mes + "11", null, 45000, null, "Mochila y útiles"], [4, "compra_cuenta_corriente", mes + "18", null, 32000, null, "Billetera"],
    [6, "licencia_accidente", sumarDias(h, -20), sumarDias(h, -16), 0, null, "Por accidente"], [1, "cambio_obra_social", mes + "01", null, 0, null, "SUME SALUD"],
  ].forEach(([empleado_id, tipo, fecha_desde, fecha_hasta, cantidad = 0, recargo = null, observacion = ""]) =>
    novedades.push(completar({ id: nuevoId(), empleado_id, tipo, fecha_desde, fecha_hasta, cantidad, recargo, anio_vacaciones: null,
      con_certificado: tipo === "licencia_medica" ? true : null, observacion, creado_en: new Date().toISOString() })));
  const terceraBruno = novedades.filter(n => n.empleado_id === 2 && n.tipo === "llegada_tarde").sort((a, b) => a.fecha_desde.localeCompare(b.fecha_desde))[2];
  if (terceraBruno) novedades.push(completar({ id: nuevoId(), empleado_id: 2, tipo: "falta", fecha_desde: terceraBruno.fecha_desde, fecha_hasta: terceraBruno.fecha_desde,
    cantidad: 0, observacion: "Falta injustificada automática — 3 llegadas tarde acumuladas", generada_por: terceraBruno.id, creado_en: new Date().toISOString() }));
  novedades.filter(n => n.tipo === "horas_extra").forEach((n, i) => { n.hora = i ? "16:00" : "08:00"; });
  const ajustes = [{ id: nuevoId(), empleado_id: 9, anio: R.calc.anioVacacionesDe(h), dias: 3, motivo: "Arrastre período anterior" }];
  // Asistencia inventada: los últimos días hábiles de algunos empleados (uno llega tarde, otro llega antes y se queda más)
  const horarios = { id: 1, extra_entrada_min: 30, extra_salida_min: 10, modo_extra: "todo" };
  const asistencia = [];
  [[1, "08:52", "18:03"], [2, "09:14", "18:00"], [3, "08:25", "18:20"], [4, "09:00", "18:09"], [5, "09:40", "18:00"], [6, "08:31", "18:10"]].forEach(([empleado_id, entrada, salida]) => {
    for (let k = 0; k < 3; k++) {
      const dia = sumarDias(h, -k), dow = new Date(dia + "T00:00:00Z").getUTCDay();
      if (dow === 0 || dow === 6) continue;
      asistencia.push({ id: nuevoId(), empleado_id, fecha: dia, entrada, salida, observacion: "" });
    }
  });
  const perfil = comoEncargado
    ? { id: "demo-enc", email: "encargado@demo", nombre: "Encargado Demo", rol: "encargado", sucursal_id: 1, activo: true }
    : { id: "demo", email: "admin@demo", nombre: "Admin Demo", rol: "admin", sucursal_id: null, activo: true };
  const usuarios = [
    { ...perfil, soy_yo: true, ultimo_ingreso: new Date().toISOString() },
    { id: "u2", email: "encargado@rrhh.cindymayorista.com.ar", nombre: "Otro usuario", rol: "encargado", sucursal_id: 2, activo: true, soy_yo: false, ultimo_ingreso: null },
  ];
  // El encargado solo "ve" su sucursal, como haría la base
  const ve = id => { const e = empleados.find(x => x.id === id); return e && (!comoEncargado || e.sucursal_id === perfil.sucursal_id); };
  let logueado = true;

  R.api = {
    configurado: () => true,
    iniciar() {},
    auth: {
      ingresar: async () => { logueado = true; },
      salir: async () => { logueado = false; },
      sesion: async () => (logueado ? { user: { id: perfil.id } } : null),
      alCambiar() {},
      miPerfil: async () => espera(perfil),
    },
    sucursales: {
      listar: () => espera(sucursales),
      crear: async nombre => { const s = { id: nuevoId(), nombre, orden: 100, activa: true }; sucursales.push(s); return copia(s); },
      actualizar: async (id, d) => { Object.assign(sucursales.find(s => s.id === id), d); },
    },
    puestos: {
      listar: () => espera(puestos),
      crear: async nombre => {
        if (puestos.some(p => p.nombre === nombre)) throw new Error("Ya existe uno con ese nombre.");
        const p = { id: nuevoId(), nombre, orden: 100, activo: true }; puestos.push(p); return copia(p);
      },
      actualizar: async (id, d) => {
        const p = puestos.find(x => x.id === id);
        // Igual que la base: renombrar actualiza a los empleados en cascada
        if (d.nombre && d.nombre !== p.nombre) empleados.filter(e => e.puesto === p.nombre).forEach(e => { e.puesto = d.nombre; });
        Object.assign(p, d);
      },
    },
    tipos: {
      listar: () => espera(tipos),
      crear: async d => { const t = { descuenta_vacaciones: false, color: "#6b6b6b", activo: true, del_sistema: false, ...d }; tipos.push(t); return copia(t); },
      actualizar: async (clave, d) => { Object.assign(tipos.find(t => t.clave === clave), d); },
    },
    empleados: {
      listar: () => espera(empleados.filter(e => ve(e.id)).sort((a, b) => a.apellido.localeCompare(b.apellido))),
      crear: async d => { const e = { id: nuevoId(), ...d }; empleados.push(e); return copia(e); },
      actualizar: async (id, d) => { const e = empleados.find(x => x.id === id); Object.assign(e, d); return copia(e); },
    },
    novedades: {
      entre: (desde, hasta) => espera(novedades.filter(n => ve(n.empleado_id) && n.fecha_desde <= hasta && n.fecha_hasta >= desde)
        .sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde))),
      obtener: async id => copia(novedades.find(n => n.id === id) || null),
      deEmpleado: id => espera(novedades.filter(n => n.empleado_id === id).sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde))),
      deTipos: claves => espera(novedades.filter(n => ve(n.empleado_id) && claves.includes(n.tipo))),
      deVacaciones: anio => espera(novedades.filter(n => ve(n.empleado_id) && n.anio_vacaciones === anio)),
      crear: async d => {
        if (!ve(d.empleado_id)) throw new Error("No tenés permiso para hacer esto.");
        if (d.tipo === "vacaciones") {
          const emp = empleados.find(x => x.id === d.empleado_id);
          const b = periodosDemo.find(p => (!p.sucursal_id || p.sucursal_id === emp.sucursal_id) && p.fecha_desde <= (d.fecha_hasta || d.fecha_desde) && p.fecha_hasta >= d.fecha_desde);
          if (b) throw new Error(`Período sin vacaciones: del ${b.fecha_desde.split("-").reverse().join("/")} al ${b.fecha_hasta.split("-").reverse().join("/")} nadie puede tomarse vacaciones${b.motivo ? " (" + b.motivo + ")" : ""}.`);
          for (const pc of compartidosDemo.filter(p => p.miembros.includes(d.empleado_id))) {
            const c = novedades.find(x => x.tipo === "vacaciones" && x.empleado_id !== d.empleado_id && pc.miembros.includes(x.empleado_id) && x.fecha_desde <= (d.fecha_hasta || d.fecha_desde) && x.fecha_hasta >= d.fecha_desde);
            if (c) { const e = empleados.find(x => x.id === c.empleado_id); throw new Error(`Puesto compartido "${pc.nombre}": ${e.nombre} ${e.apellido} está de vacaciones del ${c.fecha_desde.split("-").reverse().join("/")} al ${c.fecha_hasta.split("-").reverse().join("/")}. Solo uno puede estar de vacaciones a la vez.`); }
          }
        }
        const n = completar({ id: nuevoId(), ...d, creado_en: new Date().toISOString() }); novedades.push(n);
        // Igual que la base: cada 3 llegadas tarde acumuladas, una falta
        if (n.tipo === "llegada_tarde") {
          const total = novedades.filter(x => x.empleado_id === n.empleado_id && x.tipo === "llegada_tarde").length;
          if (total % 3 === 0) novedades.push(completar({ id: nuevoId(), empleado_id: n.empleado_id, tipo: "falta", fecha_desde: n.fecha_desde, fecha_hasta: n.fecha_desde,
            cantidad: 0, observacion: `Falta injustificada automática — ${total} llegadas tarde acumuladas`, generada_por: n.id, creado_en: new Date().toISOString() }));
        }
        return copia(n);
      },
      generadaPor: async id => copia(novedades.find(n => n.generada_por === id) || null),
      horasExtraPendientes: () => espera(novedades.filter(n => ve(n.empleado_id) && n.tipo === "horas_extra" && !n.liquidado_en)),
      horasExtraLiquidadas: mes => espera(novedades.filter(n => ve(n.empleado_id) && n.tipo === "horas_extra" && n.liquidado_en === mes)),
      descuentosPendientes: claves => espera(novedades.filter(n => ve(n.empleado_id) && claves.includes(n.tipo) && !n.liquidado_en)),
      descuentosDelMes: (claves, mes) => espera(novedades.filter(n => ve(n.empleado_id) && claves.includes(n.tipo) && n.liquidado_en === mes)),
      liquidar: async (ids, fecha) => { novedades.filter(n => ids.includes(n.id)).forEach(n => { n.liquidado_en = fecha; }); },
      actualizar: async (id, d) => { const n = novedades.find(x => x.id === id); Object.assign(n, d); completar(n); return copia(n); },
      eliminar: async id => {
        novedades.splice(novedades.findIndex(n => n.id === id), 1);
        const hija = novedades.findIndex(n => n.generada_por === id);
        if (hija >= 0) novedades.splice(hija, 1);
      },
    },
    liquidaciones: {
      delAnio: anio => espera(liquidaciones.filter(l => l.anio === anio && ve(l.empleado_id))),
      deEmpleado: id => espera(liquidaciones.filter(l => l.empleado_id === id)),
      crear: async d => {
        const l = { id: nuevoId(), ...d }; liquidaciones.push(l);
        const vac = new Set(tipos.filter(t => t.descuenta_vacaciones).map(t => t.clave));
        novedades.filter(n => vac.has(n.tipo) && n.empleado_id === d.empleado_id && n.anio_vacaciones === d.anio && !n.liquidado_en)
          .forEach(n => { n.liquidado_en = d.fecha_liquidacion; });
        return copia(l);
      },
      eliminar: async id => { liquidaciones.splice(liquidaciones.findIndex(l => l.id === id), 1); },
    },
    eventos: {
      entre: (desde, hasta) => espera(eventosDemo.filter(e => e.fecha_desde <= hasta && e.fecha_hasta >= desde)),
      crear: async d => { const e = { id: nuevoId(), ...d }; eventosDemo.push(e); return copia(e); },
      actualizar: async (id, d) => { const e = eventosDemo.find(x => x.id === id); Object.assign(e, d); return copia(e); },
      eliminar: async id => { eventosDemo.splice(eventosDemo.findIndex(e => e.id === id), 1); },
    },
    periodos: {
      listar: () => espera(periodosDemo),
      crear: async d => { const p = { id: nuevoId(), ...d }; periodosDemo.push(p); return copia(p); },
      eliminar: async id => { periodosDemo.splice(periodosDemo.findIndex(p => p.id === id), 1); },
    },
    compartidos: {
      listar: () => espera(compartidosDemo),
      crear: async (nombre, descripcion = "") => { const p = { id: nuevoId(), nombre, descripcion, miembros: [] }; compartidosDemo.push(p); return copia(p); },
      actualizar: async (id, d) => { Object.assign(compartidosDemo.find(p => p.id === id), d); },
      eliminar: async id => { compartidosDemo.splice(compartidosDemo.findIndex(p => p.id === id), 1); },
      agregar: async (id, emp) => { const p = compartidosDemo.find(x => x.id === id); if (p.miembros.includes(emp)) throw new Error("Esa persona ya está en este puesto compartido."); p.miembros.push(emp); },
      quitar: async (id, emp) => { const p = compartidosDemo.find(x => x.id === id); p.miembros = p.miembros.filter(m => m !== emp); },
    },
    feriados: {
      listar: () => espera([...feriados].sort((a, b) => a.fecha.localeCompare(b.fecha))),
      crear: async (fecha, descripcion) => {
        if (feriados.some(f => f.fecha === fecha)) throw new Error("Ese feriado ya está cargado.");
        feriados.push({ fecha, descripcion });
      },
      eliminar: async fecha => { feriados.splice(feriados.findIndex(f => f.fecha === fecha), 1); },
    },
    ajustes: {
      delAnio: anio => espera(ajustes.filter(a => a.anio === anio && ve(a.empleado_id))),
      crear: async d => { const a = { id: nuevoId(), ...d }; ajustes.push(a); return copia(a); },
      eliminar: async id => { ajustes.splice(ajustes.findIndex(a => a.id === id), 1); },
    },
    asistencia: {
      entre: (desde, hasta, empleadoId) => espera(asistencia.filter(a => a.fecha >= desde && a.fecha <= hasta && ve(a.empleado_id) && (!empleadoId || a.empleado_id === empleadoId))),
      guardar: async d => {
        let a = asistencia.find(x => x.empleado_id === d.empleado_id && x.fecha === d.fecha);
        if (!a) { a = { id: nuevoId(), empleado_id: d.empleado_id, fecha: d.fecha }; asistencia.push(a); }
        Object.assign(a, { entrada: d.entrada || null, salida: d.salida || null, observacion: d.observacion || "" });
        return copia(a);
      },
      eliminar: async (empleadoId, fecha) => { const k = asistencia.findIndex(x => x.empleado_id === empleadoId && x.fecha === fecha); if (k >= 0) asistencia.splice(k, 1); },
    },
    horarios: {
      obtener: async () => copia(horarios),
      actualizar: async d => { Object.assign(horarios, d); return copia(horarios); },
    },
    usuarios: {
      listar: () => espera(usuarios),
      crear: async d => { usuarios.push({ id: "u" + nuevoId(), ...d, activo: true, soy_yo: false, ultimo_ingreso: null }); },
      cambiarRol: async (id, rol, sucursal_id) => { Object.assign(usuarios.find(u => u.id === id), { rol, sucursal_id }); },
      activar: async id => { usuarios.find(u => u.id === id).activo = true; },
      desactivar: async id => { usuarios.find(u => u.id === id).activo = false; },
      resetearPassword: async () => {},
    },
  };
  console.info("Gestor de RRHH: modo DEMO con datos inventados (" + (comoEncargado ? "encargado de Central" : "admin") + ").");
})(window.RRHH);
