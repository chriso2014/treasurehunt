// Creates (or resets) the game master user and adds it to the gamemaster group.
//
//   npm run create-gm -- dev [username]     # default username: gamemaster; prompts for the password
import { createInterface } from 'node:readline';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { passwordSchema } from '@treasurehunt/shared';
import { AWS_PROFILE, AWS_REGION, parseEnv, stackOutputs } from '../../scripts/aws.js';

const env = parseEnv(process.argv[2]);
const username = process.argv[3] ?? 'gamemaster';

const askHidden = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    // Hide what is typed after the prompt.
    output._writeToOutput = () => {};
  });

const password = await askHidden(`Password for ${username} (${env}): `);
const valid = passwordSchema.safeParse(password);
if (!valid.success) {
  console.error(valid.error.issues[0]?.message);
  process.exit(1);
}
if ((await askHidden('Repeat password: ')) !== password) {
  console.error('Passwords do not match');
  process.exit(1);
}

process.env.AWS_PROFILE ??= AWS_PROFILE;
const { UserPoolId } = stackOutputs(`treasurehunt-backend-${env}`);
if (!UserPoolId) {
  console.error('Backend stack output UserPoolId not found. Deploy the backend first.');
  process.exit(1);
}
const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });

try {
  await cognito.send(
    new AdminCreateUserCommand({ UserPoolId, Username: username, MessageAction: 'SUPPRESS' }),
  );
  console.log(`Created ${username}`);
} catch (err) {
  if (!(err instanceof UsernameExistsException)) throw err;
  console.log(`${username} already exists, resetting its password`);
}
await cognito.send(
  new AdminSetUserPasswordCommand({
    UserPoolId,
    Username: username,
    Password: password,
    Permanent: true,
  }),
);
await cognito.send(
  new AdminAddUserToGroupCommand({ UserPoolId, Username: username, GroupName: 'gamemaster' }),
);
console.log(`${username} is a game master on ${env}.`);
