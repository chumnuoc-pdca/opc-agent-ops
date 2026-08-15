import React from 'react';
import { Wrench, Package } from 'lucide-react';

// "Module vận hành" (nội bộ dự án: website, thiết kế, vận hành...) vs
// "Module sản phẩm" (chương trình/sản phẩm-dịch vụ dự án cung ứng) - dùng
// chung 1 nguồn icon/màu/nhãn cho cả Sidebar (icon-only, dày đặc) và trang
// module (đầy đủ icon+chữ) để 2 nơi luôn khớp nhau.
const MODULE_TYPE_META = {
  operation: { label: 'Vận hành', Icon: Wrench, className: 'operation' },
  product: { label: 'Sản phẩm', Icon: Package, className: 'product' }
};

const getMeta = (type) => MODULE_TYPE_META[type] || MODULE_TYPE_META.product;

export function ModuleTypeIcon({ type, size = 13 }) {
  const { Icon, label, className } = getMeta(type);
  return <Icon size={size} className={`module-type-icon ${className}`} title={`Module ${label.toLowerCase()}`} />;
}

// Biến thể "trần" (không có nền tròn của ModuleTypeIcon) - dùng cho các
// dòng meta nhỏ, dày đặc chữ số (vd thẻ dự án ở trang Tổng quan), nơi
// khung nền tròn 18px của ModuleTypeIcon quá to, lệch dòng so với chữ số
// cạnh bên. Vẫn dùng chung Icon/màu ở trên - chỉ khác cách hiển thị.
export function ModuleTypeInlineIcon({ type, size = 13 }) {
  const { Icon, label, className } = getMeta(type);
  return <Icon size={size} className={`module-type-inline-icon ${className}`} title={`Module ${label.toLowerCase()}`} />;
}

export function ModuleTypeBadge({ type }) {
  const { Icon, label, className } = getMeta(type);
  return (
    <span className={`module-type-badge ${className}`}>
      <Icon size={13} /> Module {label}
    </span>
  );
}
