#!/bin/sh
# Architectural boundary guards (A1, A2, C2). Run from server/ via
# `npm run lint:layering`. Each rule prints its violations; exit 1 on any.
fail=0

# 1 (A1): lib/ never imports from routes/
if grep -rnE "from ['\"][^'\"]*routes/" --include='*.ts' src/lib; then
  echo "RULE 1 VIOLATION: lib/ imports from routes/"; fail=1
fi

# 2 (A2): raw digest signing confined to the signer module
if grep -rnE "sign(Hash|Digest)\(" --include='*.ts' src | grep -v lib/agent/signer; then
  echo "RULE 2 VIOLATION: raw signHash/signDigest outside the signer module"; fail=1
fi

# 3 (C2): the signer module is reachable only via the agent domain
if grep -rnE "from ['\"][^'\"]*lib/agent/signer" --include='*.ts' src | grep -v "^src/agent/index.ts"; then
  echo "RULE 3 VIOLATION: lib/agent/signer imported outside src/agent"; fail=1
fi

# 4 (C2): agent-domain data access only via the agent domain
if grep -rnE "from ['\"][^'\"]*lib/supabase/agentData" --include='*.ts' src | grep -v "^src/agent/"; then
  echo "RULE 4 VIOLATION: agentData imported outside src/agent"; fail=1
fi

# 5 (C2): the risk engine is reachable only via the agent domain
# (agentData may import its types)
if grep -rnE "from ['\"][^'\"]*risk.js" --include='*.ts' src | grep -v "^src/agent/\|^src/lib/supabase/agentData.ts"; then
  echo "RULE 5 VIOLATION: risk engine imported outside src/agent"; fail=1
fi

[ "$fail" = 0 ] && echo "layering ok"
exit $fail
