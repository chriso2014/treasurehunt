// Reviews photo and dance submissions from the command line (the GM screen comes in phase 7).
//
//   npm run review -- dev                          # list what's waiting
//   npm run review -- dev approve 1                # approve item 1 of the list
//   npm run review -- dev decline 1 "reason"       # decline it, with an optional reason
import { AWS_PROFILE, AWS_REGION, parseEnv, stackOutputs } from '../../scripts/aws.js';

const [envArg, action, indexArg, ...reasonWords] = process.argv.slice(2);
const env = parseEnv(envArg);
process.env.AWS_PROFILE ??= AWS_PROFILE;
process.env.AWS_REGION ??= AWS_REGION;
const outputs = stackOutputs(`treasurehunt-backend-${env}`);
process.env.GAME_TABLE = outputs.GameTable;
process.env.CONTENT_TABLE = outputs.ContentTable;
process.env.ASSETS_BUCKET = outputs.AssetsBucket;

const { listPendingReviews, applyReview } = await import('../src/lib/review.js');
const { viewUrl } = await import('../src/lib/s3.js');
const pending = await listPendingReviews();

if (!action) {
  if (pending.length === 0) console.log('Nothing waiting for review.');
  for (const [i, p] of pending.entries()) {
    const what = p.type === 'photo' ? 'photo' : 'dance call';
    console.log(
      `${i + 1}. ${p.teamName}: stage ${p.stage} ${what} (${p.questionId}), ${p.submittedAt}`,
    );
    if (p.photoKey) console.log(`   ${await viewUrl(p.photoKey)}`);
  }
  process.exit(0);
}

if (action !== 'approve' && action !== 'decline') {
  console.error('Usage: npm run review -- <dev|prod> [approve|decline <n> [reason]]');
  process.exit(1);
}
const item = pending[Number(indexArg) - 1];
if (!item) {
  console.error(`No item ${indexArg ?? ''} in the list. Run without arguments to see it.`);
  process.exit(1);
}
const applied = await applyReview({
  teamId: item.teamId,
  attemptId: item.attemptId,
  decision: action === 'approve' ? 'approved' : 'declined',
  reason: reasonWords.join(' ') || undefined,
  now: new Date(),
});
console.log(applied ? `${action}d: ${item.teamName}, stage ${item.stage}.` : 'Already decided.');
