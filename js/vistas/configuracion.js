// =====================================================================
//  Vista: Configuración (solo admin). Usuarios, sucursales, tipos de
//  novedad y horarios (entrada, salida y minutos a favor).
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
    $("tabla-usuarios").innerHTML = R.util.esqueleto.filas(4, 3);
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
    if (d.rol === "admin" && !await R.util.confirmar(`${d.nombre} va a ver los datos de todas las sucursales y administrar usuarios. ¿Continuar?`)) return;
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
    $("tabla-sucursales").innerHTML = `<thead><tr><th>Sucursal</th><th class="num">Empleados</th><th class="num">Entrada${info("Hora de entrada de la sucursal: con ella se calculan los minutos de cada llegada tarde. Si un empleado tiene su propia hora de entrada (en su ficha), manda la de él. Al cambiarla, se recalculan solas las llegadas tarde ya cargadas.")}</th><th class="num">Salida${info("Hora de salida de la sucursal: con ella se cuentan los minutos a favor de quienes se quedan después. Si un empleado tiene la suya propia (en su ficha), manda la de él.")}</th><th></th></tr></thead><tbody>${s.map(x => `
      <tr class="${x.activa ? "" : "inactivo"}"><td>${esc(x.nombre)}</td>
      <td class="num">${R.estado.empleados.filter(e => e.sucursal_id === x.id && e.activo).length}</td>
      <td class="num"><input type="time" value="${esc((x.hora_entrada || "09:00").slice(0, 5))}" data-sucursal-entrada="${x.id}" aria-label="Hora de entrada de ${esc(x.nombre)}" style="width:auto; padding:4px 6px"></td>
      <td class="num"><input type="time" value="${esc((x.hora_salida || "18:00").slice(0, 5))}" data-sucursal-salida="${x.id}" aria-label="Hora de salida de ${esc(x.nombre)}" style="width:auto; padding:4px 6px"></td>
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

    const hz = R.estado.horarios || {};
    $("hz-entrada").value = hz.extra_entrada_min ?? R.calc.HORARIO_POR_DEFECTO.extraEntrada;
    $("hz-salida").value = hz.extra_salida_min ?? R.calc.HORARIO_POR_DEFECTO.extraSalida;
    $("hz-modo").value = hz.modo_extra || R.calc.HORARIO_POR_DEFECTO.modo;

    const unidades = { dias: "Días", horas: "Horas", minutos: "Minutos", pesos: "Pesos ($)", registro: "Solo registro" };
    const anioActual = new Date().getFullYear();
    $("tabla-periodos").innerHTML = `<thead><tr><th>Desde</th><th>Hasta</th><th class="num">Días</th><th>Motivo</th><th>Sucursal</th><th></th></tr></thead><tbody>${
      (R.estado.periodos || []).filter(p => p.fecha_hasta >= R.util.hoy().slice(0, 4) - 1 + "-01-01").map(p => `<tr><td>${R.util.fmtFecha(p.fecha_desde)}</td><td>${R.util.fmtFecha(p.fecha_hasta)}</td>
        <td class="num">${R.util.diasEntre(p.fecha_desde, p.fecha_hasta)}</td><td>${esc(p.motivo) || "—"}</td><td>${p.sucursal_id ? esc(app().sucursalNombre(p.sucursal_id)) : "Todas"}</td>
        <td><div class="acciones-fila"><button type="button" class="link peligro" data-periodo-borrar="${p.id}">Quitar</button></div></td></tr>`).join("")
      || `<tr><td colspan="6" class="vacio">No hay períodos sin vacaciones.</td></tr>`}</tbody>`;
    $("np-sucursal").innerHTML = `<option value="">Todas</option>` + R.estado.sucursales.filter(s => s.activa).map(s => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("");
    $("tabla-feriados").innerHTML = `<thead><tr><th>Fecha</th><th>Día</th><th>Descripción</th><th></th></tr></thead><tbody>${
      R.estado.feriados.filter(f => Number(f.fecha.slice(0, 4)) >= anioActual - 1).map(f => `<tr><td>${R.util.fmtFecha(f.fecha)}</td>
        <td>${new Date(f.fecha + "T00:00:00Z").toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" })}</td>
        <td>${esc(f.descripcion)}</td><td><div class="acciones-fila"><button type="button" class="link peligro" data-feriado-borrar="${f.fecha}">Quitar</button></div></td></tr>`).join("")
      || `<tr><td colspan="4" class="vacio">No hay feriados cargados.</td></tr>`}</tbody>`;
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

    $("tabla-usuarios").addEventListener("change", async e => {
      const fila = e.target.closest("tr"), id = fila.dataset.id;
      const u = usuarios.find(x => x.id === id);
      const rol = fila.querySelector('[data-accion="rol"]').value;
      const sucursal = Number(fila.querySelector('[data-accion="sucursal"]').value) || null;
      if (rol === "encargado" && !sucursal) { toast("Elegí la sucursal del encargado.", "error"); return; }
      if (rol === "admin" && u.rol !== "admin" && !await R.util.confirmar(`${u.nombre || u.email} va a ver todas las sucursales y administrar usuarios. ¿Continuar?`)) {
        e.target.value = e.target.dataset.accion === "rol" ? u.rol : (u.sucursal_id || ""); return;
      }
      ejecutar(R.api.usuarios.cambiarRol(id, rol, sucursal), "Usuario actualizado.");
    });

    $("tabla-usuarios").addEventListener("click", async e => {
      const btn = e.target.closest("button[data-accion]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const u = usuarios.find(x => x.id === id);
      const accion = btn.dataset.accion;
      if (accion === "desactivar" && await R.util.confirmar(`¿Desactivar a ${u.nombre || u.email}? No va a poder ingresar.`)) {
        ejecutar(R.api.usuarios.desactivar(id), "Usuario desactivado.");
      } else if (accion === "activar") {
        ejecutar(R.api.usuarios.activar(id), "Usuario activado.");
      } else if (accion === "password") {
        const p = await R.util.pedir(`Nueva contraseña para ${aUsuario(u.email)}`, "", { etiqueta: "Contraseña nueva", min: 8, ayuda: "Mínimo 8 caracteres. Pasásela por un medio privado." });
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
    $("form-periodo").addEventListener("submit", async e => {
      e.preventDefault();
      const d = { fecha_desde: $("np-desde").value, fecha_hasta: $("np-hasta").value, motivo: $("np-motivo").value.trim(), sucursal_id: Number($("np-sucursal").value) || null };
      if (d.fecha_hasta < d.fecha_desde) return toast("La fecha \"hasta\" no puede ser anterior a \"desde\".", "error");
      try { await R.api.periodos.crear(d); R.estado.periodos = await R.api.periodos.listar(); pintarCatalogos(); $("form-periodo").reset(); toast("Período sin vacaciones agregado."); }
      catch (err) { toast(err.message, "error", 6000); }
    });
    $("form-feriado").addEventListener("submit", e => {
      e.preventDefault();
      conCatalogos(R.api.feriados.crear($("nf-fecha").value, $("nf-desc").value), "Feriado agregado.").then(() => $("form-feriado").reset());
    });
    $("form-horarios").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        R.estado.horarios = await R.api.horarios.actualizar({ extra_entrada_min: Number($("hz-entrada").value), extra_salida_min: Number($("hz-salida").value), modo_extra: $("hz-modo").value });
        toast("Horarios guardados. Los minutos de la planilla de asistencia se recalculan con estos valores.");
      } catch (err) { toast(err.message, "error", 6000); }
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

    $("vista-configuracion").addEventListener("click", async e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.sucursalRenombrar) {
        const s = app().sucursal(Number(b.dataset.sucursalRenombrar));
        const nombre = await R.util.pedir("Renombrar sucursal", s.nombre, { etiqueta: "Nombre" });
        if (nombre && nombre.trim() !== s.nombre) conCatalogos(R.api.sucursales.actualizar(s.id, { nombre: nombre.trim() }), "Sucursal renombrada.");
      } else if (b.dataset.sucursalActiva) {
        const s = app().sucursal(Number(b.dataset.sucursalActiva));
        conCatalogos(R.api.sucursales.actualizar(s.id, { activa: !s.activa }));
      } else if (b.dataset.periodoBorrar) {
        if (!await R.util.confirmar("¿Quitar este período? Se van a poder cargar vacaciones en esas fechas.")) return;
        R.api.periodos.eliminar(Number(b.dataset.periodoBorrar))
          .then(async () => { R.estado.periodos = await R.api.periodos.listar(); pintarCatalogos(); toast("Período quitado."); })
          .catch(err => toast(err.message, "error", 6000));
      } else if (b.dataset.feriadoBorrar) {
        if (await R.util.confirmar("¿Quitar este feriado?")) conCatalogos(R.api.feriados.eliminar(b.dataset.feriadoBorrar), "Feriado quitado.");
      } else if (b.dataset.puestoRenombrar) {
        const p = R.estado.puestos.find(x => x.id === Number(b.dataset.puestoRenombrar));
        const n = R.estado.empleados.filter(e => e.puesto === p.nombre).length;
        const nombre = await R.util.pedir("Renombrar puesto", p.nombre, { etiqueta: "Nombre", ayuda: n ? `Se cambia en ${n} ${n === 1 ? "empleado" : "empleados"}.` : "" });
        if (nombre && nombre.trim() !== p.nombre) {
          // La base renombra en cascada; se recargan los empleados para verlo al instante
          conCatalogos(R.api.puestos.actualizar(p.id, { nombre: nombre.trim() }).then(() => R.app.recargarEmpleados()), "Puesto renombrado.");
        }
      } else if (b.dataset.puestoActivo) {
        const p = R.estado.puestos.find(x => x.id === Number(b.dataset.puestoActivo));
        conCatalogos(R.api.puestos.actualizar(p.id, { activo: !p.activo }));

      } else if (b.dataset.tipoActivo) {
        const t = app().tipo(b.dataset.tipoActivo);
        conCatalogos(R.api.tipos.actualizar(t.clave, { activo: !t.activo }));
      }
    });
    $("tabla-sucursales").addEventListener("change", async e => {
      const id = Number(e.target.dataset.sucursalEntrada);
      if (!id || !e.target.value) return;
      const s = app().sucursal(id);
      if (!await R.util.confirmar(`La hora de entrada de ${s.nombre} pasa a ser las ${e.target.value}. Se recalculan los minutos de las llegadas tarde ya cargadas de sus empleados (salvo los que tienen hora propia). ¿Continuar?`)) {
        e.target.value = (s.hora_entrada || "09:00").slice(0, 5); return;
      }
      conCatalogos(R.api.sucursales.actualizar(id, { hora_entrada: e.target.value }), "Hora de entrada actualizada. Las llegadas tarde se recalcularon.");
    });
    $("tabla-sucursales").addEventListener("change", e => {
      const id = Number(e.target.dataset.sucursalSalida);
      if (!id || !e.target.value) return;
      conCatalogos(R.api.sucursales.actualizar(id, { hora_salida: e.target.value }), "Hora de salida actualizada.");
    });
    $("tabla-tipos").addEventListener("change", async e => {
      const clave = e.target.dataset.tipoColor;
      if (clave) return conCatalogos(R.api.tipos.actualizar(clave, { color: e.target.value }), "Color actualizado.");
      const cuenta = e.target.dataset.tipoCuenta;
      if (cuenta) {
        const t = app().tipo(cuenta), v = Number(e.target.value);
        const msg = v ? `Todas las novedades de "${t.nombre}" (también las ya cargadas) van a ${v > 0 ? "sumar horas a la deuda" : "descontar horas de la deuda"} de cada empleado. ¿Continuar?`
                      : `Las novedades de "${t.nombre}" dejan de mover la cuenta de horas (también las ya cargadas). ¿Continuar?`;
        if (!await R.util.confirmar(msg)) { e.target.value = String(Number(t.cuenta_horas || 0)); return; }
        conCatalogos(R.api.tipos.actualizar(cuenta, { cuenta_horas: v }), "Cuenta de horas actualizada.");
      }
    });
  }

  R.vistaConfiguracion = { iniciar, mostrar };
})(window.RRHH);
