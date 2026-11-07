-- First create your email/password user in Authentication > Users > Add user.
-- Replace YOUR_ADMIN_EMAIL with that user's email, then run in the SQL Editor.
-- Do not use your Supabase dashboard account unless you created that same email
-- as an Auth user inside this project as well.
do $$
declare admin_id uuid;
begin
 select id into admin_id from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL');
 if admin_id is null then raise exception 'Create this email as a project Auth user first.'; end if;
 insert into public.gs_admins(user_id) values(admin_id) on conflict do nothing;
end;
$$;
