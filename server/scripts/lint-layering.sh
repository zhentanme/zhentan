#!/bin/sh
# Architectural boundary guards (A1, A2, C2). Run from server/ via
# `npm run lint:layering`. Each rule prints its violations; exit 1 on any.
#
# Rules 3–5 match MODULE SUFFIXES, not lib/-anchored paths — a file inside
# src/lib/ importing "../agent/signer.js" or "./supabase/agentData.js" is
# the same violation at a different relative depth (that first form is the
# exact production import that existed before C1).
#
# Takes an optional target dir (default: src) so the fixture self-test
# (lintLayering.test.ts) can run the guard against planted violations.
SRC="${1:-src}"
fail=0

# 1 (A1): lib/ never imports from routes/
if grep -rnE "from ['\"][^'\"]*routes/" --include='*.ts' "$SRC/lib" 2>/dev/null; then
  echo "RULE 1 VIOLATION: lib/ imports from routes/"; fail=1
fi

# 2 (A2): raw digest signing confined to the signer module
if grep -rnE "sign(Hash|Digest)\(" --include='*.ts' "$SRC" | grep -v "agent/signer"; then
  echo "RULE 2 VIOLATION: raw signHash/signDigest outside the signer module"; fail=1
fi

# 3 (C2): the signer module is reachable only via the agent domain.
# Suffix match: catches lib/agent/signer.js, ../agent/signer.js, etc.
# (The colocated signer.test.ts imports "./signer.js", which does not
# carry the agent/ prefix and stays inside the module directory.)
if grep -rnE "from ['\"][^'\"]*agent/signer" --include='*.ts' "$SRC" | grep -v "^$SRC/agent/index.ts"; then
  echo "RULE 3 VIOLATION: signer module imported outside $SRC/agent"; fail=1
fi

# 4 (C2): agent-domain data access only via the agent domain.
# Bare-name match: also catches a "./agentData.js" re-export from within
# lib/supabase (which would reopen the whole boundary).
if grep -rnE "from ['\"][^'\"]*agentData" --include='*.ts' "$SRC" | grep -v "^$SRC/agent/"; then
  echo "RULE 4 VIOLATION: agentData imported outside $SRC/agent"; fail=1
fi

# 5 (C2): the risk engine is reachable only via the agent domain
# (agentData may import its types)
if grep -rnE "from ['\"][^'\"]*risk.js" --include='*.ts' "$SRC" | grep -v "^$SRC/agent/\|^$SRC/lib/supabase/agentData.ts"; then
  echo "RULE 5 VIOLATION: risk engine imported outside $SRC/agent"; fail=1
fi

[ "$fail" = 0 ] && echo "layering ok"
exit $fail
