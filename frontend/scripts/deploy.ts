// Builds the SPA for <env>, uploads it to the site bucket and invalidates CloudFront.
// Expects frontend/.env.<env> (npm run frontend:env -- <env>) and the frontend stack to exist.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { AWS_PROFILE, AWS_REGION, parseEnv, stackOutputs } from '../../scripts/aws.js';

const env = parseEnv(process.argv[2]);
const frontendDir = new URL('..', import.meta.url).pathname;
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: frontendDir });
const aws = (args: string[]) =>
  run('aws', [...args, '--profile', AWS_PROFILE, '--region', AWS_REGION]);

if (!existsSync(new URL(`../.env.${env}`, import.meta.url))) {
  console.error(`frontend/.env.${env} not found: run npm run frontend:env -- ${env} first`);
  process.exit(1);
}

const { SiteBucket, DistributionId } = stackOutputs(`treasurehunt-frontend-${env}`);
if (!SiteBucket || !DistributionId) {
  console.error('Frontend stack outputs SiteBucket/DistributionId not found');
  process.exit(1);
}

run('npx', ['tsc', '-p', 'tsconfig.json']);
run('npx', ['vite', 'build', '--mode', env]);

// Hashed assets can be cached forever; index.html must always be re-fetched.
aws([
  's3',
  'sync',
  'dist',
  `s3://${SiteBucket}`,
  '--delete',
  '--exclude',
  'index.html',
  '--cache-control',
  'public,max-age=31536000,immutable',
]);
aws([
  's3',
  'cp',
  'dist/index.html',
  `s3://${SiteBucket}/index.html`,
  '--cache-control',
  'no-cache',
]);
aws(['cloudfront', 'create-invalidation', '--distribution-id', DistributionId, '--paths', '/*']);
