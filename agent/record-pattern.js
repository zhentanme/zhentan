import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const txId = process.argv[2];
if (!txId) {
  console.error('Usage: node record-pattern.js <tx-id>');
  process.exit(1);
}

try {
  const queue = JSON.parse(readFileSync(join(__dirname, 'pending-queue.json'), 'utf8'));
  const patternsPath = join(__dirname, 'patterns.json');
  const patterns = JSON.parse(readFileSync(patternsPath, 'utf8'));

  const tx = queue.pending.find(t => t.id === txId);
  if (!tx) {
    console.log(JSON.stringify({ status: 'not_found', message: `Transaction ${txId} not found.` }));
    process.exit(1);
  }

  const addr = tx.to.toLowerCase();
  const amount = parseFloat(tx.amount);
  const now = new Date();
  const hour = now.getUTCHours();

  // Update recipient pattern
  if (!patterns.recipients[addr]) {
    patterns.recipients[addr] = {
      label: null,
      totalTxCount: 0,
      totalVolume: '0',
      avgAmount: '0',
      maxAmount: '0',
      lastSeen: null,
      typicalHours: [],
      category: 'unknown'
    };
  }

  const r = patterns.recipients[addr];
  r.totalTxCount += 1;
  r.totalVolume = (parseFloat(r.totalVolume) + amount).toFixed(2);
  r.avgAmount = (parseFloat(r.totalVolume) / r.totalTxCount).toFixed(2);
  if (amount > parseFloat(r.maxAmount)) r.maxAmount = amount.toFixed(2);
  r.lastSeen = now.toISOString();
  if (!r.typicalHours.includes(hour)) r.typicalHours.push(hour);

  // Update daily stats
  const today = new Date().toISOString().split('T')[0];
  if (!patterns.dailyStats[today]) {
    patterns.dailyStats[today] = { txCount: 0, totalVolume: '0' };
  }
  patterns.dailyStats[today].txCount += 1;
  patterns.dailyStats[today].totalVolume = (parseFloat(patterns.dailyStats[today].totalVolume) + amount).toFixed(2);

  writeFileSync(patternsPath, JSON.stringify(patterns, null, 2));

  console.log(JSON.stringify({
    status: 'recorded',
    txId: tx.id,
    recipient: addr,
    updatedPattern: r
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
}
