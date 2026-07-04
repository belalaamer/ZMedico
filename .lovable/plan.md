
## Goal
Support real "unlinked employees" (staff records with no user account) and a proper Link picker on both User and Employee pages, while preserving the current 1:1 model as a strict uniqueness rule (not a shared PK).

## Schema change (single migration)

1. `ALTER TABLE public.staff_profiles ADD COLUMN linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;`
2. Backfill: `UPDATE staff_profiles SET linked_user_id = id WHERE linked_user_id IS NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = staff_profiles.id);`
3. `CREATE UNIQUE INDEX ux_staff_profiles_linked_user ON public.staff_profiles(linked_user_id) WHERE linked_user_id IS NOT NULL AND deleted_at IS NULL;` — enforces one-to-one.
4. Keep `staff_profiles.id` as PK (unchanged). Existing rows keep id == user id; new unlinked employees get a fresh `gen_random_uuid()`.
5. RLS: adjust the "user reads own staff_profile" policy to match on `linked_user_id = auth.uid()` in addition to `id = auth.uid()` (back-compat).

## Access gating
Update `usePermissions` / role resolution so a user with **no active `staff_profiles` row where `linked_user_id = auth.uid()` AND `deleted_at IS NULL` AND `status = 'active'`** gets zero permissions and sees no modules. Roles in `user_roles` alone are not enough — the link must exist.

## Link picker (User page & StaffDetail page)
- Query: `staff_profiles` where `deleted_at IS NULL` AND `linked_user_id IS NULL` AND `branch_id = <current branch>`.
- Also fetch already-linked ones in the same branch to display as **"غير متاح — مرتبط"** / "Unavailable — already linked" (disabled row).
- Empty state EN/AR when no rows.
- On confirm: `UPDATE staff_profiles SET linked_user_id = <target user id> WHERE id = <picked staff id> AND linked_user_id IS NULL` (guard against race). If the target user already has a link → block with error.
- Write `audit_logs` row: action `employee_linked`, entity_type `user_employee_link`, old/new values with user_id, staff_id, branch_id, role.

## Unlink
- `UPDATE staff_profiles SET linked_user_id = NULL WHERE linked_user_id = <user id>`.
- Delete user's rows in `user_roles` (revokes access immediately).
- Audit: `employee_unlinked`.

## Replace
- Single transactional RPC or sequential guarded updates: unlink current staff row, link the new one, keep `user_roles` intact (or update role if picker specifies).
- On any failure, rollback (RPC preferred). Audit: `employee_replaced` with both old and new staff ids.

## User page (`UserManagement.tsx`)
- Restore Link button → opens the branch-scoped employee picker (not Edit).
- Show "Linked to: <employee name / code>" badge with jump-to-employee link.
- Add Replace action next to Unlink when already linked.
- Admin/HR gated.

## Employee page (`StaffDetail.tsx`)
- If `linked_user_id IS NULL`: show "Not linked" state with **Link to user** button (picker of users without a link).
- If linked: show linked user with **Unlink** and **Replace** actions and a jump-to-user link.
- Mirror the same audit writes.

## Cross-branch guard
Both link and replace refuse when picked staff's `branch_id` ≠ user's current active branch context; return a clear EN/AR error toast.

## Files to touch
- migration (new)
- `src/hooks/usePermissions.ts` (gate on link existence)
- `src/hooks/useUserRole.ts` (optional: expose link status) OR a new `useEmployeeLink` hook
- `src/pages/settings/UserManagement.tsx` (picker + link/unlink/replace)
- `src/pages/hr/StaffDetail.tsx` (mirror actions + linked-user badge)
- `src/pages/hr/Staff.tsx` (show unlinked badge in list — small)
- Types regenerate automatically after migration.

## Out of scope
- No changes to how staff/schedule/attendance/payroll join on `staff_profiles.id` (existing rows keep id == user id, new unlinked staff have no dependent rows yet, so nothing breaks).
- No redesign of `user_roles`.

Approve to proceed and I'll ship the migration first, then the code changes after types regenerate.
