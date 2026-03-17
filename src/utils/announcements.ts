import announcements from '../data/announcements.json';
import { hasLegacyConfig } from './config.js';

export type AnnouncementKind = 'info' | 'notice' | 'warning';
type AnnouncementCondition = 'legacy-config-present';

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
    default:
      return false;
  }
}
