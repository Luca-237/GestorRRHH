# Despliegue en Ferozo

La página es estática (HTML, CSS y JS): Ferozo solo sirve archivos. Todo lo dinámico (login, datos, permisos) lo hace Supabase. **No hay servidor Node ni `.env`.**

## 1. Repo privado en GitHub
Este sistema tiene datos de empleados: el repo tiene que ser **privado** (el de rótulos es público, por eso esta carpeta está excluida de ese repo).

1. En GitHub: **New repository** → nombre `GestorRRHHCindy` → **Private** → sin README.
2. En esta carpeta:
   ```bash
   git remote add origin https://github.com/Luca-237/GestorRRHHCindy.git
   git push -u origin main
   ```

## 2. Subdominio
En el panel de Ferozo → **Dominios → Subdominios**: crear `rrhh.bagsstore.com.ar` apuntando a `public_html/rrhh`. Activar el certificado SSL (Let's Encrypt) para el subdominio.

## 3. Desplegar desde GitHub (repo privado)
Como el repo es privado, Ferozo necesita una **clave de despliegue** (igual que se hizo con devoluciones):
1. Ferozo → **GIT** → copiar la clave SSH pública que muestra.
2. GitHub → el repo → **Settings → Deploy keys → Add deploy key** → pegarla, **solo lectura**.
3. Ferozo → **GIT** → URL `git@github.com:Luca-237/GestorRRHHCindy.git`, rama `main`, ruta `/public_html/rrhh/` → **Desplegar**.

Cada cambio: `git push` y después **Desplegar** en Ferozo.

## 4. Antes de cada despliegue
- Subir el número `?v=` en **todas** las líneas de `index.html` (si no, el navegador usa la versión vieja).
- Verificar que `js/config.js` tenga la URL y la clave publishable (no la secret).

## 5. Qué protege `.htaccess`
- Fuerza HTTPS.
- Devuelve 404 para `.git/`, `supabase/`, `pruebas/` y `datos-privados/`.
- Bloquea `.md`, `.sql`, `.csv`, `.xlsx`, `.json`.
- Pide a los buscadores que no indexen la página y no deja embeberla en otra.

Probar después del primer despliegue que `https://rrhh.bagsstore.com.ar/supabase/` y `/pruebas/api-falsa.js` den 404.
