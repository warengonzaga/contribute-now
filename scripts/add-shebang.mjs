import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(scriptDir, '../dist/cli.js');
const shebang = '#!/usr/bin/env bun\n';

if (!fs.existsSync(filePath)) {
  throw new Error(`Build output not found: ${filePath}. Run the build before adding the shebang.`);
}

const content = fs.readFileSync(filePath, 'utf8');

if (!content.startsWith(shebang)) {
  fs.writeFileSync(filePath, shebang + content);
  console.log('✓ Added shebang to dist/cli.js');
} else {
  console.log('✓ Shebang already present in dist/cli.js');
}


