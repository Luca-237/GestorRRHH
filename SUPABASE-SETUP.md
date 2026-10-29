# Configurar Supabase (una sola vez)

Proyecto **nuevo y separado** del de rótulos: las cuentas y los datos de RRHH no se mezclan con nada más.

## 1. Crear el proyecto
1. Entrar a https://supabase.com/dashboard → **New project**.
2. Nombre: `gestor-rrhh-cindy`. Región: **East US (North Virginia)** (la misma que rótulos).
3. Contraseña de la base: generar una larga y guardarla en un gestor de contraseñas. **No pegarla en el chat ni en el vault.**

## 2. Crear las tablas y los permisos
1. Menú **SQL Editor** → **New query**.
2. Pegar todo el contenido de `supabase/migrations/20261028000000_esquema_inicial.sql` → **Run**.
3. Tiene que terminar sin errores. Crea las sucursales (Central, Indarte, Peatonal, Chimola), los tipos de novedad y los criterios de evaluación.

> El script se puede volver a correr sin perder datos.

## 3. Apagar el registro público
**Authentication → Sign In / Providers**:
- Arriba de todo, en **User Signups**: **Allow new users to sign up** → **apagado** (las cuentas las crea un admin desde la app).
- En la lista de proveedores, **Email** → **Enable Email provider** → **PRENDIDO**. ⚠ No apagar el proveedor: si se apaga, nadie puede ingresar ("Email logins are disabled"). Lo que se apaga es el registro, no el proveedor.
- Dentro de Email, **Confirm email** → apagado (los usuarios no tienen un email real).

Para comprobarlo: un intento de registro tiene que responder `signup_disabled` y un login con datos falsos, `invalid_credentials` (no `email_provider_disabled`).

**Authentication → URL Configuration → Site URL**: `https://rrhh.bagsstore.com.ar` (o la dirección final).

## 4. Publicar la función de usuarios
**Edge Functions → Deploy a new function → Via editor**:
1. Nombre: `admin-usuarios`.
2. Pegar el contenido de `supabase/functions/admin-usuarios/index.ts` → **Deploy**.
3. Si el panel le pone otro nombre (en rótulos quedó `dynamic-processor`), copiar ese nombre en `js/config.js` → `funcionUsuarios`.

La función usa la clave de servicio que Supabase le inyecta sola. **Esa clave nunca va en el código.**

## 5. Crear el primer admin
1. **Authentication → Users → Add user → Create new user**.
   - Email: `<usuario>@rrhh.cindymayorista.com.ar` (ej. `luca@rrhh.cindymayorista.com.ar`). No hace falta que exista.
   - Contraseña: una fuerte. Marcar **Auto Confirm User**.
2. **SQL Editor**, correr (cambiando el email):
   ```sql
   update public.perfiles
   set rol = 'admin', activo = true, nombre = 'Luca'
   where email = 'luca@rrhh.cindymayorista.com.ar';
   ```
3. Los demás usuarios se crean desde la app: **Configuración → Usuarios**.

## 6. Conectar la página
**Project Settings → API Keys**: copiar la **Publishable key** (`sb_publishable_...`) y la **Project URL**, y completarlas en `js/config.js`:
```js
supabaseUrl: "https://xxxxxxxxxxxx.supabase.co",
supabaseKey: "sb_publishable_...",
```
Estas dos son públicas: lo que protege los datos son los permisos de la base (RLS). **La clave `secret` / `service_role` no va nunca en `config.js`.**

## 7. Probar los permisos
1. Crear desde la app un encargado de prueba de una sucursal.
2. Entrar con ese usuario: tiene que ver solo los empleados de su sucursal, no ve "Configuración" y no puede dar de alta empleados.
3. Desactivarlo después de la prueba.
