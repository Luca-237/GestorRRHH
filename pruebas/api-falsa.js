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
    { id: 1, nombre: "Central", orden: 1, activa: true }, { id: 2, nombre: "Indarte", orden: 2, activa: true },
    { id: 3, nombre: "Peatonal", orden: 3, activa: true }, { id: 4, nombre: "Chimola", orden: 4, activa: true },
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
  ].map(([clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, cuenta_horas = 0], i) =>
    ({ clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, cuenta_horas, orden: i + 1, activo: true, del_sistema: true }));
  const criterios = ["Puntualidad y asistencia", "Atención al cliente", "Trabajo en equipo", "Responsabilidad y compromiso", "Orden y prolijidad", "Conocimiento de productos"]
    .map((nombre, i) => ({ id: i + 1, nombre, descripcion: "", orden: i + 1, activo: true }));

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
  }));
  empleados.push({ id: 11, apellido: "Dado de baja", nombre: "Ivo", dni: "", cuil: "", sucursal_id: 1, puesto: "Auxiliar B", jornada_horas: 8,
    fecha_ingreso: "2020-01-01", fecha_egreso: "2026-06-30", activo: false, telefono: "", notas: "" });

  const novedades = [];
  function completar(n) {
    const t = tipos.find(x => x.clave === n.tipo);
    if (!n.fecha_hasta) n.fecha_hasta = n.fecha_desde;
    if (t.unidad === "dias") n.cantidad = diasEntre(n.fecha_desde, n.fecha_hasta); else n.fecha_hasta = n.fecha_desde;
    n.anio_vacaciones = t.descuenta_vacaciones ? (n.anio_vacaciones || R.calc.anioVacacionesDe(n.fecha_desde)) : null;
    if (n.tipo !== "horas_extra") n.recargo = null;
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
  ].forEach(([empleado_id, tipo, fecha_desde, fecha_hasta, cantidad = 0, recargo = null, observacion = ""]) =>
    novedades.push(completar({ id: nuevoId(), empleado_id, tipo, fecha_desde, fecha_hasta, cantidad, recargo, anio_vacaciones: null,
      con_certificado: tipo === "licencia_medica" ? true : null, observacion, creado_en: new Date().toISOString() })));
  const ajustes = [{ id: nuevoId(), empleado_id: 9, anio: R.calc.anioVacacionesDe(h), dias: 3, motivo: "Arrastre período anterior" }];
  const evaluaciones = [
    { id: nuevoId(), empleado_id: 1, fecha: h, periodo: h.slice(0, 7), puntajes: { 1: 5, 2: 4, 3: 5, 4: 4, 5: 4, 6: 5 }, promedio: 4.5, fortalezas: "Muy buena con clientes", a_mejorar: "", evaluador: "demo" },
    { id: nuevoId(), empleado_id: 2, fecha: h, periodo: h.slice(0, 7), puntajes: { 1: 2, 2: 3, 3: 4, 4: 3, 5: 3, 6: 3 }, promedio: 3, fortalezas: "", a_mejorar: "Puntualidad", evaluador: "demo" },
  ];
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
  const prom = p => { const v = Object.values(p).map(Number); return Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100; };

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
    criterios: {
      listar: () => espera(criterios),
      crear: async nombre => { const c = { id: nuevoId(), nombre, descripcion: "", orden: 100, activo: true }; criterios.push(c); return copia(c); },
      actualizar: async (id, d) => { Object.assign(criterios.find(c => c.id === id), d); },
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
        const n = completar({ id: nuevoId(), ...d, creado_en: new Date().toISOString() }); novedades.push(n); return copia(n);
      },
      actualizar: async (id, d) => { const n = novedades.find(x => x.id === id); Object.assign(n, d); completar(n); return copia(n); },
      eliminar: async id => { novedades.splice(novedades.findIndex(n => n.id === id), 1); },
    },
    ajustes: {
      delAnio: anio => espera(ajustes.filter(a => a.anio === anio && ve(a.empleado_id))),
      crear: async d => { const a = { id: nuevoId(), ...d }; ajustes.push(a); return copia(a); },
      eliminar: async id => { ajustes.splice(ajustes.findIndex(a => a.id === id), 1); },
    },
    evaluaciones: {
      listar: () => espera(evaluaciones.filter(e => ve(e.empleado_id)).sort((a, b) => b.periodo.localeCompare(a.periodo))),
      crear: async d => { const e = { id: nuevoId(), fecha: hoy(), evaluador: perfil.id, ...d, promedio: prom(d.puntajes) }; evaluaciones.unshift(e); return copia(e); },
      eliminar: async id => { evaluaciones.splice(evaluaciones.findIndex(e => e.id === id), 1); },
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
