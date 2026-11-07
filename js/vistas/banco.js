// =====================================================================
//  Banco de horas (dentro de Cuenta de horas). Las horas extra que se guardan
//  "en el banco" son horas a favor del empleado, en dos columnas: al 50% y al
//  100% (no se mezclan). El empleado decide después para qué usarlas:
//    · Usar: tiempo libre, o cubrir horas que debe (cuenta de horas). Descuenta
//      del banco las horas más viejas primero y deja registrado el uso.
//    · Pagar: pasan a "Pendientes de liquidar" (Horas extra), con su recargo,
//      para cobrarlas en un sueldo.
//  Un depósito es una novedad de horas extra con banco = true (ver R.calc.bancoHoras).
// =====================================================================
(function (R) {
  const { $, esc, hoy, fmtFecha, nombreEmpleado, toast, info } = R.util;
  const app = () => R.app;
  const fmtH = h => R.calc.fmtHoras(h);
  const redondear = n => Math.round(n * 100) / 100;
  let depositos = [];          // todos los depósitos visibles
  let modo = null, empleadoId = null;

  const delEmpleado = id => depositos.filter(n => n.empleado_id === id);

  async function mostrar() {
    $("tabla-banco").innerHTML = R.util.esqueleto.tabla(5, 3);
    try { depositos = (await R.api.novedades.bancoHoras()).filter(n => app().esVisible(n.empleado_id)); }
    catch (e) { depositos = []; $("tabla-banco").innerHTML = ""; $("banco-resumen").textContent = ""; return toast(e.message, "error", 6000); }

    const porEmpleado = new Map();
    depositos.forEach(n => { if (!porEmpleado.has(n.empleado_id)) porEmpleado.set(n.empleado_id, []); porEmpleado.get(n.empleado_id).push(n); });
    const filas = [...porEmpleado.entries()].map(([id, l]) => ({ e: app().empleado(id), id, b: R.calc.bancoHoras(l) }))
      .filter(f => f.b.total > 0.005).sort((a, b) => b.b.total - a.b.total);
    const total = filas.reduce((a, f) => a + f.b.total, 0), t50 = filas.reduce((a, f) => a + f.b.h50, 0), t100 = filas.reduce((a, f) => a + f.b.h100, 0);
    $("banco-resumen").textContent = filas.length ? `${fmtH(total)} en el banco de ${filas.length} ${filas.length === 1 ? "empleado" : "empleados"} · al 50%: ${fmtH(t50)} · al 100%: ${fmtH(t100)}` : "";
    const conSucursal = !R.estado.filtroSucursal;
    $("tabla-banco").innerHTML = `<thead><tr><th>Empleado</th>${conSucursal ? "<th>Sucursal</th>" : ""}
      <th class="num">Horas al 50%${info("Horas extra de días comunes guardadas en el banco. Se llevan aparte de las del 100%.")}</th>
      <th class="num">Horas al 100%${info("Horas extra de sábados desde las 13, domingos y feriados guardadas en el banco.")}</th>
      <th class="num">Total</th><th></th></tr></thead>
      <tbody>${filas.map(({ e, id, b }) => `<tr>
        <td class="clic" data-ficha="${id}" style="cursor:pointer">${esc(nombreEmpleado(e))}<small>${esc(e ? e.puesto || "" : "")}</small></td>
        ${conSucursal ? `<td>${esc(app().sucursalNombre(e && e.sucursal_id))}</td>` : ""}
        <td class="num a-favor${b.h50 ? "" : " cero"}">${b.h50 ? esc(fmtH(b.h50)) : "0"}</td>
        <td class="num a-favor${b.h100 ? "" : " cero"}">${b.h100 ? esc(fmtH(b.h100)) : "0"}</td>
        <td class="num"><strong>${esc(fmtH(b.total))}</strong></td>
        <td><div class="acciones-fila"><button type="button" class="link" data-banco-usar="${id}">Usar</button><button type="button" class="link" data-banco-pagar="${id}">Pagar</button></div></td>
      </tr>`).join("") || `<tr><td colspan="${conSucursal ? 6 : 5}" class="vacio">Nadie tiene horas en el banco. Al cargar horas extra, tildá "Guardarlas en el banco de horas".</td></tr>`}</tbody>`;
  }

  // ---------- Usar / pagar ----------
  function abrir(m, id) {
    modo = m; empleadoId = id;
    const e = app().empleado(id), b = R.calc.bancoHoras(delEmpleado(id));
    $("banco-titulo").textContent = `${m === "usar" ? "Usar horas del banco" : "Pagar horas del banco"} · ${nombreEmpleado(e)}`;
    $("banco-info").innerHTML = `En el banco: <strong>${esc(fmtH(b.h50))}</strong> al 50% · <strong>${esc(fmtH(b.h100))}</strong> al 100%. ` +
      (m === "usar" ? "Se descuentan primero las horas más viejas." : "Pasan a Pendientes de liquidar (Horas extra), con su recargo, para cobrarlas en un sueldo.");
    $("banco-recargo").value = b.h50 >= b.h100 ? "50" : "100";
    $("banco-horas").value = "";
    $("banco-uso-wrap").hidden = m !== "usar";
    $("banco-para").value = "libre";
    $("banco-fecha").value = hoy();
    $("banco-obs").value = "";
    $("banco-error").textContent = "";
    $("banco-guardar").textContent = m === "usar" ? "Usar las horas" : "Pasar a pago";
    $("dlg-banco").showModal();
    $("banco-horas").focus();
  }

  async function guardar(ev) {
    ev.preventDefault();
    $("banco-error").textContent = "";
    const recargo = Number($("banco-recargo").value), horas = Number($("banco-horas").value);
    if (!(horas > 0)) return ($("banco-error").textContent = "Indicá cuántas horas.");
    const { tomas, faltan } = R.calc.repartirBanco(delEmpleado(empleadoId), recargo, horas);
    if (faltan > 0.005) return ($("banco-error").textContent = `Solo hay ${fmtH(horas - faltan)} al ${recargo}% en el banco.`);
    const fecha = $("banco-fecha").value || hoy();
    $("banco-guardar").disabled = true;
    try {
      if (modo === "usar") {
        // Cada depósito anota cuánto se usó; lo que se usó se resta del banco
        for (const t of tomas) {
          const nuevo = t.toma >= t.rem - 0.005 ? Number(t.dep.cantidad) : redondear((Number(t.dep.banco_usado) || 0) + t.toma);
          await R.api.novedades.actualizar(t.dep.id, { banco_usado: nuevo });
        }
        const para = $("banco-para").value, obs = $("banco-obs").value.trim();
        await R.api.novedades.crear({ empleado_id: empleadoId, tipo: "banco_uso", fecha_desde: fecha, cantidad: horas,
          observacion: [`Del banco, horas al ${recargo}%: ${para === "deuda" ? "para cubrir horas que debe" : "tiempo libre"}`, obs].filter(Boolean).join(" — ") });
        // Si se usan para cubrir lo que debe, también se registra la devolución (baja la deuda de la cuenta de horas)
        if (para === "deuda") await R.api.novedades.crear({ empleado_id: empleadoId, tipo: "devolucion_horas", fecha_desde: fecha, cantidad: horas, observacion: "Cubierta con horas del banco" });
        toast(`Se usaron ${fmtH(horas)} del banco${para === "deuda" ? " y se descontaron de lo que debe" : ""}.`);
      } else {
        // Pagar: el depósito entero pasa a pago; si se paga solo una parte, esa parte se separa como horas extra común
        for (const t of tomas) {
          if (t.toma >= t.rem - 0.005 && !(Number(t.dep.banco_usado) > 0)) await R.api.novedades.actualizar(t.dep.id, { banco: false });
          else {
            await R.api.novedades.crear({ empleado_id: empleadoId, tipo: "horas_extra", fecha_desde: t.dep.fecha_desde, cantidad: redondear(t.toma),
              recargo, banco: false, observacion: "Del banco de horas" });
            await R.api.novedades.actualizar(t.dep.id, { cantidad: redondear(Number(t.dep.cantidad) - t.toma) });
          }
        }
        toast(`${fmtH(horas)} al ${recargo}% pasaron a Pendientes de liquidar (Horas extra).`);
      }
      $("dlg-banco").close();
      mostrar();
      if (R.vistaFicha.refrescarSiAbierta) R.vistaFicha.refrescarSiAbierta();
    } catch (err) { $("banco-error").textContent = err.message; mostrar(); }
    finally { $("banco-guardar").disabled = false; }
  }

  function iniciar() {
    $("form-banco").addEventListener("submit", guardar);
    $("caja-banco").addEventListener("click", e => {
      if (e.target.closest("#banco-nuevo")) return R.vistaNovedades.abrirFormulario({ tipo: "horas_extra", interno: true });
      const u = e.target.closest("[data-banco-usar]"), p = e.target.closest("[data-banco-pagar]"), f = e.target.closest("[data-ficha]");
      if (u) abrir("usar", Number(u.dataset.bancoUsar));
      else if (p) abrir("pagar", Number(p.dataset.bancoPagar));
      else if (f) R.vistaFicha.abrir(Number(f.dataset.ficha));
    });
  }

  R.banco = { iniciar, mostrar };
})(window.RRHH);
