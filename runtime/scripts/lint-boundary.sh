#!/bin/sh
# The permanent boundary (D1): the runtime NEVER touches the database or
# backend internals. Its only workspace dependency is zhentan-screening;
# its only upstream is the Runtime API over HTTP.
fail=0

# (Tests are excluded from the reference scan: the boot-boundary test
# ASSERTS supabase env absence by name. Import statements are still
# guarded in tests by the zhentan-server/supabase package patterns below.)
if grep -rniE "supabase" --include='*.ts' --exclude='*.test.ts' src; then
  echo "BOUNDARY VIOLATION: supabase reference in the runtime"; fail=1
fi

if grep -rnE "from ['\"](zhentan-server|@supabase)" --include='*.ts' src; then
  echo "BOUNDARY VIOLATION: backend/database package imported into the runtime"; fail=1
fi

if grep -nE '"(zhentan-server|@supabase/[a-z-]+)"' package.json; then
  echo "BOUNDARY VIOLATION: forbidden dependency in package.json"; fail=1
fi

[ "$fail" = 0 ] && echo "runtime boundary ok"
exit $fail
