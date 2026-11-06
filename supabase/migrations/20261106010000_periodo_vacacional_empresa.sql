-- =====================================================================
--  Período de vacaciones de la empresa: del 1 de octubre de un año al 30 de
--  septiembre del siguiente (ya no se usa la ventana de la ley, 1/10 al 30/4).
--  El período de una fecha es el año de su 1 de octubre más reciente:
--     oct, nov, dic  -> ese año            ene a sep -> el año anterior
--  Cambia el período que se asigna por defecto a las vacaciones nuevas, y se
--  corrige el de las ya cargadas de mayo a septiembre, que el criterio viejo
--  asignaba al mismo año (ahora son del período anterior).
--  Se puede volver a correr: no cambia nada la segunda vez.
-- =====================================================================
begin;

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
    -- Minutos, horas, pesos o registro: es un solo día
    new.fecha_hasta := new.fecha_desde;
    if t.unidad = 'registro' then new.cantidad := 0; end if;
  end if;
  -- Llegada tarde con hora: los minutos salen de la hora de entrada (empleado o sucursal)
  if new.tipo = 'llegada_tarde' and new.hora is not null then
    new.cantidad := coalesce(public.minutos_tarde(new.empleado_id, new.hora), new.cantidad);
  end if;
  if t.descuenta_vacaciones then
    -- Período vacacional de la empresa: del 1/10 al 30/9. Lo tomado de enero a
    -- septiembre corresponde por defecto al año anterior. Se puede indicar a mano.
    if new.anio_vacaciones is null then
      new.anio_vacaciones := extract(year from new.fecha_desde)::int
                             - case when extract(month from new.fecha_desde) <= 9 then 1 else 0 end;
    end if;
  else
    new.anio_vacaciones := null;
  end if;
  if new.tipo <> 'horas_extra' then new.recargo := null; end if;
  if new.tipo not in ('horas_extra', 'llegada_tarde') then new.hora := null; end if;
  if new.tipo <> 'horas_extra' and not coalesce(t.descuenta_vacaciones, false) and not coalesce(t.descuenta_sueldo, false) then
    new.liquidado_en := null;
  end if;
  return new;
end;
$$;

-- Las ya cargadas de mayo a septiembre estaban en el mismo año: pasan al período anterior
update public.novedades n set anio_vacaciones = anio_vacaciones - 1
from public.tipos_novedad t
where t.clave = n.tipo and t.descuenta_vacaciones
  and extract(month from n.fecha_desde) between 5 and 9
  and n.anio_vacaciones = extract(year from n.fecha_desde)::int;

commit;

-- Control: período asignado a cada vacación cargada (debe coincidir con el 1/10 al 30/9)
select count(*) as vacaciones,
       count(*) filter (where anio_vacaciones = extract(year from fecha_desde)::int - case when extract(month from fecha_desde) <= 9 then 1 else 0 end) as con_el_periodo_por_defecto
from public.novedades n join public.tipos_novedad t on t.clave = n.tipo and t.descuenta_vacaciones;
