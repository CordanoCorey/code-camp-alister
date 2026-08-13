# Slice 14 post-Slice-12 merge note

Do not merge or deploy migration `0013_international_directory_foundation.sql` until Slice 12 is launched and production evidence confirms migrations through `0012_ordinary_account_lifecycle.sql`.

After that checkpoint, fetch the released Slice 12 branch, rebase `codex/ranger-outpost-slice-14` onto its exact release commit, and verify that migration 0013 remains the only new migration and that migrations 0001-0012 are byte-for-byte unchanged. Resolve application-code conflicts in favor of the released Slice 12 bindings/configuration, rerun all required checks, inspect the generated migration diff, then merge without squashing or renumbering 0013. Apply 0013 only through the normal post-release migration process; do not use this branch to change production bindings, Access, email, Turnstile, Cron, deploy scripts, or remote D1 directly.
