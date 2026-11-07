# G & S Liquor & Wines

A static HTML/CSS/JavaScript website backed by Supabase. No Python application server, build step, or package installation is required. Public visitors do not sign in. Admins use `/login/`, which has no link in the public navigation or footer.

## Finish Supabase setup

The public project URL and publishable key are configured in `supabase-config.js`. This is intentionally public configuration; never place a secret/service-role key in frontend files.

1. Open the project's [SQL Editor](https://supabase.com/dashboard/project/unbjlhofoqzglacczwvg/sql/new). Paste and run **supabase/setup.sql**. This creates the recipe tables, policies, voting functions, admin statistics, and initial recipes. It is safe to rerun without overwriting existing recipe edits or counters; deleted bundled samples are reinserted if you rerun the seed script.
2. In **Authentication → Users → Add user**, create your admin email/password user. This is a project Auth user, separate from your Supabase dashboard login. If available, confirm its email when creating it; otherwise complete the email confirmation flow.
3. Open **supabase/add-admin.sql**, replace `YOUR_ADMIN_EMAIL` with that user's email, and run it in the SQL Editor. Only users explicitly listed in `gs_admins` can edit recipes and view activity counts. The public API cannot add admins.
4. In **Authentication → Sign In / Providers**, disable **Allow new users to sign up**. You can still create/invite your own users through the dashboard. If a future admin is added, explicitly add that user's ID to `gs_admins` as well. See [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
5. Serve the website over HTTPS, then visit `/login/` and sign in. Use **Add recipe**, **Edit**, **Delete**, and **Refresh counts**. Test your real login after applying the setup. Public users can browse recipes and vote without accounts.

The publishable key alone cannot create the database schema or assign an admin. Those steps require your dashboard access. Missing tables/functions produce a setup message in the editor. The public website falls back to clearly labeled sample recipes when the live service is unavailable; voting and counters require completed Supabase setup. An empty live recipe collection stays empty rather than falling back to samples.

## Local preview and hosting

Serve this folder with your preferred static preview server. For example, if Python is installed:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 and http://localhost:8000/login/. This command is only a static preview server, not an application backend.

Publish these assets to any static host with directory-index support:

- `index.html`, `styles.css`, `app.js`, `recipe-progress.js`
- `supabase-config.js`, `supabase-client.js`, `recipes.json`, `logo-900.jpg`
- `login/index.html`, `admin.js`
- Optional `admin.html` redirects old admin bookmarks to `/login/`.

Opening `/login` normally redirects to `/login/`, which serves `login/index.html`. If your host requires explicit routing rules, map `/login` and `/login/` to that file. Keep `supabase/`, `tests/`, `.git/`, and any old runtime `data/` directory out of the deployed assets. Any old SQLite data is not migrated automatically; use the admin editor to add those recipes or explicitly export and import them before retiring old hosting.

## Access controls

- `gs_recipes`: public read; writes require an explicitly allowlisted admin, enforced by PostgreSQL row-level security.
- `gs_admins`: no public API reads or writes. Admin checks use a function bound to Supabase's authenticated user ID.
- `gs_votes`: private browser identifiers, unique per recipe/browser. Only narrow voting functions can write; public callers see totals, not other browsers' identifiers.
- `gs_share_clicks`: only a platform counter is recorded. Public callers cannot set totals; the stats function requires admin membership.
- Recipe contents are validated in the database, including fields, lengths, array sizes, and prep times.
- `/login/` is unlisted and marked `noindex`; authentication and database policies provide the protection.

Anonymous voting is a lightweight preference counter, not a verified-person poll. A random UUID is saved in local storage; clearing storage, changing browsers, or intentionally generating other IDs allows additional votes. Without browser storage, the identifier lasts for the current page. Share counts measure clicks, including repeat clicks or canceled sharing, not confirmed posts. Public endpoints are not bot-proof. No customer login is required and no experience caption is sent to Supabase.

Admin access and refresh tokens are stored in session storage for that tab, refreshed when necessary, and cleared on sign-out. Passwords are sent directly to your Supabase Auth endpoint and are not stored in the site. Use HTTPS. The frontend uses Supabase's [Auth](https://supabase.com/docs/guides/auth/passwords) and [Data API](https://supabase.com/docs/guides/api) directly without third-party runtime scripts.

## Browser features

- Remembered 21+ self-attestation with **Age preferences** to reset it. This is not identity verification.
- Search, spirit filters, recipe deep links, and full ingredient/instruction views.
- Guided steps with a progress bar and local resume.
- Ingredient checkboxes and a saved chilling/freezing timer with pause, resume, and clear. Timers reflect elapsed wall time after returning but do not send background alarms.
- Optional local experience drafts and copyable captions. Visitors finish posting themselves on Facebook or Instagram. Device sharing depends on installed apps and browser support; clipboard failures reveal selectable text.
- Visible email address, **Email us**, and **Send feedback** buttons that open an email app.
- Hours highlighted using America/Chicago time; holiday hours may differ.

Starting over clears the recipe's steps, ingredient checks, timer, and experience draft. Changing its instructions invalidates saved progress. Ingredient edits clear old checks. These features remain local to each browser and do not require Supabase accounts.

The Grinch recipe was supplied by the site owner from a Facebook caption; the original creator is unidentified. Its liquids total about 77 fl oz (2.28 L), more than the original 1.75 L bottle, and the displayed instructions explain the container size and separate chilling time.

## Checks

```bash
node --test tests/*.test.js
node --check app.js
node --check admin.js
node --check supabase-client.js
```

Client tests use mocked HTTP responses; they do not verify a live database. After setup, run `supabase/security-checks.sql` in the SQL Editor to check anonymous browsing, duplicate votes, blocked public/admin mutations, private analytics, and admin edits against your actual policies. Its temporary data is rolled back. Follow it with a browser check of public recipes, your admin login, publishing, voting, and activity refresh.
