// Reads the backend stack outputs and writes frontend/.env.<env> (gitignored).
import { writeFileSync } from 'node:fs';
import { parseEnv, stackOutputs } from '../../scripts/aws.js';

const env = parseEnv(process.argv[2]);
const outputs = stackOutputs(`treasurehunt-backend-${env}`);

const vars: Record<string, string | undefined> = {
  VITE_ENV: env,
  VITE_API_URL: outputs.ApiUrl,
  VITE_REGION: outputs.Region,
};

const missing = Object.entries(vars).filter(([, v]) => !v);
if (missing.length > 0) {
  console.error(`Missing stack outputs for: ${missing.map(([k]) => k).join(', ')}`);
  process.exit(1);
}

const file = new URL(`../../frontend/.env.${env}`, import.meta.url);
writeFileSync(
  file,
  Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
);
console.log(`Wrote ${file.pathname}`);
