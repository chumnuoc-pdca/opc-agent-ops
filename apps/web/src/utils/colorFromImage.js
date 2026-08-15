// Trích màu chủ đạo thật từ 1 ảnh (vd logo dự án) để dùng làm màu đại diện
// tự do (không giới hạn trong 8 màu preset), và chuyển hex bất kỳ sang nền
// pastel lúc runtime (không thể định nghĩa trước biến CSS cho vô hạn mã hex
// như cách làm với 8 màu preset).

const toHex = (n) => n.toString(16).padStart(2, '0');

// Vẽ ảnh vào canvas nhỏ rồi lấy trung bình màu - bỏ qua pixel gần trắng/gần
// đen/gần trong suốt (nền logo thường trắng hoặc trong suốt, tính cả sẽ ra
// màu nhạt sai lệch hẳn khỏi màu chủ đạo thật của logo).
export const extractDominantColorHex = (imgEl) => {
  const size = 50;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, size, size);

  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // ảnh cross-origin bị canvas chặn đọc pixel - bỏ qua, dùng preset như cũ
  }

  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (pa < 200) continue; // gần trong suốt
    const brightness = (pr + pg + pb) / 3;
    if (brightness > 235 || brightness < 20) continue; // gần trắng/gần đen (thường là nền)
    r += pr; g += pg; b += pb; count += 1;
  }

  if (count === 0) return null; // toàn ảnh chỉ có nền trắng/đen/trong suốt - không có màu chủ đạo rõ ràng
  return `#${toHex(Math.round(r / count))}${toHex(Math.round(g / count))}${toHex(Math.round(b / count))}`;
};

// '#3452c4' -> 'rgba(52, 82, 196, 0.14)' - dùng làm nền pastel cho 1 mã hex tự do.
export const hexToRgba = (hex, alpha = 0.14) => {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return `rgba(120, 130, 150, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
