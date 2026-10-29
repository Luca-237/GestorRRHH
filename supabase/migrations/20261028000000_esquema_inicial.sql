-- =====================================================================
--  Gestor de RRHH — Cindy Mayorista. Esquema inicial.
--  Se corre UNA vez en Supabase → SQL Editor (ver SUPABASE-SETUP.md).
--  Se puede volver a correr: no borra datos.
--
--  Roles:
--    admin      → ve y carga todo, en todas las sucursales; administra usuarios.
--    encargado  → ve y carga novedades/evaluaciones solo de SU sucursal.
--  Los permisos los controla la base (RLS): aunque alguien toque el
--  JavaScript del navegador, no puede ver ni cambiar lo que no le corresponde.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Sucursales
-- ---------------------------------------------------------------------
create table if not exists public.sucursales (
  id         bigint generated always as identity primary key,
  nombre     text not null unique check (length(trim(nombre)) > 0),
  orden      int not null default 100,
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);

insert into public.sucursales (nombre, orden) values
  ('Central', 1), ('Indarte', 2), ('Peatonal', 3), ('Chimola', 4)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- 2) Perfiles de usuario (uno por cuenta de Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  nombre       text not null default '',
  rol          text not null default 'encargado' check (rol in ('admin', 'encargado')),
  sucursal_id  bigint references public.sucursales(id) on delete set null,
  -- Las cuentas nacen desactivadas: si alguien se registra por su cuenta, no entra.
  activo       boolean not null default false,
  creado_en    timestamptz not null default now()
);

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.es_usuario_activo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

-- Sucursal del encargado logueado (null si es admin sin sucursal o no tiene)
create or replace function public.mi_sucursal()
returns bigint
language sql stable security definer set search_path = public
as $$
  select sucursal_id from public.perfiles where id = auth.uid() and activo;
$$;

create or replace function public.puede_ver_sucursal(p_sucursal bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.es_admin()
      or (p_sucursal is not null and public.es_usuario_activo() and p_sucursal = public.mi_sucursal());
$$;

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, activo)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', ''), false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Usuarios que ya existieran antes de correr este script
insert into public.perfiles (id, email, nombre)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'nombre', '')
from auth.users u
on conflict (id) do nothing;

-- Nunca puede quedar el sistema sin un admin activo
create or replace function public.proteger_ultimo_admin()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from public.perfiles
                     where rol = 'admin' and activo and id <> old.id) then
    raise exception 'No se puede quitar el último admin activo';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists proteger_admin on public.perfiles;
create trigger proteger_admin
  before update or delete on public.perfiles
  for each row execute function public.proteger_ultimo_admin();

-- Marca de última modificación (quién y cuándo)
create or replace function public.marcar_actualizacion()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Empleados
--    Solo datos laborales. Los datos de salud y de emergencia NO van acá.
-- ---------------------------------------------------------------------
create table if not exists public.empleados (
  id               bigint generated always as identity primary key,
  apellido         text not null check (length(trim(apellido)) > 0),
  nombre           text not null default '',
  dni              text not null default '',
  cuil             text not null default '',
  sucursal_id      bigint not null references public.sucursales(id),
  puesto           text not null default '',
  jornada_horas    numeric(4,1) check (jornada_horas is null or jornada_horas between 0 and 24),
  fecha_ingreso    date,
  fecha_egreso     date,
  activo           boolean not null default true,
  telefono         text not null default '',
  notas            text not null default '',
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid() references auth.users(id) on delete set null,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  check (fecha_egreso is null or fecha_ingreso is null or fecha_egreso >= fecha_ingreso)
);
create index if not exists empleados_sucursal_idx on public.empleados (sucursal_id);
create unique index if not exists empleados_dni_uq on public.empleados (dni) where dni <> '';

drop trigger if exists empleados_actualizacion on public.empleados;
create trigger empleados_actualizacion
  before update on public.empleados
  for each row execute function public.marcar_actualizacion();

create or replace function public.puede_ver_empleado(p_empleado bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select public.puede_ver_sucursal(e.sucursal_id) from public.empleados e where e.id = p_empleado), false);
$$;

-- ---------------------------------------------------------------------
-- 4) Tipos de novedad (el admin puede agregar más desde la app)
--    unidad: en qué se mide la cantidad (días, minutos u horas).
-- ---------------------------------------------------------------------
create table if not exists public.tipos_novedad (
  clave                 text primary key check (clave ~ '^[a-z0-9_]+$'),
  nombre                text not null check (length(trim(nombre)) > 0),
  unidad                text not null check (unidad in ('dias', 'minutos', 'horas')),
  descuenta_vacaciones  boolean not null default false,
  es_ausencia           boolean not null default false,  -- el empleado no está ese día
  color                 text not null default '#6b6b6b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  orden                 int not null default 100,
  activo                boolean not null default true,
  del_sistema           boolean not null default false   -- los de fábrica no se borran
);

insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema) values
  ('vacaciones',        'Vacaciones',                    'dias',    true,  true,  '#e84e1b', 1, true),
  ('franco',            'Franco',                        'dias',    false, true,  '#000000', 2, true),
  ('llegada_tarde',     'Llegada tarde',                 'minutos', false, false, '#c63f12', 3, true),
  ('horas_extra',       'Horas extra',                   'horas',   false, false, '#3a3a3a', 4, true),
  ('licencia_medica',   'Licencia médica',               'dias',    false, true,  '#8a8a8a', 5, true),
  ('falta',             'Falta / inasistencia',          'dias',    false, true,  '#b00020', 6, true),
  ('licencia_especial', 'Licencia especial',             'dias',    false, true,  '#5a5a5a', 7, true)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 5) Novedades: vacaciones, francos, llegadas tarde, horas extra, licencias…
--    cantidad: días (se calcula solo con las fechas), minutos u horas.
-- ---------------------------------------------------------------------
create table if not exists public.novedades (
  id               bigint generated always as identity primary key,
  empleado_id      bigint not null references public.empleados(id) on delete cascade,
  tipo             text not null references public.tipos_novedad(clave),
  fecha_desde      date not null,
  fecha_hasta      date not null,
  cantidad         numeric(8,2) not null default 0 check (cantidad >= 0),
  recargo          smallint check (recargo is null or recargo in (50, 100)), -- horas extra al 50% / 100%
  anio_vacaciones  int,          -- período vacacional al que se descuenta (solo vacaciones)
  con_certificado  boolean,      -- licencias médicas
  observacion      text not null default '',
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid() references auth.users(id) on delete set null,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  check (fecha_hasta >= fecha_desde)
);
create index if not exists novedades_empleado_idx on public.novedades (empleado_id);
create index if not exists novedades_fechas_idx on public.novedades (fecha_desde, fecha_hasta);
create index if not exists novedades_tipo_idx on public.novedades (tipo);

-- Completa lo que se deduce solo: días corridos y período vacacional.
create or replace function public.completar_novedad()
returns trigger
language plpgsql
as $$
declare
  t public.tipos_novedad;
begin
  select * into t from public.tipos_novedad where clave = new.tipo;
  if new.fecha_hasta is null then new.fecha_hasta := new.fecha_desde; end if;
  if t.unidad = 'dias' then
    new.cantidad := (new.fecha_hasta - new.fecha_desde) + 1;
  else
    -- Minutos u horas: es un solo día
    new.fecha_hasta := new.fecha_desde;
  end if;
  if t.descuenta_vacaciones then
    -- Período vacacional (LCT): del 1/10 al 30/4. Lo tomado de enero a abril
    -- corresponde por defecto al año anterior. Se puede indicar a mano.
    if new.anio_vacaciones is null then
      new.anio_vacaciones := extract(year from new.fecha_desde)::int
                             - case when extract(month from new.fecha_desde) <= 4 then 1 else 0 end;
    end if;
  else
    new.anio_vacaciones := null;
  end if;
  if new.tipo <> 'horas_extra' then new.recargo := null; end if;
  return new;
end;
$$;

drop trigger if exists novedades_completar on public.novedades;
create trigger novedades_completar
  before insert or update on public.novedades
  for each row execute function public.completar_novedad();

drop trigger if exists novedades_actualizacion on public.novedades;
create trigger novedades_actualizacion
  before update on public.novedades
  for each row execute function public.marcar_actualizacion();

-- ---------------------------------------------------------------------
-- 6) Ajustes de vacaciones (días arrastrados, acuerdos, correcciones)
-- ---------------------------------------------------------------------
create table if not exists public.vacaciones_ajustes (
  id           bigint generated always as identity primary key,
  empleado_id  bigint not null references public.empleados(id) on delete cascade,
  anio         int not null check (anio between 2000 and 2100),
  dias         numeric(5,1) not null check (dias <> 0),  -- + suma, − resta
  motivo       text not null check (length(trim(motivo)) > 0),
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists vacaciones_ajustes_empleado_idx on public.vacaciones_ajustes (empleado_id, anio);

-- ---------------------------------------------------------------------
-- 7) Evaluaciones de desempeño
-- ---------------------------------------------------------------------
create table if not exists public.criterios_evaluacion (
  id           bigint generated always as identity primary key,
  nombre       text not null unique check (length(trim(nombre)) > 0),
  descripcion  text not null default '',
  orden        int not null default 100,
  activo       boolean not null default true
);

