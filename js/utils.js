window.RRHH = window.RRHH || {};

(function (R) {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Para comparar/buscar: sin tildes, mayúsculas, sin espacios extremos
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

  // Usuario <-> email de login. "Antonella" -> "antonella@rrhh.cindymayorista.com.ar";
  // si ya escribieron un email completo, se respeta.
  const dominioUsuarios = () => ((window.RRHH_CONFIG || {}).dominioUsuarios || "rrhh.local").toLowerCase();
  const aEmail = u => {
    const s = String(u || "").trim().toLowerCase();
    return s.includes("@") ? s : `${s}@${dominioUsuarios()}`;
  };
  const aUsuario = email => {
    const s = String(email || "").toLowerCase(), sufijo = "@" + dominioUsuarios();
    return s.endsWith(sufijo) ? s.slice(0, -sufijo.length) : s;
  };

  // ---------- Fechas ----------
  // Se trabaja siempre con texto "AAAA-MM-DD" y Date en UTC, para que el
  // huso horario nunca corra un día.
  const DIA = 86400000;
  const aFecha = iso => new Date(iso + "T00:00:00Z");
  const aISO = d => d.toISOString().slice(0, 10);
  const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const mesActual = () => hoy().slice(0, 7);
  const sumarDias = (iso, n) => aISO(new Date(aFecha(iso).getTime() + n * DIA));
  const diasEntre = (desde, hasta) => Math.round((aFecha(hasta) - aFecha(desde)) / DIA) + 1; // inclusive
  // Días en común entre [desde, hasta] y [rDesde, rHasta] (0 si no se tocan)
  function solapamiento(desde, hasta, rDesde, rHasta) {
    const a = desde > rDesde ? desde : rDesde;
    const b = hasta < rHasta ? hasta : rHasta;
    return a > b ? 0 : diasEntre(a, b);
  }
  function rangoMes(mes) { // "2026-10"
    const [a, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
  }
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mesTexto = mes => { const [a, m] = mes.split("-"); return `${MESES[Number(m) - 1]} ${a}`; };
  const fmtFecha = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
  const fmtCorta = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
  const fmtNum = (n, dec = 0) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
  // 95 min -> "1 h 35 min"
  function fmtMinutos(min) {
    min = Math.round(min || 0);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  const nombreEmpleado = e => e ? [e.apellido, e.nombre].filter(Boolean).join(", ") : "(empleado borrado)";

  let timerToast;
  function toast(mensaje, tipo = "ok", ms = 3500) {
    const el = $("toast");
    el.textContent = mensaje;
    el.classList.toggle("error", tipo === "error");
    el.hidden = false;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { el.hidden = true; }, ms);
  }

  // CSV para Excel en español: separador ";" y BOM para que respete las tildes
  function descargarCSV(nombreArchivo, filas) {
    const celda = v => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const texto = "﻿" + filas.map(f => f.map(celda).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Cierra cualquier diálogo con los botones [data-cerrar]
  function iniciarDialogos() {
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-cerrar]");
      if (b) b.closest("dialog").close();
    });
  }

  // Íconos de interfaz (Lucide, SVG en línea; nunca emojis)
  const ICONOS = {
    alerta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  // ---------- Ayudas "i" ----------
  // Ícono que muestra una explicación mientras el mouse está encima (o tiene el foco con el teclado).
  // En el HTML fijo se escribe a mano: <span class="info" tabindex="0" data-info="…"></span>
  const info = texto => `<span class="info" tabindex="0" role="img" aria-label="${esc(texto)}" data-info="${esc(texto)}"></span>`;

  function iniciarAyudas() {
    const globo = document.createElement("div");
    globo.className = "globo-info";
    globo.setAttribute("role", "tooltip");
    globo.hidden = true;
    let actual = null;

    function mostrar(el) {
      actual = el;
      // Dentro de un diálogo abierto el globo tiene que ir adentro, si no queda tapado
      (el.closest("dialog[open]") || document.body).appendChild(globo);
      globo.textContent = el.dataset.info;
      globo.hidden = false;
      const r = el.getBoundingClientRect(), g = globo.getBoundingClientRect(), m = 8;
      let left = r.left + r.width / 2 - g.width / 2;
      left = Math.max(m, Math.min(left, window.innerWidth - g.width - m));
      let top = r.top - g.height - 8;
      if (top < m) top = r.bottom + 8; // sin lugar arriba: va abajo
      globo.style.left = `${left}px`;
      globo.style.top = `${top}px`;
    }
    function ocultar() { actual = null; globo.hidden = true; }

    document.addEventListener("mouseover", e => {
      const el = e.target.closest(".info[data-info]");
      if (el && el !== actual) mostrar(el);
    });
    document.addEventListener("mouseout", e => {
      const el = e.target.closest(".info[data-info]");
      if (el && el === actual && !el.contains(e.relatedTarget)) ocultar();
    });
    // Con el teclado (Tab) también se puede leer
    document.addEventListener("focusin", e => { if (e.target.matches(".info[data-info]:focus-visible")) mostrar(e.target); });
    document.addEventListener("focusout", e => { if (e.target === actual) ocultar(); });
    // Si la página o una tabla se mueve, el globo quedaría en el aire
    document.addEventListener("scroll", () => { if (actual) ocultar(); }, true);
    // Que tocar la "i" no abra la fila o el diálogo donde está
    document.addEventListener("click", e => { if (e.target.closest(".info[data-info]")) e.stopPropagation(); }, true);
  }

  R.util = {
    $, esc, norm, aEmail, aUsuario, hoy, mesActual, aFecha, aISO, sumarDias, diasEntre, solapamiento,
    rangoMes, mesTexto, fmtFecha, fmtCorta, fmtNum, fmtMinutos, nombreEmpleado, toast, descargarCSV,
    iniciarDialogos, info, iniciarAyudas, ICONOS,
  };
})(window.RRHH);
