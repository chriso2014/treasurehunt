// Puts an env back to the start: deletes every team (items, logins, photos) and the game item,
// so the game is in registration again. Content and game master logins are kept.
// Used before the event (to clear rehearsal teams from prod) and after it (cleanup).
//
//   npm run reset -- dev|prod          # shows what will go, then asks you to type the env name
import { createInterface } from 'node:readline/promises';
import { AWS_PROFILE, AWS_REGION, parseEnv, stackOutputs } from '../../scripts/aws.js';

const env = parseEnv(process.argv[2]);
process.env.AWS_PROFILE ??= AWS_PROFILE;
process.env.AWS_REGION ??= AWS_REGION;
const outputs = stackOutputs(`treasurehunt-backend-${env}`);
process.env.GAME_TABLE = outputs.GameTable;
process.env.ASSETS_BUCKET = outputs.AssetsBucket;
process.env.USER_POOL_ID = outputs.UserPoolId;

const { resetGame } = await import('../src/lib/reset.js');
const plan = await resetGame({ dryRun: true });
console.log(
  `On ${env} this deletes ${plan.teams} team(s) (${plan.items} game item(s)), ` +
    `${plan.logins} team login(s) and ${plan.photos} photo(s), ` +
    'and puts the game back to registration. Content and game master logins stay.',
);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`Type ${env} to go ahead: `);
rl.close();
if (answer.trim() !== env) {
  console.log('Nothing deleted.');
  process.exit(1);
}

const done = await resetGame();
console.log(
  `Reset ${env}: ${done.teams} team(s), ${done.logins} login(s), ${done.photos} photo(s) removed.`,
);
