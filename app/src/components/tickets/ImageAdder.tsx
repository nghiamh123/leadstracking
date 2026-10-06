import { useEffect, useRef, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { compressImage } from "../../lib/image";

/**
 * Nút "Thêm ảnh" + kéo thả + dán ảnh (Ctrl/Cmd+V ở bất kỳ đâu trong cửa sổ khi đang mở).
 * Nén từng ảnh trước khi trao cho `onFiles`; ảnh lỗi được báo qua `onError`, không chặn các ảnh còn lại.
 */
export function ImageAdder({
  remaining,
  disabled,
  disabledReason,
  onFiles,
  onError,
  children,
}: {
  remaining: number;
  disabled?: boolean;
  /** Có giá trị = vô hiệu hoá toàn bộ (nút, kéo thả, dán) và hiển thị lý do thay cho gợi ý. */
  disabledReason?: string;
  onFiles: (files: File[]) => void | Promise<void>;
  onError: (message: string | null) => void;
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const blocked = disabled || !!disabledReason || processing || remaining <= 0;

  async function handle(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    if (blocked) return;
    onError(null);
    const accepted = images.slice(0, remaining);
    const errors: string[] = [];
    if (images.length > remaining) errors.push(`Chỉ thêm được ${remaining} ảnh nữa, đã bỏ ${images.length - remaining} ảnh.`);

    setProcessing(true);
    const ready: File[] = [];
    for (const file of accepted) {
      try {
        ready.push(await compressImage(file));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Không xử lý được ảnh.");
      }
    }
    try {
      if (ready.length > 0) await onFiles(ready);
    } finally {
      setProcessing(false);
    }
    if (errors.length > 0) onError(errors.join(" "));
  }

  // Dán ảnh chụp màn hình từ clipboard. Dùng ref để listener luôn gọi bản handle mới nhất.
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        void handleRef.current(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!blocked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handle(Array.from(e.dataTransfer.files));
      }}
      className={`flex flex-col gap-3 rounded-xl border border-dashed p-3 transition-colors ${
        dragging ? "border-ink bg-surface-alt" : "border-border"
      } ${disabledReason ? "opacity-70" : ""}`}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            void handle(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={blocked}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-alt disabled:opacity-50"
        >
          <UploadSimple size={16} />
          {processing ? "Đang xử lý ảnh..." : "Thêm ảnh"}
        </button>
        <span className="text-xs text-muted">
          {disabledReason ??
            (remaining > 0
              ? "Chọn file, kéo thả, hoặc dán ảnh chụp màn hình (Ctrl/Cmd+V)."
              : "Đã đạt số ảnh tối đa.")}
        </span>
      </div>
    </div>
  );
}
