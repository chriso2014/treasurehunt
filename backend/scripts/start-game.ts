// Starts the game from the command line (the same logic as POST /admin/game/start).
//
//   npm run start-game -- dev
import { AWS_PROFILE, AWS_REGION, parseEnv, stackOutputs } from '../../scripts/aws.js';

const env = parseEnv(process.argv[2]);
process.env.AWS_PROFILE ??= AWS_PROFILE;
process.env.AWS_REGION ??= AWS_REGION;
const outputs = stackOutputs(`treasurehunt-backend-${env}`);
process.env.GAME_TABLE = outputs.GameTable;
process.env.CONTENT_TABLE = outputs.ContentTable;

const { startGame } = await import('../src/lib/start.js');
const started = await startGame(new Date());
console.log(`Game on ${env} is live; ${started} team(s) started now.`);
