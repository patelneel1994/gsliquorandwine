-- Run once in the Supabase SQL Editor for project unbjlhofoqzglacczwvg.
-- Safe to rerun: existing recipe edits, votes, and counters are preserved.
begin;

create table if not exists public.gs_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.gs_admins enable row level security;
revoke all on public.gs_admins from anon, authenticated;

create or replace function public.gs_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.gs_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.gs_is_admin() from public;
grant execute on function public.gs_is_admin() to authenticated;

create or replace function public.gs_valid_recipe(data jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare field text; item jsonb;
begin
 if jsonb_typeof(data) is distinct from 'object' then return false; end if;
 foreach field in array array['title','description'] loop
  if jsonb_typeof(data->field) is distinct from 'string' or length(btrim(data->>field)) = 0 then return false; end if;
 end loop;
 if length(data->>'title') > 100 or length(data->>'description') > 500 then return false; end if;
 if coalesce(data->>'category','') not in ('Whiskey','Tequila','Vodka','Rum','Gin','Other') then return false; end if;
 if jsonb_typeof(data->'minutes') is distinct from 'number' or coalesce(data->>'minutes','') !~ '^[0-9]{1,3}$' then return false; end if;
 if (data->>'minutes')::integer not between 1 and 180 then return false; end if;
 foreach field in array array['ingredients','steps'] loop
  if jsonb_typeof(data->field) is distinct from 'array' then return false; end if;
  if jsonb_array_length(data->field) not between 1 and 40 then return false; end if;
  for item in select value from jsonb_array_elements(data->field) loop
   if jsonb_typeof(item) is distinct from 'string' or length(btrim(item #>> '{}')) = 0 or length(item #>> '{}') > 1000 then return false; end if;
  end loop;
 end loop;
 foreach field in array array['yieldLabel','chill','attribution','note'] loop
  if data ? field then
   if jsonb_typeof(data->field) is distinct from 'string' then return false; end if;
   if length(data->>field) > case field when 'yieldLabel' then 120 when 'note' then 600 else 300 end then return false; end if;
  end if;
 end loop;
 return true;
end;
$$;
revoke all on function public.gs_valid_recipe(jsonb) from public;
grant execute on function public.gs_valid_recipe(jsonb) to authenticated;

create table if not exists public.gs_recipes (
 id text primary key check (length(id) between 1 and 100),
 content jsonb not null check (public.gs_valid_recipe(content)),
 created_at timestamptz not null default now()
);
create table if not exists public.gs_votes (
 recipe_id text not null references public.gs_recipes(id) on delete cascade,
 voter uuid not null,
 primary key (recipe_id, voter)
);
create table if not exists public.gs_share_clicks (
 recipe_id text not null references public.gs_recipes(id) on delete cascade,
 platform text not null check (platform in ('facebook','instagram','device')),
 clicks bigint not null default 0 check(clicks >= 0),
 primary key(recipe_id, platform)
);
alter table public.gs_recipes enable row level security;
alter table public.gs_votes enable row level security;
alter table public.gs_share_clicks enable row level security;
revoke all on public.gs_recipes, public.gs_votes, public.gs_share_clicks from anon, authenticated;
grant select on public.gs_recipes to anon, authenticated;
grant insert, update, delete on public.gs_recipes to authenticated;
drop policy if exists gs_public_read on public.gs_recipes;
create policy gs_public_read on public.gs_recipes for select to anon, authenticated using (true);
drop policy if exists gs_admin_insert on public.gs_recipes;
create policy gs_admin_insert on public.gs_recipes for insert to authenticated with check ((select public.gs_is_admin()));
drop policy if exists gs_admin_update on public.gs_recipes;
create policy gs_admin_update on public.gs_recipes for update to authenticated using ((select public.gs_is_admin())) with check ((select public.gs_is_admin()));
drop policy if exists gs_admin_delete on public.gs_recipes;
create policy gs_admin_delete on public.gs_recipes for delete to authenticated using ((select public.gs_is_admin()));

-- Expose totals through functions, never individual visitor identifiers.
create or replace function public.gs_list_recipes(p_voter uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(r.content || jsonb_build_object('id',r.id,'votes',
  (select count(*) from public.gs_votes v where v.recipe_id=r.id),'voted',
  exists(select 1 from public.gs_votes v where v.recipe_id=r.id and v.voter=p_voter)) order by r.created_at,r.id),'[]'::jsonb)
 from public.gs_recipes r;
$$;
create or replace function public.gs_vote(p_recipe_id text, p_voter uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare total bigint;
begin
 if p_voter is null then raise exception 'A browser identifier is required.' using errcode='22023'; end if;
 -- Row lock also serializes concurrent votes so the returned count includes this vote.
 perform 1 from public.gs_recipes where id=p_recipe_id for update;
 if not found then raise exception 'This recipe is no longer available.' using errcode='22023'; end if;
 insert into public.gs_votes(recipe_id,voter) values(p_recipe_id,p_voter) on conflict do nothing;
 select count(*) into total from public.gs_votes where recipe_id=p_recipe_id;
 return jsonb_build_object('votes',total,'voted',true);
end;
$$;
create or replace function public.gs_record_share(p_recipe_id text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_platform is null or p_platform not in ('facebook','instagram','device') then raise exception 'Invalid share platform.' using errcode='22023'; end if;
 if not exists(select 1 from public.gs_recipes where id=p_recipe_id) then raise exception 'This recipe is no longer available.' using errcode='22023'; end if;
 insert into public.gs_share_clicks(recipe_id,platform,clicks) values(p_recipe_id,p_platform,1)
 on conflict(recipe_id,platform) do update set clicks=public.gs_share_clicks.clicks+1;
end;
$$;
create or replace function public.gs_recipe_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.gs_is_admin() then raise exception 'Admin access required.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.content->>'title',
  'votes',(select count(*) from public.gs_votes v where v.recipe_id=r.id),
  'shares',jsonb_build_object(
   'facebook',coalesce((select clicks from public.gs_share_clicks where recipe_id=r.id and platform='facebook'),0),
   'instagram',coalesce((select clicks from public.gs_share_clicks where recipe_id=r.id and platform='instagram'),0),
   'device',coalesce((select clicks from public.gs_share_clicks where recipe_id=r.id and platform='device'),0))) order by r.created_at,r.id),'[]'::jsonb) from public.gs_recipes r);
end;
$$;
revoke all on function public.gs_list_recipes(uuid), public.gs_vote(text,uuid), public.gs_record_share(text,text), public.gs_recipe_stats() from public;
grant execute on function public.gs_list_recipes(uuid), public.gs_vote(text,uuid), public.gs_record_share(text,text) to anon, authenticated;
grant execute on function public.gs_recipe_stats() to authenticated;

-- Seed examples once; never overwrite existing admin edits.
insert into public.gs_recipes(id,content) values ('grinch-lemon-drop', $recipe${"title": "Grinch Lemon Drop Freezer Door", "category": "Vodka", "minutes": 10, "yieldLabel": "Large batch · about 77 fl oz", "chill": "Freeze for 5–6 hours, or refrigerate until chilled. Freezer consistency may vary.", "attribution": "Recipe shared on Facebook. Original creator not identified.", "description": "A bright green, lemony holiday batch with Tito’s vodka, green Kool-Aid and a little edible sparkle. Allow extra time to chill.", "ingredients": ["59 fl oz Tito’s vodka (one 1.75 L bottle)", "12 fl oz freshly squeezed lemon juice", "6 fl oz simple syrup", "½ packet green Kool-Aid", "Green edible glitter, to taste"], "steps": ["Combine the vodka, lemon juice, simple syrup and half a packet of green Kool-Aid in a large pitcher or mixing container.", "Stir well until fully combined.", "Add green edible glitter and stir again to distribute it evenly.", "Transfer to a pitcher or divide between freezer-safe containers, leaving space for expansion. The full batch will not fit in the original vodka bottle.", "For the freezer-door version, freeze for 5–6 hours; the original recipe describes a slushy texture, though the final consistency depends on your freezer.", "If using a pitcher instead, refrigerate until ready to serve.", "Stir before serving. Pour individual servings and enjoy responsibly."], "note": "The liquids total about 77 fl oz (2.28 L). Use a container larger than the original 1.75 L bottle. Preparation time is approximate; chilling time is additional."}$recipe$::jsonb) on conflict(id) do nothing;
insert into public.gs_recipes(id,content) values ('old-fashioned', $recipe${"title": "The Old Fashioned", "category": "Whiskey", "minutes": 5, "description": "A timeless mix of whiskey, bitters and a little sweetness. Keep it simple; let the spirit shine.", "ingredients": ["2 oz bourbon or rye whiskey", "1 tsp sugar", "2–3 dashes aromatic bitters", "1 tsp water", "Orange peel and a large ice cube"], "steps": ["Stir the sugar, bitters and water in a rocks glass until the sugar dissolves.", "Add the whiskey and a large ice cube. Stir until chilled.", "Twist the orange peel over the glass to release its oils, then add it as a garnish."]}$recipe$::jsonb) on conflict(id) do nothing;
insert into public.gs_recipes(id,content) values ('classic-margarita', $recipe${"title": "The Classic Margarita", "category": "Tequila", "minutes": 5, "description": "Bright lime, smooth tequila and a salt-kissed rim. A refreshing classic for your recipe collection.", "ingredients": ["2 oz blanco tequila", "1 oz fresh lime juice", "1 oz orange liqueur", "Salt, ice and a lime wedge"], "steps": ["Run a lime wedge around half the rim of a glass and dip that side in salt. Fill with ice.", "Add tequila, lime juice and orange liqueur to a shaker with ice.", "Shake until chilled, strain into the prepared glass, and garnish with lime."]}$recipe$::jsonb) on conflict(id) do nothing;
insert into public.gs_recipes(id,content) values ('moscow-mule', $recipe${"title": "The Moscow Mule", "category": "Vodka", "minutes": 5, "description": "Crisp ginger, a squeeze of lime and vodka over ice. Refreshingly easy to make at home.", "ingredients": ["2 oz vodka", "½ oz fresh lime juice", "4 oz ginger beer", "Ice and a lime wedge"], "steps": ["Fill a mug or tall glass with ice.", "Pour in the vodka and lime juice, then top with ginger beer.", "Stir gently and garnish with a lime wedge."]}$recipe$::jsonb) on conflict(id) do nothing;

notify pgrst, 'reload schema';
commit;
