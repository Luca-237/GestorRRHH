-- =====================================================================
--  Backup diario de la base de RRHH (decisión de Luca, 11/11/2026).
--
--   · backup_rrhh(clave): devuelve TODAS las tablas en un solo JSON, solo
--     lectura. La usa el script backup/hacer-backup.cjs desde la PC (tarea
--     programada de Windows), que arma un Excel en Google Drive.
--   · La clave del backup no se guarda en la base: solo su huella (sha256)
--     en backup_claves. La clave real está en un archivo de la PC
--     (C:\Users\Usuario\.claude\backup-rrhh.env), fuera del repo.
--     Se carga con el SQL que imprime backup/preparar-clave.cjs.
--   · registrar_backup_rrhh(...): anota cómo salió cada backup en
--     backups_registro (se ve en Configuración, solo admin).
--
--  No hace falta correrla antes de desplegar. Se puede volver a correr.
-- =====================================================================
begin;

create table if not exists public.backup_claves (
  hash      text primary key,              -- sha256 de la clave, en hexadecimal
  creado_en timestamptz not null default now()
);
alter table public.backup_claves enable row level security;   -- sin políticas: nadie la lee por la API

create table if not exists public.backups_registro (
  id        bigint generated always as identity primary key,
  fecha     timestamptz not null default now(),
  estado    text not null check (estado in ('ok', 'error')),
  archivo   text,
  filas     jsonb,
  bytes     bigint,
  error     text,
  origen    text
);
alter table public.backups_registro enable row level security;
drop policy if exists backups_registro_select on public.backups_registro;
create policy backups_registro_select on public.backups_registro for select to authenticated using (public.es_admin());

create or replace function public.backup_clave_valida(p_clave text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_clave is not null and length(p_clave) >= 32
     and exists (select 1 from public.backup_claves where hash = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex'));
$$;
revoke execute on function public.backup_clave_valida(text) from anon, authenticated, public;

-- Todas las tablas de datos, en un solo JSON (las que no existan se saltean)
create or replace function public.backup_rrhh(p_clave text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  tablas text[] := array['sucursales', 'puestos', 'empleados', 'tipos_novedad', 'novedades',
    'vacaciones_liquidaciones', 'vacaciones_ajustes', 'feriados', 'periodos_sin_vacaciones', 'eventos',
    'puestos_compartidos', 'puestos_compartidos_miembros', 'perfiles', 'criterios_evaluacion', 'evaluaciones',
    'backups_registro'];
  t text;
  filas jsonb;
  resultado jsonb := '{}'::jsonb;
begin
  if not public.backup_clave_valida(p_clave) then
    raise exception 'Clave de backup no válida.';
  end if;
  foreach t in array tablas loop
    if to_regclass('public.' || t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into filas;
      resultado := resultado || jsonb_build_object(t, filas);
    end if;
  end loop;
  return jsonb_build_object('generado', now(), 'tablas', resultado);
end;
$$;
revoke execute on function public.backup_rrhh(text) from public;
grant execute on function public.backup_rrhh(text) to anon, authenticated;

create or replace function public.registrar_backup_rrhh(
  p_clave text, p_estado text, p_archivo text default null, p_filas jsonb default null,
  p_bytes bigint default null, p_error text default null, p_origen text default 'programado')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.backup_clave_valida(p_clave) then
    raise exception 'Clave de backup no válida.';
  end if;
  insert into public.backups_registro (estado, archivo, filas, bytes, error, origen)
  values (case when p_estado = 'ok' then 'ok' else 'error' end, p_archivo, p_filas, p_bytes, left(p_error, 2000), p_origen);
  delete from public.backups_registro where fecha < now() - interval '180 days';
end;
$$;
revoke execute on function public.registrar_backup_rrhh(text, text, text, jsonb, bigint, text, text) from public;
grant execute on function public.registrar_backup_rrhh(text, text, text, jsonb, bigint, text, text) to anon, authenticated;

commit;

-- Control
select (select count(*) from public.backup_claves) as claves_cargadas,
       (select count(*) from public.backups_registro) as backups_registrados;
