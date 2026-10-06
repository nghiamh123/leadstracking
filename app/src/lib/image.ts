/** Giới hạn khớp backend (tickets.service.ts). Nginx của app mặc định chỉ nhận body 1MB nên nén ảnh trước khi gửi. */
export const MAX_TICKET_IMAGES = 5;
const MAX_EDGE = 1600;
const TARGET_BYTES = 700 * 1024;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Thu nhỏ (cạnh dài tối đa 1600px) và nén JPEG để mỗi ảnh < ~700KB. GIF nhỏ được giữ nguyên. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error(`"${file.name}" không phải ảnh (chỉ nhận PNG, JPEG, GIF, WebP).`);
  }
  if (file.type === "image/gif") {
    if (file.size > TARGET_BYTES) throw new Error(`Ảnh GIF "${file.name}" quá lớn (tối đa 700KB).`);
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Không đọc được ảnh "${file.name}".`);
  }

  let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  try {
    // Thử giảm chất lượng trước, rồi giảm kích thước nếu vẫn quá nặng.
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh.");
      // Nền trắng: ảnh PNG trong suốt chuyển sang JPEG sẽ không bị đen.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.85, 0.7, 0.55]) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= TARGET_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, "") || "anh";
          return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
        }
      }
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
  throw new Error(`Không nén được "${file.name}" xuống dưới 700KB.`);
}
