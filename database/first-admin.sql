-- Run AFTER setup.sql and AFTER you created your user in
-- Authentication -> Users -> Add user (tick "Auto Confirm User").
-- Replace the email below with the email you used, then Run.

insert into public.admin_users (user_id, email, full_name, role)
select id, email, 'Owner', 'super_admin'
from auth.users
where email = 'YOUR_EMAIL_HERE'
on conflict (user_id) do nothing;

-- Check: this should return one row with role super_admin.
select email, role from public.admin_users;
