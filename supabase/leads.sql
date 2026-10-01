-- =============================================================================
-- Clientes precalificados del portafolio inmobiliario.
--
-- Los escribe SOLO el Worker (cloudflare/leads-worker.js) con la service_role,
-- después de recalcular la precalificación en el servidor. Nadie más puede
-- insertar: el sitio público nunca habla directo con Supabase.
--
-- Se puede correr en el mismo proyecto de Supabase del agente de WhatsApp
-- (agente-whatsapp/): si existe public.current_organization_id(), los miembros
-- de la organización ven y trabajan sus clientes desde el panel.
-- Pegar en el SQL Editor de Supabase y ejecutar. Es idempotente.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.leads_inmobiliaria (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z]{2,10}-[A-Z0-9]{6}$'),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  organization_id uuid,

  -- Contacto (LOPDP: solo lo necesario, con la versión del consentimiento aceptado)
  nombre text not null check (char_length(nombre) between 3 and 80),
  whatsapp text not null check (whatsapp ~ '^[0-9]{8,15}$'),
  correo text,
  horario text,
  promociones boolean not null default false,
  consentimiento_version text not null,

  -- Precalificación (recalculada en el servidor)
  proyecto_id text,
  ciudad text,
  presupuesto numeric(12, 2),
  rango_min numeric(12, 2),
  rango_max numeric(12, 2),
  programa text,
  cuota_estimada numeric(10, 2),
  entrada_disponible numeric(12, 2),
  ingreso_familiar numeric(10, 2),
  tipo_ingreso text,
  cuando text,
  puntaje integer check (puntaje between 0 and 100),
  prioridad text check (prioridad in ('A', 'B', 'C')),
  perfil jsonb not null,
  origen jsonb not null default '{}'::jsonb,

  -- Embudo de ventas
  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'contactado', 'visita', 'documentos', 'credito', 'reservado', 'escriturado', 'perdido')),
  motivo_perdida text,
  asignado_a uuid,
  primera_respuesta_en timestamptz,
  notas text
);

create index if not exists leads_inmobiliaria_prioridad_idx on public.leads_inmobiliaria (prioridad, creado_en desc);
create index if not exists leads_inmobiliaria_whatsapp_idx on public.leads_inmobiliaria (whatsapp);
create index if not exists leads_inmobiliaria_estado_idx on public.leads_inmobiliaria (estado, creado_en desc);
create index if not exists leads_inmobiliaria_org_idx on public.leads_inmobiliaria (organization_id, creado_en desc);

create or replace function public.leads_inmobiliaria_tocar()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  if new.estado <> 'nuevo' and old.estado = 'nuevo' and new.primera_respuesta_en is null then
    new.primera_respuesta_en := now();
  end if;
  return new;
end $$;

drop trigger if exists leads_inmobiliaria_tocar on public.leads_inmobiliaria;
create trigger leads_inmobiliaria_tocar before update on public.leads_inmobiliaria
  for each row execute function public.leads_inmobiliaria_tocar();

-- Sin acceso para anon ni authenticated salvo lo que den las políticas de abajo.
alter table public.leads_inmobiliaria enable row level security;
revoke all on table public.leads_inmobiliaria from anon, authenticated;

-- Si el proyecto tiene el esquema del agente de WhatsApp, los miembros de la organización
-- leen sus clientes y actualizan el estado del embudo (no pueden borrar ni cambiar los datos).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'current_organization_id') then
    grant select on public.leads_inmobiliaria to authenticated;
    grant update (estado, motivo_perdida, asignado_a, notas) on public.leads_inmobiliaria to authenticated;
    drop policy if exists "miembros leen sus clientes" on public.leads_inmobiliaria;
    create policy "miembros leen sus clientes" on public.leads_inmobiliaria
      for select to authenticated using (organization_id = public.current_organization_id());
    drop policy if exists "miembros actualizan el embudo" on public.leads_inmobiliaria;
    create policy "miembros actualizan el embudo" on public.leads_inmobiliaria
      for update to authenticated
      using (organization_id = public.current_organization_id())
      with check (organization_id = public.current_organization_id());
  end if;
end $$;

-- Vista para el día a día: clientes A y B sin contactar, del más nuevo al más viejo.
create or replace view public.leads_por_llamar with (security_invoker = true) as
  select codigo, creado_en, prioridad, puntaje, nombre, whatsapp, horario, proyecto_id, ciudad,
         presupuesto, programa, cuota_estimada, entrada_disponible, cuando,
         round(extract(epoch from (now() - creado_en)) / 60) as minutos_esperando
  from public.leads_inmobiliaria
  where estado = 'nuevo' and prioridad in ('A', 'B')
  order by prioridad, creado_en desc;
