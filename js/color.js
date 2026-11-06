// Color de fondo a gusto. Desde un solo color se calculan todos los tonos que lo acompañan
// (bordes, encabezados de tabla, filas bajo el mouse, fines de semana del calendario, textos),
// y se pone una hoja de estilos que pisa los tonos de css/app.css. Se guarda en este navegador:
// es personal y no cambia lo que ven los demás.
// Para que siempre se lea bien, el color se lleva a un tono pastel: se respeta el matiz y la
// intensidad, pero la luminosidad se limita (entre 78 % y 93 %).
// Funciona igual en el navegador (window.ColorFondo) y en Node (require).
(function (global) {
  'use strict';

  const DEFECTO = '#FBEADD';   // el durazno pastel de siempre
  const CLAVE = 'rrhh.color';
  const RE_HEX = /^#[0-9a-f]{6}$/i;

  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

  function hexAHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslAHex(h, s, l) {
    s = limitar(s, 0, 100) / 100; l = limitar(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  }

  // El color elegido, llevado a un pastel que se lee bien
  function pastel(hex) {
    const { h, s, l } = hexAHsl(hex);
    return { h, s, l: limitar(l, 78, 93) };
  }

  // Todos los tonos a partir del matiz y la intensidad (las proporciones salen del durazno original)
  function paleta(hex) {
    const { h, s, l } = pastel(hex), c = (sat, lum) => hslAHex(h, sat, lum);
    return {
      '--fondo': c(s, l), '--fondo-hundido': c(s, l - 4.5),
      '--linea': c(s * .5, 89.5), '--linea-fuerte': c(s * .42, 83),
      '--naranja-tenue': c(Math.min(100, s), 97.5),
      '--negro': c(20, 9), '--texto': c(16, 14), '--muted': c(10, 42), '--tenue': c(10, 68),
      '--dia-finde': c(s, 98.2), '--dia-fuera': c(s * .5, 96.5),
    };
  }

  const bloque = vars => Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('');

  // Hoja de estilos que pisa :root
  function css(hex) { return `:root{${bloque(paleta(hex))}}`; }

  const esDefecto = hex => !hex || hex.toLowerCase() === DEFECTO.toLowerCase();

  // Pone (o saca, si es el de siempre) la hoja de estilos
  function aplicar(hex) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('color-usuario');
    if (!hex || !RE_HEX.test(hex) || esDefecto(hex)) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('style'); el.id = 'color-usuario'; document.head.appendChild(el); }
    el.textContent = css(hex);
  }

  function leer() {
    try { const v = localStorage.getItem(CLAVE); return v && RE_HEX.test(v) ? v : null; } catch (e) { return null; }
  }
  function guardar(hex) {
    try { if (esDefecto(hex)) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, hex); } catch (e) { /* sin almacenamiento: queda solo en esta pestaña */ }
  }

  const api = { DEFECTO, RE_HEX, hexAHsl, hslAHex, pastel, paleta, css, aplicar, leer, guardar, esDefecto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ColorFondo = api;
})(typeof window !== 'undefined' ? window : globalThis);
