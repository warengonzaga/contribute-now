import announcements from '../data/announcements.json';
import { hasLegacyConfig } from './config.js';

export type AnnouncementKind = 'info' | 'notice' | 'warning';
type AnnouncementCondition = 'legacy-config-present' | 'contrib-command-used';

interface AnnouncementDefinition {
  id: string;
  kind: AnnouncementKind;
  title: string;
  message: string;
  when?: AnnouncementCondition;
}

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  title: string;
  message: string;
}

const DEFINITIONS = announcements as AnnouncementDefinition[];

export function getActiveAnnouncements(cwd = process.cwd()): Announcement[] {
  return DEFINITIONS.filter((announcement) => shouldShowAnnouncement(announcement, cwd)).map(
    ({ id, kind, title, message }) => ({ id, kind, title, message }),
  );
}

function shouldShowAnnouncement(announcement: AnnouncementDefinition, cwd: string): boolean {
  if (!announcement.when) {
    return true;
  }

  switch (announcement.when) {
    case 'legacy-config-present':
      return hasLegacyConfig(cwd);
    case 'contrib-command-used':
      return isLegacyCommandInvocation();
    default:
      return false;
  }
}

/**
 * Detects whether the CLI was invoked via the legacy `contrib` binary name.
 * Only `contrib` is being phased out — `contribute` remains the primary
 * command and `cn` is the preferred shortcut.
 *
 * argv[1] is the script path; we inspect its basename (without extension)
 * so packaged shims like `contrib.cmd` on Windows still match.
 */
function isLegacyCommandInvocation(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const basename = entry.split(/[\\/]/).pop() ?? '';
  const name = basename.replace(/\.(cmd|exe|ps1|bat|js|mjs|cjs)$/i, '').toLowerCase();
  return name === 'contrib';
}
