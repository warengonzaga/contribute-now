import fs from 'node:fs';
import path from 'node:path';

const targets = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'src/cli.ts',
  'src/commands/clean.ts',
  'src/commands/commit.ts',
  'src/commands/config.ts',
  'src/commands/discard.ts',
  'src/commands/doctor.ts',
  'src/commands/hook.ts',
  'src/commands/log.ts',
  'src/commands/save.ts',
  'src/commands/start.ts',
  'src/commands/status.ts',
  'src/commands/submit.ts',
  'src/commands/switch.ts',
  'src/commands/sync.ts',
  'src/commands/update.ts',
  'src/commands/validate.ts',
  'src/utils/copilot.ts',
  'src/utils/workflow.ts',
  'landing/index.html',
];

const SENTINEL = '__CONTRIB_SAVE_SENTINEL__';
let total = 0;
for (const rel of targets) {
  const p = path.resolve(rel);
  if (!fs.existsSync(p)) continue;
  let src = fs.readFileSync(p, 'utf8');
  const before = src;
  src = src.replaceAll('contrib-save:', SENTINEL);
  src = src.replace(/\bcontrib(?!ut)/g, 'cn');
  src = src.replaceAll(SENTINEL, 'contrib-save:');
  if (src !== before) {
    fs.writeFileSync(p, src);
    const count = (before.match(/\bcontrib(?!ut)/g) || []).length
      - (before.match(/contrib-save:/g) || []).length;
    console.log(`${rel}: ${count} replacements`);
    total += count;
  }
}
console.log(`\nTotal: ${total}`);
