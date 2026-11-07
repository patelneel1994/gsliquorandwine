-- Optional database integration checks. Run AFTER setup.sql and add-admin.sql.
-- Everything this script writes is rolled back. Never use a production login token.
begin;
create temporary table gs_security_fixture as
 select (select user_id from public.gs_admins limit 1) as admin_id,
 gen_random_uuid() as visitor_id,
 'security-check-' || gen_random_uuid()::text as recipe_id;
grant select on gs_security_fixture to anon, authenticated;
do $$ begin
 if (select admin_id from gs_security_fixture) is null then
  raise exception 'Add your admin account before running security checks.';
 end if;
end $$;
insert into public.gs_recipes(id,content)
 select recipe_id, '{"title":"Security test","description":"Temporary recipe","category":"Rum","minutes":5,"ingredients":["Ice"],"steps":["Stir."]}'::jsonb from gs_security_fixture;

set local role anon;
do $$ declare item text; visitor uuid; result jsonb;
begin
 select recipe_id,visitor_id into item,visitor from gs_security_fixture;
 if jsonb_array_length(public.gs_list_recipes(null)) < 1 then raise exception 'Anonymous browsing failed.'; end if;
 perform public.gs_vote(item,visitor);
 result := public.gs_vote(item,visitor);
 if (result->>'votes')::integer <> 1 then raise exception 'Duplicate vote counted.'; end if;
 perform public.gs_record_share(item,'facebook');
 begin
  perform public.gs_recipe_stats();
  raise exception 'Anonymous stats were exposed.';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.gs_votes;
  raise exception 'Individual voter identifiers were exposed.';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.gs_recipes(id,content) select recipe_id||'-bad','{}'::jsonb from gs_security_fixture;
  raise exception 'Anonymous recipe insert was allowed.';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',visitor_id::text,true) from gs_security_fixture;
set local role authenticated;
do $$ declare affected integer;
begin
 if public.gs_is_admin() then raise exception 'Visitor incorrectly has admin role.'; end if;
 begin
  perform public.gs_recipe_stats();
  raise exception 'Visitor stats were exposed.';
 exception when insufficient_privilege then null; end;
 update public.gs_recipes set content=jsonb_set(content,'{title}','"Unauthorized edit"') where id=(select recipe_id from gs_security_fixture);
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Non-admin edit was allowed.'; end if;
 begin
  insert into public.gs_admins(user_id) select visitor_id from gs_security_fixture;
  raise exception 'Visitor could promote themselves.';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from gs_security_fixture;
set local role authenticated;
do $$ declare affected integer;
begin
 if not public.gs_is_admin() then raise exception 'Admin role check failed.'; end if;
 update public.gs_recipes set content=jsonb_set(content,'{title}','"Authorized edit"') where id=(select recipe_id from gs_security_fixture);
 get diagnostics affected = row_count;
 if affected <> 1 then raise exception 'Admin edit was denied.'; end if;
 perform public.gs_recipe_stats();
 delete from public.gs_recipes where id=(select recipe_id from gs_security_fixture);
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.gs_votes where recipe_id=(select recipe_id from gs_security_fixture)) then raise exception 'Vote cascade failed.'; end if;
 if exists(select 1 from public.gs_share_clicks where recipe_id=(select recipe_id from gs_security_fixture)) then raise exception 'Share cascade failed.'; end if;
end $$;
rollback;
-- If no exception appeared, all access-control checks passed.
