import figlet from 'figlet';
import pc from 'picocolors';
import pkg from '../../package.json';

let LOGO: string;
try {
  LOGO = figlet.textSync('contrib', { font: 'ANSI Shadow' });
} catch {
  LOGO = 'contribute-now';
}

export function getVersion(): string {
  return pkg.version ?? 'unknown';
}

export function getAuthor(): string {
  return typeof pkg.author === 'string' ? pkg.author : 'unknown';
}

export function showBanner(minimal = false): void {
  console.log(pc.cyan(`\n${LOGO}`));
  console.log(
    `  ${pc.dim(`v${getVersion()}`)} ${pc.dim('—')} ${pc.dim(`Built by ${getAuthor()}`)}`,
  );

  if (!minimal) {
    console.log(`  ${pc.dim(pkg.description)}`);
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
