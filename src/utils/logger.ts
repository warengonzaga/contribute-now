import { LogEngine, LogMode } from '@wgtechlabs/log-engine';
import pc from 'picocolors';

export const PROJECT_DISPLAY_NAME = 'Contribute Now';

LogEngine.configure({
  mode: LogMode.INFO,
  format: {
    includeIsoTimestamp: false,
    includeLocalTime: false,
    includeEmoji: true,
  },
});

export function success(msg: string, emoji = '✅') {
  LogEngine.log(msg, undefined, { emoji });
}

export function error(msg: string, emoji = '🚨') {
  LogEngine.error(msg, undefined, { emoji });
}

export function warn(msg: string, emoji = '⚠️') {
  LogEngine.warn(msg, undefined, { emoji });
}

export function info(msg: string, emoji = 'ℹ️') {
  LogEngine.info(msg, undefined, { emoji });
}

export function heading(msg: string) {
  console.log(`\n${pc.bold(msg)}`);
}

export function projectHeading(command: string, emoji?: string) {
  const prefix = emoji ? `${pc.bold(emoji)} ` : '';
  console.log(
    `\n${prefix}${pc.bold(pc.cyan(PROJECT_DISPLAY_NAME))} ${pc.dim('—')} ${pc.bold(command)}`,
  );
}

export function dim(msg: string) {
  console.log(pc.dim(msg));
}

export { LogEngine };