insert into public.criterios_evaluacion (nombre, descripcion, orden) values
  ('Puntualidad y asistencia',     'Llega en horario, avisa ausencias con tiempo.', 1),
  ('Atención al cliente',          'Trato, predisposición y resolución con los clientes.', 2),
  ('Trabajo en equipo',            'Colabora con compañeros y otras áreas.', 3),
  ('Responsabilidad y compromiso', 'Cumple sus tareas sin que haya que recordárselas.', 4),
  ('Orden y prolijidad',           'Mantiene el puesto, el depósito y la exhibición en orden.', 5),
  ('Conocimiento de productos',    'Conoce el surtido, precios y características.', 6)
on conflict (nombre) do nothing;

create table if not exists public.evaluaciones (
  id           bigint generated always as identity primary key,
  empleado_id  bigint not null references public.empleados(id) on delete cascade,
  fecha        date not null default current_date,
  periodo      text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- 'AAAA-MM'
  puntajes     jsonb not null default '{}'::jsonb,   -- { "<id criterio>": 1..5 }
  promedio     numeric(3,2),
  fortalezas   text not null default '',
  a_mejorar    text not null default '',
  evaluador    uuid default auth.uid() references auth.users(id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index if not exists evaluaciones_empleado_idx on public.evaluaciones (empleado_id, periodo);

-- Valida los puntajes (1 a 5) y calcula el promedio
create or replace function public.completar_evaluacion()
returns trigger
language plpgsql
as $$
declare
  v_malos int;
begin
  if jsonb_typeof(new.puntajes) <> 'object' then
    raise exception 'Los puntajes tienen que ser una lista de criterio → puntaje';
  end if;
  select count(*) into v_malos
  from jsonb_each(new.puntajes) p
  where jsonb_typeof(p.value) <> 'number' or (p.value)::numeric not in (1, 2, 3, 4, 5);
  if v_malos > 0 then raise exception 'Cada puntaje tiene que ser de 1 a 5'; end if;
  select round(avg((p.value)::numeric), 2) into new.promedio from jsonb_each(new.puntajes) p;
  return new;
end;
$$;

drop trigger if exists evaluaciones_completar on public.evaluaciones;
create trigger evaluaciones_completar
  before insert or update on public.evaluaciones
  for each row execute function public.completar_evaluacion();

-- ---------------------------------------------------------------------
-- 8) Permisos (RLS)
-- ---------------------------------------------------------------------
alter table public.sucursales           enable row level security;
alter table public.perfiles             enable row level security;
alter table public.empleados            enable row level security;
alter table public.tipos_novedad        enable row level security;
alter table public.novedades            enable row level security;
alter table public.vacaciones_ajustes   enable row level security;
alter table public.criterios_evaluacion enable row level security;
alter table public.evaluaciones         enable row level security;

revoke all on public.sucursales, public.perfiles, public.empleados, public.tipos_novedad, public.novedades,
              public.vacaciones_ajustes, public.criterios_evaluacion, public.evaluaciones from anon;

grant select on public.perfiles to authenticated;
grant select, insert, update on public.sucursales, public.tipos_novedad, public.criterios_evaluacion to authenticated;
grant select, insert, update, delete on public.empleados, public.novedades, public.vacaciones_ajustes, public.evaluaciones to authenticated;

-- Funciones auxiliares: solo para usuarios logueados
revoke execute on function public.es_admin(), public.es_usuario_activo(), public.mi_sucursal(),
                           public.puede_ver_sucursal(bigint), public.puede_ver_empleado(bigint) from anon, public;
grant execute on function public.es_admin(), public.es_usuario_activo(), public.mi_sucursal(),
                          public.puede_ver_sucursal(bigint), public.puede_ver_empleado(bigint) to authenticated;

-- perfiles: cada uno ve el suyo; el admin ve todos. Se escriben solo desde la Edge Function.
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());

