-- =====================================================================
--  "Cambio de obra social" actualiza la ficha del empleado (pedido de
--  Luca, 21/11/2026).
--   · La novedad guarda la obra social nueva (obra_social_nueva) y la que
--     tenía antes (obra_social_anterior, la completa la base).
--   · Al guardarla, la base cambia empleados.obra_social, siempre que sea
--     el cambio más reciente de ese empleado (corregir uno viejo no pisa
--     uno más nuevo). Lo hace la base: también funciona para encargados,
--     que no pueden editar empleados.
--   · Si se borra el cambio más reciente, el empleado vuelve a la obra
--     social que tenía antes.
--  Correrla ANTES de desplegar la página nueva (la página pide estas columnas).
--  Se puede volver a correr.
-- =====================================================================
begin;

alter table public.novedades add column if not exists obra_social_nueva text;
alter table public.novedades add column if not exists obra_social_anterior text;

-- Antes de guardar: anota la obra social que tenía (solo al cargarla o si cambia de empleado)
create or replace function public.preparar_cambio_obra_social()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.tipo <> 'cambio_obra_social' then
    new.obra_social_nueva := null;
    new.obra_social_anterior := null;
    return new;
  end if;
  new.obra_social_nueva := nullif(btrim(coalesce(new.obra_social_nueva, '')), '');
  if tg_op = 'INSERT' or new.empleado_id is distinct from old.empleado_id then
    -- La de antes, según las fechas: la del cambio anterior a este; si no hay, la original
    -- (la que anotó el primer cambio posterior); si no hay ninguno, la de la ficha hoy
    select obra_social_nueva into new.obra_social_anterior from public.novedades
     where empleado_id = new.empleado_id and tipo = 'cambio_obra_social' and obra_social_nueva is not null
       and fecha_desde <= new.fecha_desde and id is distinct from new.id
     order by fecha_desde desc, id desc limit 1;
    if not found then
      select obra_social_anterior into new.obra_social_anterior from public.novedades
       where empleado_id = new.empleado_id and tipo = 'cambio_obra_social' and obra_social_nueva is not null
         and fecha_desde > new.fecha_desde
       order by fecha_desde, id limit 1;
      if not found then
        select nullif(obra_social, '') into new.obra_social_anterior from public.empleados where id = new.empleado_id;
      end if;
    end if;
  else
    new.obra_social_anterior := old.obra_social_anterior;
  end if;
  return new;
end;
$$;

drop trigger if exists novedades_obra_social_antes on public.novedades;
create trigger novedades_obra_social_antes
  before insert or update on public.novedades
  for each row execute function public.preparar_cambio_obra_social();

-- Después de guardar o borrar: la ficha queda con la obra social del cambio más reciente
create or replace function public.aplicar_cambio_obra_social()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ult record;
  n record;
begin
  if tg_op = 'DELETE' then n := old; else n := new; end if;
  if n.tipo <> 'cambio_obra_social' then return null; end if;

  select obra_social_nueva, obra_social_anterior into ult from public.novedades
   where empleado_id = n.empleado_id and tipo = 'cambio_obra_social' and obra_social_nueva is not null
   order by fecha_desde desc, id desc limit 1;

  if found then
    update public.empleados set obra_social = ult.obra_social_nueva
     where id = n.empleado_id and obra_social is distinct from ult.obra_social_nueva;
  elsif tg_op = 'DELETE' and old.obra_social_nueva is not null then
    -- Se borró el único cambio: vuelve a la que tenía antes
    update public.empleados set obra_social = coalesce(old.obra_social_anterior, '')
     where id = old.empleado_id and obra_social = old.obra_social_nueva;
  end if;
  return null;
end;
$$;

drop trigger if exists novedades_obra_social_despues on public.novedades;
create trigger novedades_obra_social_despues
  after insert or update or delete on public.novedades
  for each row execute function public.aplicar_cambio_obra_social();

commit;

select count(*) filter (where tipo = 'cambio_obra_social') as cambios_de_obra_social,
       count(*) filter (where tipo = 'cambio_obra_social' and obra_social_nueva is not null) as con_obra_social_nueva
from public.novedades;
