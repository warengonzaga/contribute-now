import figlet from 'figlet';
import pc from 'picocolors';
import pkg from '../../package.json';

let LOGO_BIG: string;
try {
  LOGO_BIG = figlet.textSync('Contribute\nNow', { font: 'ANSI Shadow' });
} catch {
  LOGO_BIG = 'Contribute Now';
}

let LOGO_SMALL: string;
try {
  LOGO_SMALL = figlet.textSync('Contribute Now', { font: 'Slant' });
} catch {
  LOGO_SMALL = 'Contribute Now';
}

export function getVersion(): string {
  return pkg.version ?? 'unknown';
}

export function getAuthor(): string {
  return typeof pkg.author === 'string' ? pkg.author : 'unknown';
}

export function showBanner(variant: 'big' | 'small' = 'small'): void {
  const logo = variant === 'big' ? LOGO_BIG : LOGO_SMALL;
  console.log(pc.cyan(`\n${logo}`));
  console.log(
    `  ${pc.dim(`v${getVersion()}`)} ${pc.dim('—')} ${pc.dim(`Built by ${getAuthor()}`)}`,
  );

  if (variant === 'big') {
    console.log();
    console.log(
      `  ${pc.yellow('Star')}        ${pc.cyan('https://github.com/warengonzaga/contribute-now')}`,
    );
    console.log(
      `  ${pc.green('Contribute')}  ${pc.cyan('https://github.com/warengonzaga/contribute-now/blob/main/CONTRIBUTING.md')}`,
    );
    console.log(`  ${pc.magenta('Sponsor')}     ${pc.cyan('https://warengonzaga.com/sponsor')}`);
  }

  console.log();
}
