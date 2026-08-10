#!/bin/sh
# Purity guard: zhentan-screening must stay dependency-free and env-free.
# The only permitted external import is node:crypto (canonical hashing).
fail=0

if grep -rnE "from ['\"][@a-zA-Z]" --include='*.ts' src | grep -v "from \"crypto\""; then
  echo "PURITY VIOLATION: external import in zhentan-screening (only node crypto is permitted)"
  fail=1
fi

if grep -rnE "process\.env" --include='*.ts' src; then
  echo "PURITY VIOLATION: environment access in zhentan-screening"
  fail=1
fi

[ "$fail" = 0 ] && echo "screening purity ok"
exit $fail
