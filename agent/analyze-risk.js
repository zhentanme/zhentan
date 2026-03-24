import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const txId = process.argv[2];
if (!txId) {
  console.error('Usage: node analyze-risk.js <tx-id>');
  process.exit(1);
}

try {
  const queue = JSON.parse(readFileSync(join(__dirname, 'pending-queue.json'), 'utf8'));
  const patterns = JSON.parse(readFileSync(join(__dirname, 'patterns.json'), 'utf8'));

  const tx = queue.pending.find(t => t.id === txId);
  if (!tx) {
    console.log(JSON.stringify({ status: 'not_found', message: `Transaction ${txId} not found.` }));
    process.exit(1);
  }

  let riskScore = 0;
  const reasons = [];
  const recipient = patterns.recipients[tx.to.toLowerCase()];

  // 1. Unknown recipient = +40 risk
  if (!recipient) {
    riskScore += 40;
    reasons.push('Unknown recipient (never seen before)');
  } else {
    // Known recipient but unusual amount
    const avg = parseFloat(recipient.avgAmount || '0');
    const txAmount = parseFloat(tx.amount);
    if (avg > 0 && txAmount > avg * 3) {
      riskScore += 25;
      reasons.push(`Amount ${tx.amount} is ${(txAmount / avg).toFixed(1)}x the average (${avg})`);
    }
  }

  // 2. Time of day check (use current time since queue entries have no timestamp)
  const hour = new Date().getUTCHours();
  const allowedHours = patterns.globalLimits.allowedHoursUTC;
  if (!allowedHours.includes(hour)) {
    riskScore += 20;
    reasons.push(`Current time ${hour}:00 UTC is outside business hours`);
  }

  // 3. Amount exceeds global single-tx limit
  if (parseFloat(tx.amount) > parseFloat(patterns.globalLimits.maxSingleTx)) {
    riskScore += 30;
    reasons.push(`Amount ${tx.amount} exceeds single-tx limit of ${patterns.globalLimits.maxSingleTx}`);
  }

  // 4. Daily volume check
  const today = new Date().toISOString().split('T')[0];
  const dailyUsed = parseFloat(patterns.dailyStats[today]?.totalVolume || '0');
  if (dailyUsed + parseFloat(tx.amount) > parseFloat(patterns.globalLimits.maxDailyVolume)) {
    riskScore += 20;
    reasons.push(`Would exceed daily volume limit (${dailyUsed} + ${tx.amount} > ${patterns.globalLimits.maxDailyVolume})`);
  }

  riskScore = Math.min(riskScore, 100);

  if (reasons.length === 0) {
    reasons.push('Known recipient, normal amount, within business hours');
  }

  const verdict = riskScore < 40 ? 'APPROVE' : riskScore < 70 ? 'REVIEW' : 'BLOCK';

  console.log(JSON.stringify({
    txId: tx.id,
    to: tx.to,
    amount: tx.amount,
    token: tx.token,
    riskScore,
    verdict,
    reasons
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
