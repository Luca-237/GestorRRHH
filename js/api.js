// =====================================================================
//  Única capa de datos: todo lo que habla con Supabase pasa por acá.
//  Las vistas nunca llaman a Supabase directo.
//  (Para probar sin base: pruebas/api-falsa.js reemplaza este objeto.)
// =====================================================================
(function (R) {
  const CAMPOS_EMPLEADO = ["apellido", "nombre", "dni", "cuil", "sucursal_id", "puesto", "jornada_horas",
    "fecha_ingreso", "fecha_egreso", "activo", "telefono", "notas"];
  const CAMPOS_NOVEDAD = ["empleado_id", "tipo", "fecha_desde", "fecha_hasta", "cantidad", "recargo",
    "anio_vacaciones", "con_certificado", "observacion"];
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
      if (v === "" && /fecha|_id$|jornada|recargo|anio|cantidad|puesto/.test(k)) v = null;
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
    listar: () => todo(() => sb.from("sucursales").select("id, nombre, orden, activa").order("orden").order("nombre")),
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

  const criterios = {
    listar: () => todo(() => sb.from("criterios_evaluacion").select("*").order("orden").order("nombre")),
    async crear(nombre) { return chequear(await sb.from("criterios_evaluacion").insert({ nombre: nombre.trim() }).select().single()); },
    async actualizar(id, d) { chequear(await sb.from("criterios_evaluacion").update(d).eq("id", id)); },
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
  };

  // ---------- Ajustes de vacaciones ----------
  const ajustes = {
    delAnio: anio => todo(() => sb.from("vacaciones_ajustes").select("id, empleado_id, anio, dias, motivo, creado_en").eq("anio", anio)),
    async crear(d) { return chequear(await sb.from("vacaciones_ajustes").insert(d).select().single()); },
    async eliminar(id) { chequear(await sb.from("vacaciones_ajustes").delete().eq("id", id)); },
  };

  // ---------- Evaluaciones ----------
  const evaluaciones = {
    listar: () => todo(() => sb.from("evaluaciones").select("*").order("periodo", { ascending: false }).order("fecha", { ascending: false })),
    async crear(d) {
      const s = await auth.sesion();
      return chequear(await sb.from("evaluaciones").insert({ ...d, evaluador: s.user.id }).select().single());
    },
    async eliminar(id) { chequear(await sb.from("evaluaciones").delete().eq("id", id)); },
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

  R.api = { configurado, iniciar, auth, sucursales, puestos, tipos, criterios, empleados, novedades, ajustes, evaluaciones, usuarios };
})(window.RRHH);
