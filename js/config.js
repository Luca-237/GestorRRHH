// =====================================================================
//  Conexión con Supabase. Estos dos valores son PÚBLICOS (van en el
//  navegador de todos modos): lo que protege los datos son los permisos
//  de la base (RLS). La clave "secret"/"service_role" NUNCA va acá.
//  Paso a paso en SUPABASE-SETUP.md.
// =====================================================================
window.RRHH_CONFIG = {
  supabaseUrl: "https://hmcmwpfowkqmbehfpjyh.supabase.co",   // ej: "https://xxxxxxxxxxxx.supabase.co"
  supabaseKey: "sb_publishable_lWFA6U_L9Y9UAHpT9Jti1Q_BxaOeYws",   // clave "publishable" (sb_publishable_...) o "anon"
  // "antonella" -> "antonella@rrhh.cindymayorista.com.ar" (no hace falta que el email exista)
  dominioUsuarios: "rrhh.cindymayorista.com.ar",
  // Nombre con el que quedó publicada la Edge Function de usuarios
  funcionUsuarios: "admin-usuarios",
  // Cuenta Cindy (Clerk). Clave publicable (pk_live_... o pk_test_...), no es secreta.
  // Vacía = solo el login propio de RRHH.
  clerkPublishableKey: "pk_test_bmljZS1hcmFjaG5pZC04ODY0LmNsZXJrLmFjY291bnRzLmRldiQ",
};
