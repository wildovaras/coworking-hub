-- ============================================================
-- Coworking Hub · Migración 001 · Puestos físicos + ocupación en tiempo real
-- Alineado a P6-P7: planta abierta, dedicados, salas, phone booths.
-- Cómo ejecutar: copiar todo el archivo en Supabase Dashboard → SQL Editor → Run.
-- Idempotente: se puede correr varias veces sin romper nada.
-- ============================================================

-- 1) TABLA: puestos físicos individuales ----------------------
create table if not exists puestos (
  id            serial primary key,
  codigo        text unique not null,                  -- "HD-01", "ED-02", "SR-A", "PB-1"
  tipo          text not null check (tipo in ('hot_desk','dedicado','sala','booth','lounge')),
  centro        text not null,                          -- "planta_abierta" | "dedicados" | "salas" | "booths" | "lounge"
  nombre        text not null,                          -- "Hot Desk 01", "Sala Aysén"
  estado        text not null default 'libre'
                check (estado in ('libre','reservado','ocupado','por_liberar','fuera_de_servicio')),
  estado_desde  timestamptz not null default now(),
  miembro_id    int references miembros(id) on delete set null,
  reserva_id    int,                                    -- enlace opcional a la reserva activa
  notas         text,                                   -- razón de fuera_de_servicio, etc.
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table puestos is 'Inventario físico de unidades reservables (P6-P7 layout).';
comment on column puestos.estado is 'Máquina de estados: libre→reservado→ocupado→libre. Por_liberar = no_show probable.';

-- 2) TABLA: histórico de cambios de estado (para KPIs reales) ---
create table if not exists puestos_eventos (
  id          bigserial primary key,
  puesto_id   int not null references puestos(id) on delete cascade,
  estado_de   text,
  estado_a    text not null,
  miembro_id  int references miembros(id) on delete set null,
  reserva_id  int,
  actor       text,                                    -- 'sistema' | 'coworker' | 'staff'
  ts          timestamptz not null default now()
);

create index if not exists idx_puestos_eventos_puesto_ts
  on puestos_eventos (puesto_id, ts desc);

create index if not exists idx_puestos_eventos_ts
  on puestos_eventos (ts desc);

comment on table puestos_eventos is 'Audit log de cambios de estado. Fuente de KPIs reales de ocupación.';

-- 3) TRIGGER: cada UPDATE de estado registra evento + bump updated_at
create or replace function fn_log_puesto_evento() returns trigger
language plpgsql as $$
begin
  if (TG_OP = 'INSERT') then
    insert into puestos_eventos(puesto_id, estado_de, estado_a, miembro_id, reserva_id, actor)
    values (NEW.id, null, NEW.estado, NEW.miembro_id, NEW.reserva_id, 'sistema');
    return NEW;
  end if;

  if (TG_OP = 'UPDATE' and NEW.estado is distinct from OLD.estado) then
    NEW.estado_desde := now();
    NEW.updated_at := now();
    insert into puestos_eventos(puesto_id, estado_de, estado_a, miembro_id, reserva_id, actor)
    values (NEW.id, OLD.estado, NEW.estado, NEW.miembro_id, NEW.reserva_id, coalesce(current_setting('app.actor', true), 'sistema'));
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_log_puesto_evento on puestos;
create trigger trg_log_puesto_evento
  before insert or update on puestos
  for each row execute function fn_log_puesto_evento();

-- 4) FUNCIÓN: marcar no-show (reservas vencidas hace >15 min sin check-in)
-- Ejecutar desde el server cada 60s. Marca puestos reservados pero no usados.
create or replace function fn_marcar_no_shows(minutos_gracia int default 15)
returns int language plpgsql as $$
declare
  afectados int := 0;
begin
  perform set_config('app.actor', 'sistema', true);

  with vencidas as (
    select p.id
    from puestos p
    join reservas r on r.id = p.reserva_id
    where p.estado = 'reservado'
      and r.fecha::timestamptz + interval '15 minutes' < now()
  )
  update puestos
    set estado = 'por_liberar'
    where id in (select id from vencidas);

  get diagnostics afectados = row_count;
  return afectados;
end;
$$;

-- 5) RLS: usamos service role key desde el backend, así que RLS off por ahora.
alter table puestos        disable row level security;
alter table puestos_eventos disable row level security;

-- 6) SEED: inventario alineado a P6-P7 (~12 unidades reservables) ----
-- Si ya hay puestos, NO sobreescribe (idempotente por unique codigo).
insert into puestos (codigo, tipo, centro, nombre) values
  ('HD-01','hot_desk','planta_abierta','Hot Desk 01 — Ventana norte'),
  ('HD-02','hot_desk','planta_abierta','Hot Desk 02 — Ventana norte'),
  ('HD-03','hot_desk','planta_abierta','Hot Desk 03 — Central'),
  ('HD-04','hot_desk','planta_abierta','Hot Desk 04 — Central'),
  ('HD-05','hot_desk','planta_abierta','Hot Desk 05 — Pasillo'),
  ('HD-06','hot_desk','planta_abierta','Hot Desk 06 — Pasillo'),

  ('ED-01','dedicado','dedicados','Escritorio Dedicado 01'),
  ('ED-02','dedicado','dedicados','Escritorio Dedicado 02'),

  ('SR-A','sala','salas','Sala Aysén (8 personas)'),
  ('SR-B','sala','salas','Sala Bío-Bío (4 personas)'),

  ('PB-1','booth','booths','Phone Booth 1'),
  ('PB-2','booth','booths','Phone Booth 2')
on conflict (codigo) do nothing;

-- 7) Vista de conveniencia: estado actual con info enriquecida
create or replace view v_puestos_live as
select
  p.id, p.codigo, p.tipo, p.centro, p.nombre, p.estado, p.estado_desde, p.notas,
  extract(epoch from (now() - p.estado_desde))::int as segundos_en_estado,
  p.miembro_id,
  m.nombre as miembro_nombre,
  p.reserva_id
from puestos p
left join miembros m on m.id = p.miembro_id
order by p.centro, p.codigo;

-- Listo. Comprobar:
--   select codigo, tipo, estado from puestos order by codigo;
--   select * from v_puestos_live;
