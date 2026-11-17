// =====================================================================
//  Vista: pantallas de acceso (falta configurar / login / cargando) y
//  barra del usuario logueado. Decide qué se muestra según la sesión.
//  Dos formas de entrar: cuenta Cindy (Clerk) o usuario propio de RRHH.
// =====================================================================
(function (R) {
  const { $ } = R.util;
  const PANTALLAS = ["pantalla-config", "pantalla-carga", "pantalla-login", "app"];
  const CC = () => window.CuentaCindy;

  function mostrar(id) {
    PANTALLAS.forEach(p => { $(p).hidden = p !== id; });
  }

  function mostrarUsuario(perfil) {
    const esAdmin = perfil.rol === "admin";
    $("usuario-nombre").textContent = perfil.nombre || R.util.aUsuario(perfil.email);
    $("usuario-rol").textContent = esAdmin ? "Admin" : "Encargado";
    $("usuario-rol").classList.toggle("admin", esAdmin);
    $("usuario-via").hidden = perfil.via !== "clerk";
    $("salir").title = perfil.via === "clerk" ? "Cierra la cuenta Cindy en todas las apps" : "";
    // Lo que solo ve un admin (la base igual lo vuelve a verificar)
    document.querySelectorAll("[data-solo-admin]").forEach(el => { el.hidden = !esAdmin; });
  }

  function errorLogin(mensaje) { $("login-error").textContent = mensaje || ""; }

  // Muestra u oculta el botón de cuenta Cindy según si Clerk cargó
  function mostrarCindy() {
    const hay = !!(CC() && CC().hayClerk());
    $("login-cindy").hidden = !hay;
    $("form-login").classList.toggle("con-cindy", hay);
    $("salir-cindy").hidden = !(hay && CC().conSesion());
  }

  function iniciar({ alIngresar, alIngresarCindy, alSalir }) {
    $("form-login").addEventListener("submit", async e => {
      e.preventDefault();
      errorLogin("");
      $("login-btn").disabled = true;
      try {
        await R.api.auth.ingresar($("login-email").value, $("login-password").value);
        $("login-password").value = "";
        await alIngresar();
      } catch (err) {
        errorLogin(err.message);
      } finally { $("login-btn").disabled = false; }
    });
    $("login-clerk").addEventListener("click", () => {
      errorLogin("");
      if (CC().conSesion()) alIngresarCindy(); // ya hay sesión (por ej. de otra app)
      else CC().abrirIngreso();
    });
    $("salir-cindy").addEventListener("click", async () => {
      await CC().salir();
      errorLogin("");
      mostrarCindy();
    });
    $("salir").addEventListener("click", async () => {
      const cindy = R.api.auth.via && R.api.auth.via() === "clerk";
      if (cindy && !await R.util.confirmar("Se va a cerrar tu cuenta Cindy en todas las apps (Panel, rótulos, RRHH y las demás). ¿Continuar?", { aceptar: "Salir" })) return;
      await R.api.auth.salir({ cuentaCindy: cindy });
      alSalir();
      mostrarCindy();
      mostrar("pantalla-login");
    });
  }

  R.vistaAcceso = { iniciar, mostrar, mostrarUsuario, errorLogin, mostrarCindy };
})(window.RRHH);
