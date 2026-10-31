// =====================================================================
//  Única capa de datos: todo lo que habla con Supabase pasa por acá.
//  Las vistas nunca llaman a Supabase directo.
//  (Para probar sin base: pruebas/api-falsa.js reemplaza este objeto.)
// =====================================================================
(function (R) {
  const CAMPOS_EMPLEADO = ["apellido", "nombre", "legajo", "dni", "cuil", "sucursal_id", "puesto", "sector", "jornada_horas", "hora_entrada", "hora_salida", "extra_entrada_min", "extra_salida_min", "codigo_cliente",
    "fecha_ingreso", "fecha_egreso", "activo", "motivo_baja", "telefono", "email", "fecha_nacimiento", "direccion", "obra_social", "banco",
    "contacto_emergencia_nombre", "contacto_emergencia_tel", "notas"];
  const CAMPOS_NOVEDAD = ["empleado_id", "tipo", "fecha_desde", "fecha_hasta", "cantidad", "recargo",
    "anio_vacaciones", "con_certificado", "observacion", "hora", "liquidado_en"];
  let sb = null;

  function configurado() {
    const c = window.RRHH_CONFIG || {};
    return /^https:\/\/\S+$/.test(c.supabaseUrl || "") && (c.supabaseKey || "").length > 20;
  }

  function iniciar() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("No se pudo cargar la librería de Supabase. Revisá la conexión a internet.");
    }
    const c = window.RRHH_CONFIG;
    sb = window.supabase.createClient(c.supabaseUrl.replace(/\/+$/, ""), c.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "rrhh.sesion" },
    });
  }

  // Errores de Supabase -> mensajes para el usuario
  function mensaje(error) {
    const m = (error && (error.message || error.error_description)) || String(error);
    if (/Invalid login credentials/i.test(m)) return "Usuario o contraseña incorrectos.";
    if (/banned/i.test(m)) return "Tu usuario está desactivado. Hablá con un admin.";
    if (/Email not confirmed/i.test(m)) return "El usuario todavía no está confirmado.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No hay conexión con la base de datos. Revisá internet.";
    if (/row-level security|permission denied/i.test(m)) return "No tenés permiso para hacer esto.";
    if (/JWT expired/i.test(m)) return "La sesión venció. Volvé a ingresar.";
    if (/empleados_dni_uq|duplicate key.*dni/i.test(m)) return "Ya hay un empleado cargado con ese DNI.";
    if (/empleados_codigo_cliente_uq/i.test(m)) return "Ese número de cliente ya lo tiene otro empleado.";
    if (/empleados_legajo_uq/i.test(m)) return "Ya hay un empleado con ese legajo.";
    if (/feriados_pkey/i.test(m)) return "Ese feriado ya está cargado.";
    if (/puestos_compartidos_nombre_key/i.test(m)) return "Ya hay un puesto compartido con ese nombre.";
    if (/puestos_compartidos_miembros_pkey/i.test(m)) return "Esa persona ya está en este puesto compartido.";
    if (/eventos_check|fecha_hasta >= fecha_desde/i.test(m)) return "La fecha \"hasta\" no puede ser anterior a \"desde\".";
    if (/fecha_hasta >= fecha_desde|novedades_check/i.test(m)) return "La fecha \"hasta\" no puede ser anterior a \"desde\".";
    if (/empleados_puesto_fkey/i.test(m)) return "Ese puesto no está en la lista. Agregalo en Configuración → Puestos.";
    if (/puestos_nombre_key|sucursales_nombre_key|duplicate key/i.test(m)) return "Ya existe uno con ese nombre.";
    if (/violates foreign key/i.test(m)) return "No se puede: hay datos relacionados que dependen de esto.";
    return m;
  }

  function chequear({ data, error }) {
    if (error) throw new Error(mensaje(error));
    return data;
  }

  // Deja solo las columnas de la tabla; "" -> null en fechas y números
  function limpiar(d, campos) {
    const out = {};
    campos.forEach(k => {
      if (d[k] === undefined) return;
      let v = d[k];
      if (typeof v === "string") v = v.trim();
      if (v === "" && /fecha|_id$|jornada|recargo|anio|cantidad|puesto|hora|liquidado|extra_|codigo/.test(k)) v = null;
      out[k] = v;
    });
    return out;
  }

  // Trae todas las filas (Supabase devuelve de a 1000)
  async function todo(consulta) {
    const filas = [], LOTE = 1000;
    for (let desde = 0; ; desde += LOTE) {
      const lote = chequear(await consulta().range(desde, desde + LOTE - 1));
      filas.push(...lote);
      if (lote.length < LOTE) return filas;
    }
  }

  // ---------- Sesión ----------
  const auth = {
    async ingresar(usuario, password) {
      chequear(await sb.auth.signInWithPassword({ email: R.util.aEmail(usuario), password }));
    },
    async salir() { await sb.auth.signOut(); },
    async sesion() { const { data } = await sb.auth.getSession(); return data.session; },
    alCambiar(cb) { sb.auth.onAuthStateChange((evento, sesion) => cb(evento, sesion)); },
    async miPerfil() {
      const s = await auth.sesion();
      if (!s) return null;
      return chequear(await sb.from("perfiles").select("id, email, nombre, rol, sucursal_id, activo").eq("id", s.user.id).maybeSingle());
    },
  };

  // ---------- Catálogos ----------
  const sucursales = {
    listar: () => todo(() => sb.from("sucursales").select("*").order("orden").order("nombre")),
    async crear(nombre) { return chequear(await sb.from("sucursales").insert({ nombre: nombre.trim() }).select().single()); },
    async actualizar(id, d) { chequear(await sb.from("sucursales").update(d).eq("id", id)); },
  };

  const tipos = {
    listar: () => todo(() => sb.from("tipos_novedad").select("*").order("orden").order("nombre")),
    async crear(d) { return chequear(await sb.from("tipos_novedad").insert(d).select().single()); },
    async actualizar(clave, d) { chequear(await sb.from("tipos_novedad").update(d).eq("clave", clave)); },
  };

  // Renombrar un puesto actualiza solo a los empleados que lo tienen (la base lo hace en cascada)
  const puestos = {
    listar: () => todo(() => sb.from("puestos").select("id, nombre, orden, activo").order("orden").order("nombre")),
    async crear(nombre) { return chequear(await sb.from("puestos").insert({ nombre: nombre.trim() }).select().single()); },
    async actualizar(id, d) { chequear(await sb.from("puestos").update(d).eq("id", id)); },
  };

  // ---------- Empleados ----------
  const empleados = {
    listar: () => todo(() => sb.from("empleados").select("id, " + CAMPOS_EMPLEADO.join(", ")).order("apellido").order("nombre")),
    async crear(d) { return chequear(await sb.from("empleados").insert(limpiar(d, CAMPOS_EMPLEADO)).select().single()); },
    async actualizar(id, d) { return chequear(await sb.from("empleados").update(limpiar(d, CAMPOS_EMPLEADO)).eq("id", id).select().single()); },
  };

  // ---------- Novedades ----------
  const COLS_NOVEDAD = "id, " + CAMPOS_NOVEDAD.join(", ") + ", creado_en";
  const novedades = {
    // Las que tocan el rango [desde, hasta] (una vacación que empieza antes también cuenta)
    entre: (desde, hasta) => todo(() => sb.from("novedades").select(COLS_NOVEDAD)
      .lte("fecha_desde", hasta).gte("fecha_hasta", desde).order("fecha_desde", { ascending: false })),
    async obtener(id) { return chequear(await sb.from("novedades").select(COLS_NOVEDAD).eq("id", id).maybeSingle()); },
    deEmpleado: id => todo(() => sb.from("novedades").select(COLS_NOVEDAD).eq("empleado_id", id).order("fecha_desde", { ascending: false })),
    // Todas las de ciertos tipos, sin límite de fechas (para la cuenta de horas)
    deTipos: claves => claves.length ? todo(() => sb.from("novedades").select(COLS_NOVEDAD).in("tipo", claves).order("fecha_desde")) : Promise.resolve([]),
    deVacaciones: anio => todo(() => sb.from("novedades").select(COLS_NOVEDAD).eq("anio_vacaciones", anio)),
    async crear(d) { return chequear(await sb.from("novedades").insert(limpiar(d, CAMPOS_NOVEDAD)).select(COLS_NOVEDAD).single()); },
    async actualizar(id, d) { return chequear(await sb.from("novedades").update(limpiar(d, CAMPOS_NOVEDAD)).eq("id", id).select(COLS_NOVEDAD).single()); },
    async eliminar(id) { chequear(await sb.from("novedades").delete().eq("id", id)); },
    // Falta que generó sola una llegada tarde (cada 3 acumuladas)
    async generadaPor(id) { return chequear(await sb.from("novedades").select(COLS_NOVEDAD).eq("generada_por", id).maybeSingle()); },
    // Horas extra sin liquidar (de cualquier fecha) y las liquidadas en un mes
    horasExtraPendientes: () => todo(() => sb.from("novedades").select(COLS_NOVEDAD).eq("tipo", "horas_extra").is("liquidado_en", null).order("fecha_desde")),
    horasExtraLiquidadas: mesISO => todo(() => sb.from("novedades").select(COLS_NOVEDAD).eq("tipo", "horas_extra").eq("liquidado_en", mesISO).order("fecha_desde")),
    // Adelantos y compras en cuenta corriente: lo pendiente de descontar y lo descontado en el sueldo de un mes
    descuentosPendientes: claves => claves.length ? todo(() => sb.from("novedades").select(COLS_NOVEDAD).in("tipo", claves).is("liquidado_en", null).order("fecha_desde")) : Promise.resolve([]),
    descuentosDelMes: (claves, mesISO) => claves.length ? todo(() => sb.from("novedades").select(COLS_NOVEDAD).in("tipo", claves).eq("liquidado_en", mesISO).order("fecha_desde")) : Promise.resolve([]),
    async liquidar(ids, fecha) { chequear(await sb.from("novedades").update({ liquidado_en: fecha }).in("id", ids)); },
  };

  // ---------- Liquidaciones de vacaciones (la nota y el pago; marcan los goces del período) ----------
  const liquidaciones = {
    delAnio: anio => todo(() => sb.from("vacaciones_liquidaciones").select("*").eq("anio", anio).order("fecha_liquidacion")),
    deEmpleado: id => todo(() => sb.from("vacaciones_liquidaciones").select("*").eq("empleado_id", id).order("fecha_liquidacion", { ascending: false })),
    async crear(d) { return chequear(await sb.from("vacaciones_liquidaciones").insert(d).select().single()); },
    async eliminar(id) { chequear(await sb.from("vacaciones_liquidaciones").delete().eq("id", id)); },
  };

  // ---------- Eventos del calendario ----------
  const eventos = {
    entre: (desde, hasta) => todo(() => sb.from("eventos").select("*").lte("fecha_desde", hasta).gte("fecha_hasta", desde).order("fecha_desde")),
    async crear(d) { return chequear(await sb.from("eventos").insert(d).select().single()); },
    async actualizar(id, d) { return chequear(await sb.from("eventos").update(d).eq("id", id).select().single()); },
    async eliminar(id) { chequear(await sb.from("eventos").delete().eq("id", id)); },
  };

  // ---------- Puestos compartidos (solo uno de vacaciones a la vez; lo controla la base) ----------
  const compartidos = {
    async listar() {
      const filas = await todo(() => sb.from("puestos_compartidos").select("id, nombre, descripcion, puestos_compartidos_miembros(empleado_id)").order("nombre"));
      return filas.map(p => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, miembros: (p.puestos_compartidos_miembros || []).map(m => m.empleado_id) }));
    },
    async crear(nombre, descripcion = "") { return chequear(await sb.from("puestos_compartidos").insert({ nombre: nombre.trim(), descripcion: descripcion.trim() }).select().single()); },
    async actualizar(id, d) { chequear(await sb.from("puestos_compartidos").update(d).eq("id", id)); },
    async eliminar(id) { chequear(await sb.from("puestos_compartidos").delete().eq("id", id)); },
    async agregar(id, empleadoId) { chequear(await sb.from("puestos_compartidos_miembros").insert({ puesto_compartido_id: id, empleado_id: empleadoId })); },
    async quitar(id, empleadoId) { chequear(await sb.from("puestos_compartidos_miembros").delete().eq("puesto_compartido_id", id).eq("empleado_id", empleadoId)); },
  };

  // ---------- Períodos sin vacaciones (la base no deja cargar vacaciones adentro) ----------
  const periodos = {
    listar: () => todo(() => sb.from("periodos_sin_vacaciones").select("*").order("fecha_desde")),
    async crear(d) { return chequear(await sb.from("periodos_sin_vacaciones").insert(d).select().single()); },
    async eliminar(id) { chequear(await sb.from("periodos_sin_vacaciones").delete().eq("id", id)); },
  };

  // ---------- Feriados ----------
  const feriados = {
    listar: () => todo(() => sb.from("feriados").select("fecha, descripcion").order("fecha")),
    async crear(fecha, descripcion) { chequear(await sb.from("feriados").insert({ fecha, descripcion: descripcion.trim() })); },
    async eliminar(fecha) { chequear(await sb.from("feriados").delete().eq("fecha", fecha)); },
  };

  // ---------- Ajustes de vacaciones ----------
  const ajustes = {
    delAnio: anio => todo(() => sb.from("vacaciones_ajustes").select("id, empleado_id, anio, dias, motivo, creado_en").eq("anio", anio)),
    async crear(d) { return chequear(await sb.from("vacaciones_ajustes").insert(d).select().single()); },
    async eliminar(id) { chequear(await sb.from("vacaciones_ajustes").delete().eq("id", id)); },
  };

  // ---------- Asistencia: hora de entrada y de salida de cada empleado por día ----------
  const asistencia = {
    entre: (desde, hasta, empleadoId) => todo(() => {
      let q = sb.from("asistencia").select("*").gte("fecha", desde).lte("fecha", hasta);
      if (empleadoId) q = q.eq("empleado_id", empleadoId);
      return q.order("fecha");
    }),
    // Una fila por empleado y día: si ya existe se corrige
    async guardar(d) {
      return chequear(await sb.from("asistencia").upsert({ empleado_id: d.empleado_id, fecha: d.fecha, entrada: d.entrada || null, salida: d.salida || null, observacion: (d.observacion || "").trim() },
        { onConflict: "empleado_id,fecha" }).select().single());
    },
    async eliminar(empleadoId, fecha) { chequear(await sb.from("asistencia").delete().eq("empleado_id", empleadoId).eq("fecha", fecha)); },
  };

  // ---------- Horarios generales y minutos a favor (una sola fila, la cambia el admin) ----------
  const horarios = {
    async obtener() { return chequear(await sb.from("ajustes_horarios").select("*").eq("id", 1).single()); },
    async actualizar(d) { return chequear(await sb.from("ajustes_horarios").update(d).eq("id", 1).select().single()); },
  };

  // ---------- Usuarios (Edge Function, solo admin) ----------
  const usuarios = {
    async llamar(accion, datos = {}) {
      const nombre = (window.RRHH_CONFIG || {}).funcionUsuarios || "admin-usuarios";
      const { data, error } = await sb.functions.invoke(nombre, { body: { accion, ...datos } });
      if (error) {
        let m = error.message;
        try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) {}
        if (/Failed to send a request/i.test(m)) m = `No se pudo contactar la función "${nombre}". ¿Está publicada con ese nombre? (js/config.js → funcionUsuarios)`;
        if (/Invalid JWT|UNAUTHORIZED/i.test(m)) m = "La función rechazó la sesión. En Supabase → Edge Functions → la función → desactivar \"Verify JWT\" (la función igual verifica la sesión por su cuenta).";
        throw new Error(mensaje({ message: m }));
      }
      if (data && data.error) throw new Error(data.error);
      return data;
    },
    listar: () => usuarios.llamar("listar").then(r => r.usuarios),
    crear: d => usuarios.llamar("crear", d),
    cambiarRol: (id, rol, sucursal_id) => usuarios.llamar("cambiar_rol", { id, rol, sucursal_id }),
    activar: id => usuarios.llamar("activar", { id }),
    desactivar: id => usuarios.llamar("desactivar", { id }),
    resetearPassword: (id, password) => usuarios.llamar("resetear_password", { id, password }),
  };

  R.api = { configurado, iniciar, auth, sucursales, puestos, tipos, empleados, novedades, liquidaciones, feriados, eventos, compartidos, periodos, ajustes, asistencia, horarios, usuarios };
})(window.RRHH);
