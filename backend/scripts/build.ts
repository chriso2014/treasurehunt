// Bundles each handler in src/handlers/<group>/<name>.ts to dist/<group>-<name>/index.mjs.
// template.yaml points each function's CodeUri at its dist folder.
import { readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const handlersDir = join(root, 'src/handlers');
const distDir = join(root, 'dist');

rmSync(distDir, { recursive: true, force: true });

const entries = readdirSync(handlersDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((group) =>
    readdirSync(join(handlersDir, group.name))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => ({ group: group.name, name: basename(f, '.ts') })),
  );

await Promise.all(
  entries.map(({ group, name }) =>
    build({
      entryPoints: [join(handlersDir, group, `${name}.ts`)],
      outfile: join(distDir, `${group}-${name}`, 'index.mjs'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      sourcemap: true,
      minify: true,
      // AWS SDK v3 is bundled too, so presigners and lib-dynamodb are pinned to our versions.
      banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    }),
  ),
);

console.log(
  `Built ${entries.length} handler(s): ${entries.map((e) => `${e.group}-${e.name}`).join(', ')}`,
);
