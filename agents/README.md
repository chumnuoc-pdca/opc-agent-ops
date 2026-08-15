# Định nghĩa Agent

Mỗi file `.md` trong thư mục này là 1 agent thật trong hệ thống - không có bảng
`agent_defs` trong database. Sửa file này, commit Git, xong - server tự nạp
lại (hot-reload, xem mục cuối) mà không cần khởi động lại.

## Cấu trúc file

```markdown
---
id: m1-shortvideo-agent          # bắt buộc, duy nhất, dùng làm khoá tra cứu
moduleId: M1                      # bỏ trống nếu agent không gắn với 1 module cụ thể (vd: CEO)
triggerKeywords: [tiktok, affiliate, short video]   # gợi ý cho CEO agent khi phân việc
model: agnes-2.0-flash            # tên model trên cổng agnes/OpenAI-compatible
temperature: 0.5                  # tuỳ chọn, mặc định lấy theo config.js
allowedTools: [search_tasks, get_task_detail, create_task, update_task_fields]
---

Phần thân (Markdown) chính là system prompt của agent - vai trò, nguyên tắc,
giới hạn. Nếu agent có `moduleId`, hệ thống TỰ ĐỘNG nối thêm vào cuối:
mô tả/chi tiết mô hình của module đó, và mọi Case Study đã được admin curate
phần Rule/Memory/Skill (xem `orchestrator/systemPrompt.js`).
```

## Các trường frontmatter

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `id` | Có | Khoá duy nhất. Trùng `id` giữa 2 file → file đọc sau ghi đè file đọc trước (thứ tự theo `readdirSync`, không đảm bảo alphabetic). Tránh trùng. |
| `moduleId` | Không | Trỏ tới `modules.id` - agent này sẽ được worker gán làm agent phụ trách khi `modules.agent_id` trỏ tới `id` của nó (xem bên dưới). Bỏ trống cho agent không có board riêng (CEO, HR meta-agent tự quyết định board đích qua tool). |
| `triggerKeywords` | Không | Chỉ dùng làm gợi ý hiển thị cho CEO agent khi phân việc bằng ngôn ngữ tự nhiên - không lọc cứng. |
| `model` | Không | Model trên cổng agnes. Bỏ trống → dùng `AI_CONFIG.model` mặc định (`apps/server/src/config.js`). |
| `temperature` | Không | Bỏ trống → dùng mặc định trong `config.js`. |
| `allowedTools` | Có (nên khai rõ) | Danh sách tên tool trong `AI_TOOLS` (`orchestrator/aiTools.js`) mà agent này được phép gọi. Bỏ trống = agent không gọi được tool nào. **Đây là giới hạn quyền thật** - agent không thể tự ý gọi tool ngoài danh sách này dù model có "muốn" gọi. |

## Rủi ro tool (R0-R3) - không cấu hình ở đây

Mức rủi ro của từng tool (R0 tự động, R1 tự động, R2/R3 phải người duyệt) được
định nghĩa CỐ ĐỊNH trong `TOOL_RISK` (`orchestrator/aiTools.js`), áp dụng như
nhau cho mọi agent - không khai báo lại per-agent. Nếu muốn 1 agent không bao
giờ được xoá/sửa việc nguy hiểm, đơn giản là không thêm `delete_task`/
`update_task_fields` vào `allowedTools` của agent đó.

## Nguyên tắc chung cho mọi agent nghiệp vụ mới

Rút ra từ toàn bộ tài liệu mô hình kinh doanh trong `Ref/*.md` (playbook 13 mô
hình, tài liệu M6/M14) - áp dụng cho MỌI agent gắn với 1 module, không nhắc
lại riêng trong từng file agent:

