export type AnnouncementSeverity = 'info' | 'warning' | 'update';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  actionLabel?: string | null;
  actionUrl?: string | null;
  createdAt?: string | null;
};
