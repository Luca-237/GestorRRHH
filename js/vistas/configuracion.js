// =====================================================================
//  Vista: Configuración (solo admin). Usuarios, sucursales, tipos de
//  novedad y criterios de evaluación.
// =====================================================================
(function (R) {
  const { $, esc, norm, toast, aEmail, aUsuario, info } = R.util;
  const app = () => R.app;
  let usuarios = [];

  function fechaHora(iso) {
    if (!iso) return "nunca";
    return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const opcionesSucursal = (sel, vacia) => (vacia ? `<option value="">${esc(vacia)}</option>` : "") +
    R.estado.sucursales.filter(s => s.activa || s.id === sel).map(s => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(s.nombre)}</option>`).join("");

  // ---------- Usuarios ----------
  function pintarUsuarios() {
    $("tabla-usuarios").innerHTML = usuarios.map(u => `
      <tr class="${u.activo ? "" : "inactivo"}" data-id="${esc(u.id)}">
        <td>${esc(u.nombre || "(sin nombre)")}${u.soy_yo ? " <small>(vos)</small>" : ""}<small>Usuario: ${esc(aUsuario(u.email))}</small></td>
        <td>
          <select data-accion="rol" ${u.soy_yo ? "disabled title=\"No podés cambiar tu propio rol\"" : ""}>
            <option value="encargado" ${u.rol === "encargado" ? "selected" : ""}>Encargado</option>
            <option value="admin" ${u.rol === "admin" ? "selected" : ""}>Admin</option>
          </select>
          <select data-accion="sucursal" ${u.soy_yo ? "disabled" : ""}>${opcionesSucursal(u.sucursal_id, u.rol === "admin" ? "Todas" : "Elegir…")}</select>
        </td>
        <td>${u.activo ? "Activo" : "Desactivado"}<small>Último ingreso: ${fechaHora(u.ultimo_ingreso)}</small></td>
        <td><div class="acciones-fila">
          <button type="button" class="link" data-accion="password">Nueva contraseña</button>
          ${u.soy_yo ? "" : `<button type="button" class="link" data-accion="${u.activo ? "desactivar" : "activar"}">${u.activo ? "Desactivar" : "Activar"}</button>`}
        </div></td>
      </tr>`).join("") || `<tr><td colspan="4">No hay usuarios.</td></tr>`;
  }

  async function cargarUsuarios() {
    $("tabla-usuarios").innerHTML = `<tr><td colspan="4" class="cargando">Cargando usuarios…</td></tr>`;
    try { usuarios = await R.api.usuarios.listar(); pintarUsuarios(); }
    catch (e) { $("tabla-usuarios").innerHTML = `<tr><td colspan="4">${esc(e.message)}</td></tr>`; }
  }

  async function ejecutar(promesa, ok) {
    try { await promesa; toast(ok); }
    catch (e) { toast(e.message, "error", 6000); }
    await cargarUsuarios();
  }

  async function crearUsuario(e) {
    e.preventDefault();
    $("usuario-error").textContent = "";
    const d = {
      nombre: $("nu-nombre").value.trim(), email: aEmail($("nu-email").value),
      password: $("nu-password").value, rol: $("nu-rol").value,
      sucursal_id: Number($("nu-sucursal").value) || null,
    };
    if (d.rol === "encargado" && !d.sucursal_id) return ($("usuario-error").textContent = "Un encargado necesita una sucursal.");
    if (d.rol === "admin" && !confirm(`${d.nombre} va a ver los datos de todas las sucursales y administrar usuarios. ¿Continuar?`)) return;
    $("nu-crear").disabled = true;
    try {
      await R.api.usuarios.crear(d);
      toast(`Usuario "${aUsuario(d.email)}" creado. Pasale la contraseña por un medio privado.`, "ok", 6000);
      $("form-usuario").reset();
      pintarSelectNuevo();
      await cargarUsuarios();
    } catch (err) {
      $("usuario-error").textContent = err.message;
    } finally { $("nu-crear").disabled = false; }
  }

  function pintarSelectNuevo() {
    const admin = $("nu-rol").value === "admin";
    $("nu-sucursal").innerHTML = opcionesSucursal(null, admin ? "Todas (admin)" : "Elegí la sucursal");
  }

  // ---------- Catálogos ----------
  function pintarCatalogos() {
    const s = R.estado.sucursales;
    $("tabla-sucursales").innerHTML = `<thead><tr><th>Sucursal</th><th class="num">Empleados</th><th></th></tr></thead><tbody>${s.map(x => `
      <tr class="${x.activa ? "" : "inactivo"}"><td>${esc(x.nombre)}</td>
      <td class="num">${R.estado.empleados.filter(e => e.sucursal_id === x.id && e.activo).length}</td>
      <td><div class="acciones-fila">
        <button type="button" class="link" data-sucursal-renombrar="${x.id}">Renombrar</button>
        <button type="button" class="link" data-sucursal-activa="${x.id}">${x.activa ? "Desactivar" : "Activar"}</button>
      </div></td></tr>`).join("")}</tbody>`;

    $("tabla-puestos").innerHTML = `<thead><tr><th>Puesto</th><th class="num">Empleados</th><th></th></tr></thead><tbody>${R.estado.puestos.map(p => `
      <tr class="${p.activo ? "" : "inactivo"}"><td>${esc(p.nombre)}${p.activo ? "" : "<small>Desactivado</small>"}</td>
      <td class="num">${R.estado.empleados.filter(e => e.puesto === p.nombre && e.activo).length}</td>
      <td><div class="acciones-fila">
        <button type="button" class="link" data-puesto-renombrar="${p.id}">Renombrar</button>
        <button type="button" class="link" data-puesto-activo="${p.id}">${p.activo ? "Desactivar" : "Activar"}</button>
      </div></td></tr>`).join("") || `<tr><td colspan="3" class="vacio">No hay puestos.</td></tr>`}</tbody>`;

    $("tabla-criterios").innerHTML = `<thead><tr><th>Criterio</th><th></th></tr></thead><tbody>${R.estado.criterios.map(c => `
      <tr class="${c.activo ? "" : "inactivo"}"><td>${esc(c.nombre)}${c.descripcion ? `<small>${esc(c.descripcion)}</small>` : ""}</td>
      <td><div class="acciones-fila"><button type="button" class="link" data-criterio-activo="${c.id}">${c.activo ? "Desactivar" : "Activar"}</button></div></td></tr>`).join("")}</tbody>`;

    const unidades = { dias: "Días", horas: "Horas", minutos: "Minutos" };
    $("tabla-tipos").innerHTML = `<thead><tr><th>Tipo</th><th>Se mide en${info("Días: se carga desde/hasta y se cuentan días corridos. Horas o minutos: se carga una fecha y la cantidad.")}</th><th>Ausencia${info("Si es ausencia, el empleado aparece en \"Hoy no están\" y en \"Próximas ausencias\" mientras dure.")}</th><th>Descuenta vacaciones${info("Si descuenta vacaciones, los días se restan del saldo de vacaciones del empleado.")}</th><th>Cuenta de horas${info("Si el tipo suma horas a lo que el empleado debe (ej. un permiso a devolver), las descuenta (ej. una devolución) o no toca la cuenta. Los días se pasan a horas con la jornada del empleado. Ej.: si querés que las llegadas tarde se devuelvan, elegí \"Suma a la deuda\".")}</th><th>Color</th><th></th></tr></thead><tbody>${R.estado.tipos.map(t => `
      <tr class="${t.activo ? "" : "inactivo"}"><td>${app().chipTipo(t.clave)}${t.del_sistema ? "<small>De fábrica</small>" : ""}</td>
      <td>${unidades[t.unidad]}</td><td>${t.es_ausencia ? "Sí" : "No"}</td><td>${t.descuenta_vacaciones ? "Sí" : "No"}</td>
      <td><select data-tipo-cuenta="${esc(t.clave)}" aria-label="Cuenta de horas de ${esc(t.nombre)}">${[[0, "No la toca"], [1, "Suma a la deuda"], [-1, "Descuenta"]]
        .map(([v, txt]) => `<option value="${v}" ${Number(t.cuenta_horas || 0) === v ? "selected" : ""}>${txt}</option>`).join("")}</select></td>
      <td><input type="color" value="${esc(t.color)}" data-tipo-color="${esc(t.clave)}" style="width:44px; padding:2px; height:28px" aria-label="Color de ${esc(t.nombre)}"></td>
      <td><div class="acciones-fila">${t.del_sistema ? "" : `<button type="button" class="link" data-tipo-activo="${esc(t.clave)}">${t.activo ? "Desactivar" : "Activar"}</button>`}</div></td></tr>`).join("")}</tbody>`;
  }

  async function conCatalogos(promesa, ok) {
    try { await promesa; await R.app.recargarCatalogos(); pintarCatalogos(); pintarSelectNuevo(); if (ok) toast(ok); }
    catch (e) { toast(e.message, "error", 6000); }
  }

  function mostrar() {
    pintarSelectNuevo();
    pintarCatalogos();
    cargarUsuarios();
  }

  function iniciar() {
    $("form-usuario").addEventListener("submit", crearUsuario);
    $("nu-rol").addEventListener("change", pintarSelectNuevo);

    $("tabla-usuarios").addEventListener("change", e => {
      const fila = e.target.closest("tr"), id = fila.dataset.id;
      const u = usuarios.find(x => x.id === id);
      const rol = fila.querySelector('[data-accion="rol"]').value;
      const sucursal = Number(fila.querySelector('[data-accion="sucursal"]').value) || null;
      if (rol === "encargado" && !sucursal) { toast("Elegí la sucursal del encargado.", "error"); return; }
      if (rol === "admin" && u.rol !== "admin" && !confirm(`${u.nombre || u.email} va a ver todas las sucursales y administrar usuarios. ¿Continuar?`)) {
        e.target.value = e.target.dataset.accion === "rol" ? u.rol : (u.sucursal_id || ""); return;
      }
      ejecutar(R.api.usuarios.cambiarRol(id, rol, sucursal), "Usuario actualizado.");
    });

    $("tabla-usuarios").addEventListener("click", e => {
      const btn = e.target.closest("button[data-accion]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const u = usuarios.find(x => x.id === id);
      const accion = btn.dataset.accion;
      if (accion === "desactivar" && confirm(`¿Desactivar a ${u.nombre || u.email}? No va a poder ingresar.`)) {
        ejecutar(R.api.usuarios.desactivar(id), "Usuario desactivado.");
      } else if (accion === "activar") {
        ejecutar(R.api.usuarios.activar(id), "Usuario activado.");
      } else if (accion === "password") {
        const p = prompt(`Nueva contraseña para ${aUsuario(u.email)} (mínimo 8 caracteres):`);
        if (p) ejecutar(R.api.usuarios.resetearPassword(id, p), "Contraseña cambiada. Pasala por un medio privado.");
      }
    });

    $("form-sucursal").addEventListener("submit", e => {
      e.preventDefault();
      conCatalogos(R.api.sucursales.crear($("ns-nombre").value), "Sucursal agregada.").then(() => $("form-sucursal").reset());
    });
    $("form-puesto").addEventListener("submit", e => {
      e.preventDefault();
      conCatalogos(R.api.puestos.crear($("np-nombre").value), "Puesto agregado.").then(() => $("form-puesto").reset());
    });
    $("form-criterio").addEventListener("submit", e => {
      e.preventDefault();
      conCatalogos(R.api.criterios.crear($("nc-nombre").value), "Criterio agregado.").then(() => $("form-criterio").reset());
    });
    $("form-tipo").addEventListener("submit", e => {
      e.preventDefault();
      const nombre = $("nt-nombre").value.trim();
      const clave = norm(nombre).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!clave) return;
      if (R.estado.tipos.some(t => t.clave === clave)) return toast("Ya existe un tipo con ese nombre.", "error");
      conCatalogos(R.api.tipos.crear({
        clave, nombre, unidad: $("nt-unidad").value, es_ausencia: $("nt-ausencia").checked, cuenta_horas: Number($("nt-cuenta").value),
        orden: 50 + R.estado.tipos.length,
      }), "Tipo de novedad agregado.").then(() => $("form-tipo").reset());
    });

    $("vista-configuracion").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.sucursalRenombrar) {
        const s = app().sucursal(Number(b.dataset.sucursalRenombrar));
        const nombre = prompt("Nuevo nombre de la sucursal:", s.nombre);
        if (nombre && nombre.trim() !== s.nombre) conCatalogos(R.api.sucursales.actualizar(s.id, { nombre: nombre.trim() }), "Sucursal renombrada.");
      } else if (b.dataset.sucursalActiva) {
        const s = app().sucursal(Number(b.dataset.sucursalActiva));
        conCatalogos(R.api.sucursales.actualizar(s.id, { activa: !s.activa }));
      } else if (b.dataset.puestoRenombrar) {
        const p = R.estado.puestos.find(x => x.id === Number(b.dataset.puestoRenombrar));
        const n = R.estado.empleados.filter(e => e.puesto === p.nombre).length;
        const nombre = prompt(`Nuevo nombre del puesto${n ? ` (se cambia en ${n} ${n === 1 ? "empleado" : "empleados"})` : ""}:`, p.nombre);
        if (nombre && nombre.trim() !== p.nombre) {
          // La base renombra en cascada; se recargan los empleados para verlo al instante
          conCatalogos(R.api.puestos.actualizar(p.id, { nombre: nombre.trim() }).then(() => R.app.recargarEmpleados()), "Puesto renombrado.");
        }
      } else if (b.dataset.puestoActivo) {
        const p = R.estado.puestos.find(x => x.id === Number(b.dataset.puestoActivo));
        conCatalogos(R.api.puestos.actualizar(p.id, { activo: !p.activo }));
      } else if (b.dataset.criterioActivo) {
        const c = R.estado.criterios.find(x => x.id === Number(b.dataset.criterioActivo));
        conCatalogos(R.api.criterios.actualizar(c.id, { activo: !c.activo }));
      } else if (b.dataset.tipoActivo) {
        const t = app().tipo(b.dataset.tipoActivo);
        conCatalogos(R.api.tipos.actualizar(t.clave, { activo: !t.activo }));
      }
    });
    $("tabla-tipos").addEventListener("change", e => {
      const clave = e.target.dataset.tipoColor;
      if (clave) return conCatalogos(R.api.tipos.actualizar(clave, { color: e.target.value }), "Color actualizado.");
      const cuenta = e.target.dataset.tipoCuenta;
      if (cuenta) {
        const t = app().tipo(cuenta), v = Number(e.target.value);
        const msg = v ? `Todas las novedades de "${t.nombre}" (también las ya cargadas) van a ${v > 0 ? "sumar horas a la deuda" : "descontar horas de la deuda"} de cada empleado. ¿Continuar?`
                      : `Las novedades de "${t.nombre}" dejan de mover la cuenta de horas (también las ya cargadas). ¿Continuar?`;
        if (!confirm(msg)) { e.target.value = String(Number(t.cuenta_horas || 0)); return; }
        conCatalogos(R.api.tipos.actualizar(cuenta, { cuenta_horas: v }), "Cuenta de horas actualizada.");
      }
    });
  }

  R.vistaConfiguracion = { iniciar, mostrar };
})(window.RRHH);