- **Bắt buộc người duyệt** (không tự động hoá qua agent dù có tool): bài đăng
  công khai, gửi email/thông báo hàng loạt, giao dịch tài chính, claim y
  tế/tài chính, dữ liệu khách hàng nhạy cảm, và mọi quyết định có yếu tố pháp
  lý. Cơ chế R2/R3 (`TOOL_RISK`) đã ép việc này ở mức tool, nhưng khi viết
  system prompt cho agent mới vẫn nên nhắc lại tường minh để agent tự biết
  dừng ở "soạn nháp" thay vì cố tìm cách tự thực hiện phần này.
- **Không tự bịa số liệu/kết quả**: nếu thiếu dữ liệu thật (số liệu kinh
  doanh, tư liệu đối thủ, kết quả đo lường...), agent phải tạo task hỏi lại
  hoặc ghi rõ "chưa có số liệu"/"[GIẢ ĐỊNH]" thay vì tự suy đoán rồi ghi như
  thật (đã áp dụng nhất quán từ M1/M2/M5/RESEARCH trở đi).
- **Không tự nhận đã hoàn thành phần việc ngoài phạm vi tool có sẵn** (vd:
  build code sản phẩm/website thật, đăng bài thật, gửi email thật) - các
  hành động này nằm ngoài `aiTools.js` hiện tại, agent chỉ soạn nội dung/kế
  hoạch rồi bàn giao cho con người hoặc hệ thống ngoài thực hiện.

## Cách gắn 1 agent vào 1 module (bảng công việc riêng)

Tạo file `.md` với `moduleId` trỏ đúng module, sau đó gán
`modules.agent_id = "<id-agent>"` trong database (không có UI cho việc này ở
Phase 0-4 - dùng script 1 lần qua `better-sqlite3`, xem lịch sử các lần gán
`m1-shortvideo-agent`/`m2-fanpage-agent`/`hr-meta-agent` làm mẫu). Sau khi gán,
worker (`apps/server/src/worker/index.js`) sẽ tự nhặt mọi task trong board của
module đó có `assignee.type === 'agent'` và chạy agent tương ứng.

## Bàn giao giữa agent (handoff_to_agent)

Nếu 1 agent cần chuyển việc cho agent khác sau khi xong phần của mình, thêm
`handoff_to_agent` vào `allowedTools` của nó. Gọi tool này sẽ tạo 1 task MỚI
trong board của agent đích, `dependsOn` trỏ về task gốc - không sửa task hiện
tại. Nếu agent kết thúc vòng lặp ngay sau khi gọi `handoff_to_agent` mà không
còn hành động nào khác, trạng thái cuối của run là `awaiting_handoff` (khác
`done`), để phân biệt "đã xong và bàn giao tiếp" với "xong hẳn, không cần ai
làm thêm".

## HR meta-agent - loại agent đặc biệt, không nhận task

`hr-meta-agent.md` không chạy qua worker's task-claim loop như các agent khác
- nó chạy theo lịch định kỳ (`apps/server/src/hrMetaAgent.js`,
`startHrMetaSchedule()`, mặc định 7 ngày/lần, đổi qua biến môi trường
`HR_META_INTERVAL_MS`), hoặc kích hoạt thủ công qua
`POST /api/hr-meta/run`. Vai trò của nó: quét các module CHƯA có `agent_id`,
và nếu thấy tín hiệu khối lượng việc lặp lại đủ rõ, đề xuất bằng cách gọi
`create_task` tạo 1 thẻ (gắn `tags: ["meta-proposal"]`) vào board `HR-META` -
con người duyệt đề xuất này như mọi thẻ Kanban khác, không có màn hình riêng.

## Hot-reload

Server theo dõi thư mục này (`watchAgentRegistry()` trong `agents-loader.js`)
- sửa xong 1 file `.md` và lưu là registry tự nạp lại trong ~300ms, áp dụng
cho lượt task/scan tiếp theo. Không cần restart server. Một run ĐANG chạy dở
(system prompt đã build từ bản cũ) vẫn tiếp tục với bản cũ - chỉ lượt tiếp
theo mới thấy bản mới.
