-- =====================================================================
--  Compras en cuenta corriente (comprar en la tienda y pagar después).
--  Antes se cargaban como "Adelanto de sueldo". Ahora son dos tipos
--  distintos, y los dos pueden descontarse del sueldo:
--     · Adelanto de sueldo ............ plata que se le da por adelantado
--     · Compra en cuenta corriente .... mercadería que compró y paga después
--  Cada movimiento queda "pendiente de descontar" hasta que se marca el mes
--  del sueldo en el que se descontó (campo liquidado_en, como las horas extra).
--  Se puede volver a correr: no borra datos.
-- =====================================================================
begin;

alter table public.tipos_novedad add column if not exists descuenta_sueldo boolean not null default false;

insert into public.tipos_novedad (clave, nombre, unidad, descuenta_vacaciones, es_ausencia, color, orden, del_sistema, cuenta_horas, descuenta_sueldo) values
  ('compra_cuenta_corriente', 'Compra en cuenta corriente (a descontar)', 'pesos', false, false, '#8a5a1f', 12, true, 0, true)
on conflict (clave) do nothing;

-- Los dos se descuentan del sueldo; el viático no (se paga)
update public.tipos_novedad set descuenta_sueldo = true where clave in ('adelanto', 'compra_cuenta_corriente');
update public.tipos_novedad set nombre = 'Adelanto de sueldo (plata adelantada)' where clave = 'adelanto' and nombre = 'Adelanto de sueldo';

-- completar_novedad: ahora también conserva el "descontado en el sueldo de" de los tipos que descuentan sueldo
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
  if new.tipo not in ('horas_extra', 'llegada_tarde') then new.hora := null; end if;
  if new.tipo <> 'horas_extra' and not coalesce(t.descuenta_vacaciones, false) and not coalesce(t.descuenta_sueldo, false) then
    new.liquidado_en := null;
  end if;
  return new;
end;
$$;

commit;

-- Control: tipos que se descuentan del sueldo y cuánto hay cargado de cada uno
select t.nombre, t.descuenta_sueldo as se_descuenta_del_sueldo,
       count(n.id) as movimientos, coalesce(sum(n.cantidad), 0) as total_en_pesos
from public.tipos_novedad t
left join public.novedades n on n.tipo = t.clave
where t.unidad = 'pesos'
group by t.nombre, t.descuenta_sueldo, t.orden
order by t.orden;
