import { useEffect, useState } from "react";
import { Image as ImageIcon, Trash, X } from "@phosphor-icons/react";
import { ticketsApi, type TicketImage } from "../../lib/api";

/** Ảnh đã lưu trên server: tải qua fetch (kèm cookie đăng nhập) rồi hiển thị bằng blob URL. */
export function ServerImageThumb({
  ticketId,
  image,
  onRemove,
}: {
  ticketId: string;
  image: TicketImage;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    ticketsApi
      .imageBlob(ticketId, image.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId, image.id]);

  return (
    <>
      <div className="group relative h-24 w-24 overflow-hidden rounded-lg border border-border bg-surface-alt">
        {url ? (
          <button onClick={() => setViewing(true)} className="h-full w-full" title={image.filename}>
            <img src={url} alt={image.filename} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            {failed ? "Lỗi tải ảnh" : <ImageIcon size={20} />}
          </div>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Xoá ảnh"
            className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white opacity-100 hover:bg-ink sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash size={12} />
          </button>
        )}
      </div>
      {viewing && url && <Lightbox url={url} alt={image.filename} onClose={() => setViewing(false)} />}
    </>
  );
}

/** Ảnh vừa chọn, chưa tải lên (xem trước từ File trong bộ nhớ trình duyệt). */
export function PendingImageThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <>
      <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-border bg-surface-alt">
        {url && (
          <button onClick={() => setViewing(true)} className="h-full w-full" title={file.name}>
            <img src={url} alt={file.name} className="h-full w-full object-cover" />
          </button>
        )}
        <button
          onClick={onRemove}
          aria-label="Bỏ ảnh"
          className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white hover:bg-ink"
        >
          <X size={12} />
        </button>
      </div>
      {viewing && url && <Lightbox url={url} alt={file.name} onClose={() => setViewing(false)} />}
    </>
  );
}

function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/80" />
      <img src={url} alt={alt} className="relative max-h-full max-w-full rounded-lg object-contain" />
      <button
        onClick={onClose}
        aria-label="Đóng"
        className="absolute right-4 top-4 rounded-full bg-surface p-2 text-ink hover:bg-surface-alt"
      >
        <X size={16} />
      </button>
    </div>
  );
}
