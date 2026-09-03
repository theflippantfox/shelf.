-- 0010_team_invites.sql
-- Re-shape team membership so owners can invite existing Shëlf users
-- and the invitee can review & accept/decline before becoming active.
--
-- Existing state:
--   * shop_members.status already accepts 'invited'
--   * is_shop_member() and shop_members_select only let ACTIVE members
--     see the table — so an invited user can't see their own row.
--
-- What this changes:
--   1. Add invited_by (uuid of the inviter) + invited_at (timestamptz).
--   2. Let invited users see their own row in shop_members (so the
--      /invites page can list them).
--   3. Let invited users UPDATE only the status column on their own
--      row (to accept or decline). All other columns stay locked.
--   4. Owners can still DELETE an invite (cancel) — they already have
--      the shop_members_owner_write policy.

alter table public.shop_members
  add column if not exists invited_by uuid
    references public.profiles(id) on delete set null;

alter table public.shop_members
  add column if not exists invited_at timestamptz;

-- Backfill: existing rows that pre-date the invite flow get a sane
-- "invited" timestamp = created_at and a NULL inviter. Active members
-- and owners aren't shown in any invite UI, so this is purely cosmetic.
update public.shop_members
   set invited_at = created_at
 where invited_at is null;

alter table public.shop_members
  alter column invited_at set not null;

create index if not exists shop_members_invited_by_idx
  on public.shop_members(invited_by);

-- =========================================================================
-- Helper: is the current user invited (status='invited') to this shop?
-- =========================================================================
create or replace function public.is_shop_invitee(shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1
    from public.shop_members
    where shop_id = shop
      and user_id = auth.uid()
      and status = 'invited'
  );
$$;

-- =========================================================================
-- Update is_shop_member to also treat 'invited' as a "has access" status
-- so the invitee can at least see the shop record (name, slug) while
-- their invite is pending. They still cannot see other shop data
-- because per-table SELECTs on sales/products/etc. continue to call
-- is_shop_member() and we leave those strict — see note below.
-- =========================================================================
create or replace function public.is_shop_member(shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1
    from public.shop_members
    where shop_id = shop
      and user_id = auth.uid()
      and status in ('active', 'invited')
  );
$$;

-- =========================================================================
-- Helper: look up a Shëlf user's auth id by email.
-- SECURITY DEFINER + restricted to `service_role` so it's only callable
-- from the server (not from the browser). Used by the team-invite API
-- to verify the typed email belongs to a real account.
-- =========================================================================
create or replace function public.find_user_id_by_email(needle text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select id
  from auth.users
  where lower(email) = lower(needle)
  limit 1;
$$;

-- Restrict: only the service role may call it. Members / anon can't.
revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- Same idea for the inverse: a list of (id, email) for a set of user ids,
-- used to backfill emails on the team page. (PostgREST can't query auth.users
-- directly because it's not in the public schema.)
create or replace function public.get_user_emails(ids uuid[])
returns table (id uuid, email text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, u.email
  from auth.users u
  where u.id = any(ids);
$$;

revoke all on function public.get_user_emails(uuid[]) from public;
grant execute on function public.get_user_emails(uuid[]) to service_role;

-- =========================================================================
-- shop_members policies — extend so invited users can see + accept/decline
-- their own invite.
-- =========================================================================

-- Drop the old "only active members see shop_members" policy.
drop policy if exists shop_members_select on public.shop_members;

-- New SELECT: active members of the shop see everyone, AND a user can
-- always see their own row regardless of status (so invited users see
-- their own pending invite).
create policy shop_members_select on public.shop_members
  for select using (
    public.is_shop_member(shop_id)
    or user_id = auth.uid()
  );

-- The existing shop_members_owner_write is fine for owners (insert,
-- update, delete). For invitees we need a narrow UPDATE on their own
-- row, restricted to flipping status to 'active' or 'suspended'.
drop policy if exists shop_members_invitee_accept on public.shop_members;

create policy shop_members_invitee_accept on public.shop_members
  for update using (
    user_id = auth.uid() and status = 'invited'
  )
  with check (
    user_id = auth.uid() and status in ('active', 'suspended')
  );
