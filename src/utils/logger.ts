import { LogEngine, LogMode } from '@wgtechlabs/log-engine';
import pc from 'picocolors';

LogEngine.configure({
  mode: LogMode.INFO,
  format: {
    includeIsoTimestamp: false,
    includeLocalTime: true,
    includeEmoji: true,
  },
});

export function success(msg: string) {
  LogEngine.log(msg);
}

export function error(msg: string) {
  LogEngine.error(msg);
}

export function warn(msg: string) {
  LogEngine.warn(msg);
}

export function info(msg: string) {
  LogEngine.info(msg);
}

export function heading(msg: string) {
  console.log(`\n${pc.bold(msg)}`);
}

export function dim(msg: string) {
  console.log(pc.dim(msg));
}

export { LogEngine };
