# Account approval deployment checklist

This release adds owner-controlled registration and blocks pending, disabled, or rejected accounts from protected pages and AI APIs.

## 1. Apply the database migration

In the Supabase SQL editor, run:

`supabase/migrations/202608180001_account_approval.sql`

The migration defaults registration to **OFF** and existing profiles to **pending**. The configured owner becomes active automatically on the first authenticated access check.

## 2. Add server-only Vercel variables

Add these to Production and Preview:

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase project service-role key.
- `OWNER_EMAIL`: exact email address of the Career OS owner.

Keep both server-only. Never use a `NEXT_PUBLIC_` prefix.

## 3. Disable direct Supabase public signup

In Supabase Authentication settings, disable new-user signup. Career OS registration is created by the server route only when the owner temporarily enables registration in `/admin`.

This prevents users from bypassing the owner-controlled registration switch by calling Supabase directly.

## 4. Deploy and bootstrap the owner

1. Deploy the code after the migration and environment variables are ready.
2. Sign in with the exact `OWNER_EMAIL` account.
3. Open any protected page once, then open `/admin`.
4. Confirm the account shows role **owner** and status **active**.

## 5. Test the approval flow

1. In `/admin`, turn registration ON.
2. Register a test user.
3. Confirm the user sees **pending owner approval** and cannot access AI APIs.
4. In `/admin`, change the test user to **active**.
5. Confirm the test user can sign in and access protected pages.
6. Turn registration OFF again.

Do not deploy this release before the migration and both server-only variables are configured.