-- Catálogos (sucursales, tipos, criterios): leen todos los activos; escribe el admin.
drop policy if exists sucursales_select on public.sucursales;
create policy sucursales_select on public.sucursales for select to authenticated using (public.es_usuario_activo());
drop policy if exists sucursales_insert on public.sucursales;
create policy sucursales_insert on public.sucursales for insert to authenticated with check (public.es_admin());
drop policy if exists sucursales_update on public.sucursales;
create policy sucursales_update on public.sucursales for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists tipos_select on public.tipos_novedad;
create policy tipos_select on public.tipos_novedad for select to authenticated using (public.es_usuario_activo());
drop policy if exists tipos_insert on public.tipos_novedad;
create policy tipos_insert on public.tipos_novedad for insert to authenticated with check (public.es_admin());
drop policy if exists tipos_update on public.tipos_novedad;
create policy tipos_update on public.tipos_novedad for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists criterios_select on public.criterios_evaluacion;
create policy criterios_select on public.criterios_evaluacion for select to authenticated using (public.es_usuario_activo());
drop policy if exists criterios_insert on public.criterios_evaluacion;
create policy criterios_insert on public.criterios_evaluacion for insert to authenticated with check (public.es_admin());
drop policy if exists criterios_update on public.criterios_evaluacion;
create policy criterios_update on public.criterios_evaluacion for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- empleados: el encargado ve los de su sucursal; altas, bajas y cambios los hace el admin.
drop policy if exists empleados_select on public.empleados;
create policy empleados_select on public.empleados for select to authenticated using (public.puede_ver_sucursal(sucursal_id));
drop policy if exists empleados_insert on public.empleados;
create policy empleados_insert on public.empleados for insert to authenticated with check (public.es_admin());
drop policy if exists empleados_update on public.empleados;
create policy empleados_update on public.empleados for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists empleados_delete on public.empleados;
create policy empleados_delete on public.empleados for delete to authenticated using (public.es_admin());

-- novedades: cada uno carga y corrige las de los empleados que puede ver.
drop policy if exists novedades_select on public.novedades;
create policy novedades_select on public.novedades for select to authenticated using (public.puede_ver_empleado(empleado_id));
drop policy if exists novedades_insert on public.novedades;
create policy novedades_insert on public.novedades for insert to authenticated with check (public.puede_ver_empleado(empleado_id));
drop policy if exists novedades_update on public.novedades;
create policy novedades_update on public.novedades for update to authenticated
  using (public.puede_ver_empleado(empleado_id)) with check (public.puede_ver_empleado(empleado_id));
drop policy if exists novedades_delete on public.novedades;
create policy novedades_delete on public.novedades for delete to authenticated using (public.puede_ver_empleado(empleado_id));

-- ajustes de vacaciones: los ve quien ve al empleado; los carga el admin.
drop policy if exists ajustes_select on public.vacaciones_ajustes;
create policy ajustes_select on public.vacaciones_ajustes for select to authenticated using (public.puede_ver_empleado(empleado_id));
drop policy if exists ajustes_insert on public.vacaciones_ajustes;
create policy ajustes_insert on public.vacaciones_ajustes for insert to authenticated with check (public.es_admin());
drop policy if exists ajustes_delete on public.vacaciones_ajustes;
create policy ajustes_delete on public.vacaciones_ajustes for delete to authenticated using (public.es_admin());

-- evaluaciones: el encargado evalúa a los de su sucursal; borra el admin o quien la cargó.
drop policy if exists evaluaciones_select on public.evaluaciones;
create policy evaluaciones_select on public.evaluaciones for select to authenticated using (public.puede_ver_empleado(empleado_id));
drop policy if exists evaluaciones_insert on public.evaluaciones;
create policy evaluaciones_insert on public.evaluaciones for insert to authenticated
  with check (public.puede_ver_empleado(empleado_id) and evaluador = auth.uid());
drop policy if exists evaluaciones_update on public.evaluaciones;
create policy evaluaciones_update on public.evaluaciones for update to authenticated
  using (public.es_admin() or (evaluador = auth.uid() and public.puede_ver_empleado(empleado_id)))
  with check (public.puede_ver_empleado(empleado_id));
drop policy if exists evaluaciones_delete on public.evaluaciones;
create policy evaluaciones_delete on public.evaluaciones for delete to authenticated
  using (public.es_admin() or (evaluador = auth.uid() and public.puede_ver_empleado(empleado_id)));

revoke insert, update, delete, truncate, references, trigger on public.perfiles from authenticated;
revoke delete, truncate, references, trigger on public.sucursales, public.tipos_novedad, public.criterios_evaluacion from authenticated;
revoke truncate, references, trigger on public.empleados, public.novedades, public.vacaciones_ajustes, public.evaluaciones from authenticated;
revoke update on public.vacaciones_ajustes from authenticated;
