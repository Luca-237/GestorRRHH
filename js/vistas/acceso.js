// =====================================================================
//  Vista: pantallas de acceso (falta configurar / login / cargando) y
//  barra del usuario logueado. Decide qué se muestra según la sesión.
// =====================================================================
(function (R) {
  const { $ } = R.util;
  const PANTALLAS = ["pantalla-config", "pantalla-carga", "pantalla-login", "app"];

  function mostrar(id) {
    PANTALLAS.forEach(p => { $(p).hidden = p !== id; });
  }

  function mostrarUsuario(perfil) {
    const esAdmin = perfil.rol === "admin";
    $("usuario-nombre").textContent = perfil.nombre || R.util.aUsuario(perfil.email);
    $("usuario-rol").textContent = esAdmin ? "Admin" : "Encargado";
    $("usuario-rol").classList.toggle("admin", esAdmin);
    // Lo que solo ve un admin (la base igual lo vuelve a verificar)
    document.querySelectorAll("[data-solo-admin]").forEach(el => { el.hidden = !esAdmin; });
  }

  function errorLogin(mensaje) { $("login-error").textContent = mensaje || ""; }

  function iniciar({ alIngresar, alSalir }) {
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
    $("salir").addEventListener("click", async () => {
      await R.api.auth.salir();
      alSalir();
      mostrar("pantalla-login");
    });
  }

  R.vistaAcceso = { iniciar, mostrar, mostrarUsuario, errorLogin };
})(window.RRHH);
