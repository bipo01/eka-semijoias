import { useCatalog } from '../../store/catalog';

export function AnnouncementBar() {
  const text = useCatalog((s) => s.data.settings.announcement.trim());
  if (!text) return null;
  return (
    <div className="bg-champagne text-ink">
      <p className="container-x py-2 text-center text-[0.8125rem] leading-snug tracking-[0.01em]">{text}</p>
    </div>
  );
}
