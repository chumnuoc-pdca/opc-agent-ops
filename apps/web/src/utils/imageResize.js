// Resize 1 file ảnh (từ <input type="file">) xuống tối đa maxSize px cạnh
// dài nhất rồi trả về data URL base64 - dùng để lưu avatar/logo nhỏ gọn
// thẳng trong DB (TEXT column) mà không cần thêm hạ tầng upload/lưu file.
export const fileToResizedDataUrl = (file, { maxSize = 200, quality = 0.85 } = {}) => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) {
    reject(new Error('Vui lòng chọn 1 file ảnh.'));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('File không phải ảnh hợp lệ.'));
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});
