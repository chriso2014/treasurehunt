import { execFileSync } from 'node:child_process';

export const AWS_PROFILE = 'ChrisOrmerod';
export const AWS_REGION = 'eu-west-2';

export const parseEnv = (arg: string | undefined): 'dev' | 'prod' => {
  if (arg !== 'dev' && arg !== 'prod') {
    console.error('Usage: <command> -- dev|prod');
    process.exit(1);
  }
  return arg;
};

export const stackOutputs = (stackName: string): Record<string, string> => {
  const raw = execFileSync(
    'aws',
    [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      stackName,
      '--profile',
      AWS_PROFILE,
      '--region',
      AWS_REGION,
      '--query',
      'Stacks[0].Outputs',
      '--output',
      'json',
    ],
    { encoding: 'utf8' },
  );
  const outputs = JSON.parse(raw) as { OutputKey: string; OutputValue: string }[];
  return Object.fromEntries(outputs.map((o) => [o.OutputKey, o.OutputValue]));
};
