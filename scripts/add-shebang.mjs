import fs from 'fs';

const filePath = 'dist/cli.js';
const shebang = '#!/usr/bin/env bun\n';
const content = fs.readFileSync(filePath, 'utf8');

if (!content.startsWith(shebang)) {
  fs.writeFileSync(filePath, shebang + content);
  console.log('✓ Added shebang to dist/cli.js');
} else {
  console.log('✓ Shebang already present in dist/cli.js');
}


