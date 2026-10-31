// =====================================================================
//  Arranque: verifica la sesión, carga los catálogos y maneja la
//  navegación entre secciones (#tablero, #empleados, …).
// =====================================================================
(function (R) {
  const { $, esc, toast } = R.util;
  const A = R.vistaAcceso;
  const VISTAS = {
    tablero: () => R.vistaTablero,
    empleados: () => R.vistaEmpleados,
    novedades: () => R.vistaNovedades,
    vacaciones: () => R.vistaVacaciones,
    asistencia: () => R.vistaAsistencia,
    horas: () => R.vistaHoras,
    descuentos: () => R.vistaDescuentos,
    calendario: () => R.vistaCalendario,
    compartidos: () => R.vistaCompartidos,
    "horas-extra": () => R.vistaHorasExtra,
    configuracion: () => R.vistaConfiguracion,
  };
  let vistaActual = null;

  // ---------- Ayudas compartidas por las vistas ----------
  const app = {
    esAdmin: () => R.estado.perfil && R.estado.perfil.rol === "admin",
    sucursal: id => R.estado.sucursales.find(s => s.id === id),
    sucursalNombre: id => (app.sucursal(id) || {}).nombre || "—",
    tipo: clave => R.estado.tipos.find(t => t.clave === clave) || { clave, nombre: clave, unidad: "dias", color: "#6b6b6b" },
    empleado: id => R.estado.empleados.find(e => e.id === id),
    // Empleados de la sucursal elegida arriba (el encargado ya recibe solo los suyos)
    empleadosVisibles({ inactivos = false } = {}) {
      const f = R.estado.filtroSucursal;
      return R.estado.empleados.filter(e => (inactivos || e.activo) && (!f || e.sucursal_id === Number(f)));
    },
    // ¿La novedad es de un empleado visible con el filtro actual?
    esVisible(empleadoId) {
      const f = R.estado.filtroSucursal, e = app.empleado(empleadoId);
      return !!e && (!f || e.sucursal_id === Number(f));
    },
    textoSucursal() {
      const f = R.estado.filtroSucursal;
      return f ? app.sucursalNombre(Number(f)) : "Todas las sucursales";
    },
    chipTipo(clave) {
      const t = app.tipo(clave);
      return `<span class="chip" style="--c:${esc(t.color)}">${esc(t.nombre)}</span>`;
    },
    // <option> de empleados (activos de la sucursal elegida)
    opcionesEmpleados(seleccionado, { vacia = "" } = {}) {
      const lista = app.empleadosVisibles();
      const sel = seleccionado != null ? Number(seleccionado) : null;
      // Si se está editando algo de un empleado dado de baja, que igual aparezca
      if (sel && !lista.some(e => e.id === sel) && app.empleado(sel)) lista.push(app.empleado(sel));
      // Agrupados por sucursal y ordenados por apellido, para encontrarlos rápido
      const grupos = new Map();
      [...lista].sort((a, b) => R.util.nombreEmpleado(a).localeCompare(R.util.nombreEmpleado(b))).forEach(e => {
        const s = app.sucursalNombre(e.sucursal_id);
        if (!grupos.has(s)) grupos.set(s, []);
        grupos.get(s).push(e);
      });
      const opcion = e => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${esc(R.util.nombreEmpleado(e))}${e.legajo ? " · " + esc(e.legajo) : ""}${e.activo ? "" : " (de baja)"}</option>`;
      return (vacia ? `<option value="">${esc(vacia)}</option>` : "") +
        [...grupos.entries()].map(([s, es]) => grupos.size > 1 ? `<optgroup label="${esc(s)}">${es.map(opcion).join("")}</optgroup>` : es.map(opcion).join("")).join("");
    },
    async recargarEmpleados() { R.estado.empleados = await R.api.empleados.listar(); },
    async recargarCatalogos() {
      const [sucursales, puestos, tipos, feriados] = await Promise.all([
        R.api.sucursales.listar(), R.api.puestos.listar(), R.api.tipos.listar(), R.api.feriados.listar()]);
      Object.assign(R.estado, { sucursales, puestos, tipos, feriados });
      // Puestos compartidos: si la tabla todavía no existe (migración sin correr), la app sigue andando
      R.estado.compartidos = await R.api.compartidos.listar().catch(() => []);
      R.estado.periodos = await R.api.periodos.listar().catch(() => []);
      // Horarios generales: si la migración de asistencia todavía no se corrió, se usan 30 y 10 minutos
      R.estado.horarios = await R.api.horarios.obtener().catch(() => null);
      pintarFiltroSucursal();
    },
    // Vuelve a dibujar la sección abierta (después de guardar algo)
    refrescar() { if (vistaActual) VISTAS[vistaActual]().mostrar(); },
  };
  R.app = app;

  function pintarFiltroSucursal() {
    const sel = $("filtro-sucursal");
    sel.innerHTML = `<option value="">Todas las sucursales</option>` +
      R.estado.sucursales.filter(s => s.activa).map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
    sel.value = R.estado.filtroSucursal;
  }

  function ir() {
    let nombre = location.hash.replace("#", "") || "tablero";
    if (!VISTAS[nombre] || (nombre === "configuracion" && !app.esAdmin())) nombre = "tablero";
    vistaActual = nombre;
    document.querySelectorAll("[data-seccion]").forEach(s => { s.hidden = s.id !== "vista-" + nombre; });
    document.querySelectorAll(".lateral a").forEach(a => a.classList.toggle("activo", a.dataset.vista === nombre));
    $("lateral").classList.remove("abierto");
    $("velo-menu").hidden = true;
    VISTAS[nombre]().mostrar();
  }

  // Después de un login válido (o de una sesión guardada)
  async function entrar() {
    A.mostrar("pantalla-carga");
    let perfil;
    try { perfil = await R.api.auth.miPerfil(); }
    catch (e) { A.mostrar("pantalla-login"); return A.errorLogin(e.message); }

    if (!perfil || !perfil.activo) {
      await R.api.auth.salir();
      A.mostrar("pantalla-login");
      return A.errorLogin("Tu usuario no está habilitado. Hablá con un admin.");
    }
    if (perfil.rol === "encargado" && !perfil.sucursal_id) {
      await R.api.auth.salir();
      A.mostrar("pantalla-login");
      return A.errorLogin("Tu usuario no tiene sucursal asignada. Hablá con un admin.");
    }
    R.estado.perfil = perfil;
    A.mostrarUsuario(perfil);

    try {
      await Promise.all([app.recargarCatalogos(), app.recargarEmpleados()]);
    } catch (e) { toast(e.message, "error", 6000); }

    // El encargado trabaja siempre con su sucursal
    const fija = $("sucursal-fija");
    if (!app.esAdmin()) {
      R.estado.filtroSucursal = String(perfil.sucursal_id);
      fija.innerHTML = `Sucursal <strong>${esc(app.sucursalNombre(perfil.sucursal_id))}</strong>`;
      fija.hidden = false;
    } else {
      fija.hidden = true;
      try { R.estado.filtroSucursal = localStorage.getItem("rrhh.sucursal") || ""; } catch (e) { R.estado.filtroSucursal = ""; }
      if (R.estado.filtroSucursal && !app.sucursal(Number(R.estado.filtroSucursal))) R.estado.filtroSucursal = "";
      pintarFiltroSucursal();
    }

    A.mostrar("app");
    ir();
  }

  function salir() {
    R.estado = estadoInicial();
    vistaActual = null;
  }

  const estadoInicial = () => ({ perfil: null, sucursales: [], puestos: [], feriados: [], compartidos: [], periodos: [], tipos: [], horarios: null, empleados: [], filtroSucursal: "" });

  async function arrancar() {
    R.estado = estadoInicial();
    if (!R.api.configurado()) return A.mostrar("pantalla-config");

    try { R.api.iniciar(); }
    catch (e) { A.mostrar("pantalla-login"); return A.errorLogin(e.message); }

    R.util.iniciarDialogos();
    R.util.iniciarAyudas();
    A.iniciar({ alIngresar: entrar, alSalir: salir });
    Object.values(VISTAS).forEach(v => v().iniciar());
    R.vistaFicha.iniciar();

    window.addEventListener("hashchange", () => { if (R.estado.perfil) ir(); });
    // Menú lateral: en computadora se recoge (y se recuerda); en celular se abre encima con un velo
    const esAncho = () => window.matchMedia("(min-width: 901px)").matches;
    const cerrarCelular = () => { $("lateral").classList.remove("abierto"); $("velo-menu").hidden = true; actualizarBoton(); };
    // Con solo los iconos, cada uno muestra su nombre al pasar el mouse (globo de ayuda)
    const rotularIconos = () => {
      const soloIconos = esAncho() && document.body.classList.contains("menu-cerrado");
      document.querySelectorAll("#lateral a[data-vista]").forEach(a => {
        if (soloIconos) { a.dataset.info = a.textContent.trim(); a.setAttribute("aria-label", a.textContent.trim()); }
        else { delete a.dataset.info; a.removeAttribute("aria-label"); }
      });
    };
    const actualizarBoton = () => {
      rotularIconos();
      const abierto = esAncho() ? !document.body.classList.contains("menu-cerrado") : $("lateral").classList.contains("abierto");
      $("btn-menu").setAttribute("aria-expanded", String(abierto));
      $("btn-menu").title = abierto ? "Ocultar el menú" : "Mostrar el menú";
    };
    $("btn-menu").addEventListener("click", () => {
      if (esAncho()) {
        const cerrado = document.body.classList.toggle("menu-cerrado");
        try { localStorage.setItem("rrhh.menu", cerrado ? "cerrado" : "abierto"); } catch (e) {}
      } else {
        const abierto = $("lateral").classList.toggle("abierto");
        $("velo-menu").hidden = !abierto;
      }
      actualizarBoton();
    });
    $("velo-menu").addEventListener("click", cerrarCelular);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && $("lateral").classList.contains("abierto")) cerrarCelular(); });
    window.matchMedia("(min-width: 901px)").addEventListener("change", () => { cerrarCelular(); });
    actualizarBoton();
    $("filtro-sucursal").addEventListener("change", e => {
      R.estado.filtroSucursal = e.target.value;
      try { localStorage.setItem("rrhh.sucursal", e.target.value); } catch (err) {}
      app.refrescar();
    });
    // "Cargar novedad" está en varias secciones
    document.querySelectorAll("[data-nueva-novedad]").forEach(b => b.addEventListener("click", () => R.vistaNovedades.abrirFormulario()));

    // Si la sesión se cierra o vence (en esta pestaña o en otra), volver al login
    R.api.auth.alCambiar(evento => {
      if (evento === "SIGNED_OUT") { salir(); A.mostrar("pantalla-login"); }
    });

    if (await R.api.auth.sesion()) await entrar();
    else A.mostrar("pantalla-login");
  }

  // Modo de prueba sin base de datos: solo en la PC (abrir con ?demo)
  const local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function cargarDemo() {
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "pruebas/api-falsa.js?v=" + Date.now();
      s.onload = ok; s.onerror = () => mal(new Error("No se encontró pruebas/api-falsa.js"));
      document.head.appendChild(s);
    });
  }

  (document.fonts ? document.fonts.ready : Promise.resolve())
    .then(() => (local && /[?&]demo\b/.test(location.search) ? cargarDemo() : null))
    .then(arrancar)
    .catch(e => { A.mostrar("pantalla-login"); A.errorLogin(e.message); });
})(window.RRHH);
