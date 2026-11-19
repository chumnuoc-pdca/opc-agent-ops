# OPC Agent Ops

Hệ thống agent AI vận hành thật (CEO điều phối → agent chuyên trách chạy nền →
bàn giao chuỗi → con người duyệt qua Kanban). Fork **tách biệt** khỏi app gốc
`~/OPC` (OPC Workspace) — tận dụng lại tư duy Group→Module→Task, cấu trúc UI
Kanban, và các file `aiClient.js`/`aiTools.js`/`agentOrchestrator.js`/
`taskOperations.js`/`boardStorage.js`/`auditLog.js` gốc, nhưng có backend thật
(Fastify + SQLite) thay vì chỉ localStorage.

Kế hoạch kiến trúc gốc đã được duyệt nằm ở
`~/.Codex/plans/scalable-soaring-walrus.md` — đọc file đó nếu cần lại toàn bộ
lý do đằng sau các quyết định thiết kế (giữ nguyên 4 cột Kanban, agent-run-status
là field trên thẻ chứ không phải cột mới, v.v.).

## Trạng thái hiện tại

**Phase 0-4 đã hoàn thành và kiểm chứng bằng dữ liệu/API/UI thật** (không chỉ
đọc code — mọi tính năng dưới đây đã được test qua curl/CDP/DB query thật):

- Phase 0: Fastify + SQLite, seed từ đúng `INITIAL_MODULES` của frontend.
- Phase 1: agent registry đọc từ `agents/*.md`, CEO agent phân việc qua
  `create_task`.
- Phase 2: worker chạy nền (poll + claim), checkpoint/resume cho tool cần
  duyệt (R2/R3), badge trạng thái agent trên thẻ, endpoint granular thay whole-
  board PUT (tránh race giữa tab người dùng và worker).
- Phase 3: nhiều agent chạy song song thật, `handoff_to_agent` + chuỗi
  `dependsOn` + trạng thái `awaiting_handoff`, SSE live-update.
- Phase 4: eval log UI (chấm điểm/ghi chú thật cho từng agent run), HR
  meta-agent (đề xuất agent mới dựa trên số liệu thật), `agents/README.md`,
  hot-reload agent file.
- Phase 5: đóng 4 khoảng trống đã biết ở Phase 0-4 — `ChatPage.jsx` nối sang
  `POST /api/orchestrator/command` (hành động Chat giờ vào `audit_log` +
  SSE thật), `GET /api/agents` trả thêm `temperature`, agent M1/M2 có thêm 5
  tool ghi trực tiếp Assets/Case Study/KPI/Tài chính khi có kết quả thật
  (`log_case_study`/`create_asset`/`update_asset`/`record_finance_entry`/
  `update_kpi_result`), và auth cơ bản (cookie session 1 mật khẩu chung qua
  `routes/auth.js` + `AuthGate.jsx`). Chi tiết xem
  `~/.Codex/plans/serialized-cuddling-swan.md`.
- Phase 6: mở rộng nghiệp vụ dựa trên `Ref/*.md` — 2 agent mới, kiểm chứng
  bằng task/handoff thật: `m5-community-agent` (gắn vào M5 sẵn có, 5 vai trò
  Onboarding/Content Update/Q&A/Engagement/Churn theo đúng playbook M5) và
  `research-agent` (module hỗ trợ mới `RESEARCH`, cùng nhóm `g5` với
  `HR-META` — phân tích tư liệu đối thủ THẬT được cung cấp thành insight,
  KHÔNG tự duyệt web vì hệ thống chưa có tool web-search). M1 agent đã được
  dặn `handoff_to_agent` sang `RESEARCH` trước khi lên concept mới cho ngách
  chưa từng làm.
- Phase 7: gắn agent cho 3 module tiếp theo dựa `Ref/*.md` —
  `m3-toolreview-agent` (M3, Affiliate sản phẩm số/AI Tool Review),
  `m10-newssocial-agent` (M10, Content AI Tool/News-to-Social Pipeline),
  `m12-website-agent` (M12, Dịch vụ website/landing page bằng AI). M10 cần
  tin thật để viết bài nên có thêm tool mới `fetch_news_by_keyword` (R0, chỉ
  đọc) — fetch 1 feed RSS/Atom THẬT do người dùng cung cấp `sourceUrl`
  trong công việc (agent không tự đoán URL nguồn), parse bằng regex nhẹ,
  không thêm dependency mới. Đây là tool ASYNC đầu tiên trong hệ thống nên
  `executeAiTool`/`runAiToolWithAudit` (`orchestrator/aiTools.js`) và
  `runToolBatch` (`orchestrator/agentOrchestrator.js`) đã được đổi thành
  `async`/`await` (các tool đồng bộ khác không đổi hành vi). `agents/
  README.md` có thêm mục "Nguyên tắc chung cho mọi agent nghiệp vụ mới" (bắt
  buộc người duyệt cho bài đăng public/email hàng loạt/tài chính/claim y
  tế-tài chính/dữ liệu nhạy cảm/pháp lý — rút ra từ toàn bộ tài liệu Ref,
  không riêng module nào) để các agent mới trích dẫn thay vì lặp lại. Còn 8
  module (M4, M6, M7-M9, M11, M13, M14) và 1 phase cải tiến kỹ thuật lõi
  (idempotency key, mức rủi ro R4) theo roadmap ở
  `~/.Codex/plans/serialized-cuddling-swan.md`.
- Phase 8: gắn agent cho 3 module tiếp theo — `m4-digitalproduct-agent` (M4,
  Ebook/Playbook/Template), `m7-aicommerce-agent` (M7, AI Commerce cho
  brand/sản phẩm riêng), `m9-kolavatar-agent` (M9, KOL AI/Avatar AI thương
  mại). Cả 3 dùng đủ bộ tool sẵn có, không cần tool mới. M9 dùng quy ước
  lưu "character bible" (persona nhất quán) qua `create_asset` với
  `categoryId: "media"` + `note` chi tiết thay vì field riêng.
- Phase 9: gắn agent cho 4 module tiếp theo — `m8-shortvideofactory-agent`
  (M8, AI Short Video Factory cho chuyên gia - lớp compliance tài chính/sức
  khoẻ chuyên sâu nhất, dùng `add_checklist_item` để lưu từng đoạn
  highlight/timestamp), `m11-automation-agent` (M11, AI Automation/Agent
  Setup Service - dịch vụ tư vấn B2B, deliverable là SOP/thiết kế qua
  `create_asset`, không tự build/deploy hệ thống thật cho khách),
  `m13-vibecoding-agent` (M13, Vibe Coding Micro Tool/SaaS nhỏ - "PRD trước,
  code sau", không tự build code sản phẩm, bắt buộc test 5-10 người dùng
  thật trước khi thương mại hoá), `m14-academy-agent` (M14, Học viện kỹ năng
  AI - 5 "Trợ lý" giống cấu trúc M5, có ràng buộc INPUT không đưa dữ liệu
  mật/cá nhân vào AI công cộng, khuyến nghị thí điểm 1 phòng ban doanh
  nghiệp trước khi mở rộng cả 3 nhóm khách hàng). Cả 4 dùng đủ bộ tool sẵn
  có, không cần tool mới. Kiểm chứng M8 bằng task thật phát hiện 1 bug thật
  trong `truncateHistory` (`orchestrator/agentOrchestrator.js`) - khi 1 run
  cần nhiều vòng gọi tool (task có nhiều highlight/bước), cửa sổ lịch sử
  12 tin nhắn có thể đẩy trôi mất tin nhắn `user` gốc (tin chứa nội dung
  công việc thật), khiến provider LLM trả lỗi "No user query found in
  messages". Đã sửa: `truncateHistory` giờ luôn ghim `system` + tin nhắn
  `user` đầu tiên, chỉ cắt bớt phần còn lại - áp dụng cho MỌI agent, không
  riêng M8.
- Phase 10: gắn agent cho module cuối cùng còn thiếu — `m6-builder-agent`
  (M6, OPC GenZ Builder Incubator). Module này khác các module trước ở chỗ
  NHIỀU pod (2-3 người/pod) chạy song song trong CÙNG 1 board M6 - đã chốt
  kiến trúc: mọi task của 1 pod phải gắn `tags: ["pod-<tên>"]`, và
  `search_tasks` được thêm tham số `tag` mới (lọc theo đúng nhãn) để agent
  gom toàn bộ task của 1 pod trước khi tổng hợp báo cáo gate/PDCA -
  `compactTask` (`orchestrator/serverTaskOps.js`) cũng được thêm field
  `tags` vào kết quả trả về. Agent đóng vai 6 "nhân sự" Alex/Maya/Max/Kai/
  Nova/Mary theo đúng tài liệu, nhưng quyết định SCALE/CONTINUE/PIVOT/STOP
  mỗi sprint LUÔN là của con người - agent chỉ tổng hợp dữ liệu thật và đề
  xuất.
- Phase 11 (cuối roadmap Ref/*.md - toàn bộ 15 module đã có agent): cải tiến
  kỹ thuật lõi dựa `Ref/PDCA_Work_Management_AI_Spec.md`, áp dụng cho chính
  hệ thống chứ không phải 1 module kinh doanh. (1) **Idempotency**: mọi tool
  R1+ giờ kiểm tra `audit_log` (PK = `requestId`, chính là tool_call.id ổn
  định xuyên suốt 1 lần resume) TRƯỚC khi thực thi qua
  `findSuccessfulAuditLog()` (`orchestrator/auditLog.js`) - nếu requestId đã
  từng ghi thành công, trả lại đúng kết quả cũ (`idempotentReplay: true`)
  thay vì chạy lại `executeAiTool` và tạo dữ liệu trùng (double-click
  Approve, resume bị gọi lại do mạng chập chờn...). Đã test thật: gọi
  `runAiToolWithAudit('create_task', ...)` 2 lần cùng requestId chỉ tạo đúng
  1 task trong DB. (2) **Mức rủi ro R4** (`TOOL_RISK`, `aiTools.js`) - "không
  cho phép qua AI dù có duyệt": `delete_task` chuyển từ R3 → R4, bị lọc cấu
  trúc khỏi `AGENT_AVAILABLE_TOOLS` (dùng thay `AI_TOOLS` thô trong
  `agentOrchestrator.js`) nên KHÔNG agent nào - kể cả khai `allowedTools` sai
  - có thể thấy tool này; `executeAiTool` cũng chặn phòng vệ sâu nếu vẫn bị
  gọi trực tiếp. Chỉ xoá task được qua UI người dùng. (3) Đối chiếu
  `agents/ceo-orchestrator.md` với bộ test QA mục 39.1 của tài liệu, bổ sung
  1 nguyên tắc còn thiếu: chỉ báo cáo "đã tạo việc" dựa trên `taskId` thật
  `create_task` trả về, không tự nhận đã giao việc khi tool báo lỗi. Roadmap
  mở rộng nghiệp vụ theo `Ref/*.md` (Phase 7-11) coi như đã hoàn tất - xem
  `~/.Codex/plans/serialized-cuddling-swan.md` để biết chi tiết/lịch sử.
- Triển khai thực chiến (M1 làm module thí điểm đầu tiên): nối 6 tool THẬT
  gọi dịch vụ ngoài, tất cả đã test bằng dữ liệu thật (không giả lập) —
  `generate_image`/`generate_video`/`check_video_status` (R2/R2/R1, gọi cổng
  agnes có sẵn - `apihub.agnes-ai.com/v1/images/generations` và `/v1/videos`,
  model `agnes-image-2.1-flash`/`agnes-video-v2.0`; sinh video là job bất
  đồng bộ mất vài phút nên tách thành 2 tool thay vì chặn 1 lần gọi) và
  `post_to_facebook`/`post_to_tiktok`/`publish_to_wordpress` (đều R3). Ảnh/
  video sinh ra được lưu vào Google Drive thật qua service-account (KHÔNG
  dùng lại Picker cũ trong `apps/web` - Picker đó chỉ là luồng người dùng tự
  bấm chọn, scope `drive.readonly`, không dùng được cho agent tự upload) -
  xem `apps/server/src/integrations/googleDrive.js`. Cấu hình qua biến môi
  trường đọc từ file `.env` gốc (Node `--env-file-if-exists`, xem
  `.env.example`) - `GOOGLE_SERVICE_ACCOUNT_JSON`/`GOOGLE_DRIVE_FOLDER_ID`
  cho Drive, `FACEBOOK_PAGE_ID`/`FACEBOOK_PAGE_ACCESS_TOKEN`,
  `TIKTOK_ACCESS_TOKEN`, `WORDPRESS_SITE_URL`/`WORDPRESS_APP_USERNAME`/
  `WORDPRESS_APP_PASSWORD` cho 3 kênh đăng bài - thiếu biến nào thì đúng
  tool đó tự báo lỗi rõ ràng "chưa cấu hình" (đã test thật), KHÔNG bịa kết
  quả giả. Xem `~/.Codex/plans/serialized-cuddling-swan.md` (đã ghi đè cho
  phase này) để biết đầy đủ quyết định thiết kế.

## Chạy dự án

```bash
npm run dev:server    # Fastify tại http://127.0.0.1:4001 (cổng cố định)
npm run dev:web       # Vite, mặc định 5173 nhưng thường tự nhảy cổng khác
                       # nếu app OPC gốc đang chiếm 5173 - kiểm tra log Vite
npm run seed          # seed lại DB - CHỈ chạy khi data/opc.db chưa có gì
                       # (seed.js tự bỏ qua nếu bảng groups đã có dữ liệu)
```

Muốn dùng tool sinh ảnh/video/đăng bài thật (mục "Triển khai thực chiến" ở
trên): copy `.env.example` thành `.env` ở root, điền giá trị thật, rồi khởi
động lại `npm run dev:server` (script đã tự nạp `--env-file-if-exists`,
không cần thêm gì khác).

`apps/web/vite.config.js` proxy `/api/*` sang `:4001`. Không cần biến môi
trường để chạy dev; `apps/server/src/config.js` (`AI_CONFIG`) đọc key/model
LLM thật từ đó, override được qua env var nếu cần đổi model/base URL.

## Layout

```
agents/                  # Định nghĩa agent - file .md, KHÔNG lưu DB (đọc agents/README.md)
apps/web/                # Frontend, fork gần như nguyên vẹn từ ~/OPC/src
apps/server/src/
  db/                    # schema.sql, client.js (better-sqlite3 + WAL), seed.js
  orchestrator/          # aiClient.js, aiTools.js (registry tool + TOOL_RISK),
                         # agentOrchestrator.js (state machine resumable),
                         # serverTaskOps.js, auditLog.js, systemPrompt.js, transcript.js
  worker/index.js         # poll loop claim + chạy task được giao cho agent
  routes/                 # REST: structure, boards, moduleKv, tasks (granular),
                         # orchestrator (CEO), agentRuns, auditLog, stream (SSE), hrMeta
  hrMetaAgent.js           # scan định kỳ + endpoint thủ công (HR meta-agent)
  agents-loader.js         # đọc agents/*.md vào registry + hot-reload watcher
```

## Cơ chế agent (đọc kỹ trước khi thêm agent mới)

- **1 agent = 1 file `.md`** trong `agents/` (frontmatter YAML + system prompt
  dạng Markdown). Không có bảng `agent_defs`. Sửa file, lưu → server tự nạp
  lại trong ~300ms (`agents-loader.js`'s `watchAgentRegistry()`), không cần
  restart. Xem `agents/README.md` để biết đầy đủ các trường frontmatter và quy
  tắc viết agent mới.
- **Gắn agent vào 1 module** (để worker tự nhặt task giao cho nó): set
  `modules.agent_id = "<id-agent>"` trực tiếp trong DB (chưa có UI cho việc
  này) — xem cách đã làm cho M1/M2/HR-META làm mẫu (script 1 lần qua
  `better-sqlite3`).
- **Mức rủi ro tool cố định**, không cấu hình theo agent: R0/R1 tool tự chạy,
  R2/R3 phải người duyệt (`TOOL_RISK` trong `orchestrator/aiTools.js`). Agent
  chỉ giới hạn được QUA `allowedTools` trong frontmatter — không tự ý gọi tool
  ngoài danh sách đó.
- **`handoff_to_agent`** (R1): agent A gọi để bàn giao — tạo 1 task MỚI trong
  board agent B, `dependsOn` trỏ về task gốc, không sửa task hiện tại. Nếu vòng
  lặp kết thúc ngay sau khi handoff thành công, trạng thái cuối là
  `awaiting_handoff` (khác `done`).
- **HR meta-agent** (`hr-meta-agent.md` + `hrMetaAgent.js`) là loại đặc biệt —
  KHÔNG chạy qua worker's task-claim loop. Chạy theo lịch (`startHrMetaSchedule()`,
  mặc định 7 ngày, đổi qua env `HR_META_INTERVAL_MS`) hoặc kích hoạt thủ công
  `POST /api/hr-meta/run`. Đọc số liệu thật (task count/done/recent theo module
  chưa có `agent_id`), tự quyết định có đề xuất hay không qua `create_task`
  gắn `tags:["meta-proposal"]` vào board `HR-META`.

## Cơ chế duyệt R2/R3 (resumable, không dùng Promise chặn)

`agentOrchestrator.js` đã viết lại hoàn toàn so với bản gốc browser-side:
`runAgentTurn()`/`resumeAgentTurn()` trả về
`{status: 'done'|'awaiting_approval'|'error'|'max_rounds', messages,
pendingBatch, pendingToolCall, roundCount}` thay vì `await` một Promise sống
trong bộ nhớ (cách cũ chỉ chạy được khi có 1 tab trình duyệt đang mở chờ —
không sống được khi agent chạy bất đồng bộ phía server). Trạng thái tạm dừng
được serialize vào bảng `agent_runs` (`pending_tool_call_json`,
`transcript_json`) và resume qua `POST /api/tasks/:id/agent-run/resume`.

## Đồng bộ real-time & tránh race

- Mọi thao tác sửa task đi qua **endpoint granular** (`POST/PATCH/DELETE
  /api/tasks*`, `routes/tasks.js`) — KHÔNG còn whole-board PUT (đã gỡ bỏ vì
  last-write-wins clobber giữa tab người dùng và worker chạy nền).
- Frontend dùng pattern cache-cục-bộ-rồi-đồng-bộ-nền: mọi hàm trong
  `taskOperations.js` cập nhật cache lạc quan ngay lập tức (giữ nguyên chữ ký
  hàm đồng bộ cũ) rồi gọi API granular trong nền, cache được reconcile khi
  server trả về.
- **SSE** (`routes/stream.js` + `utils/liveUpdates.js`) đẩy `{moduleId}` mỗi
  khi có thay đổi (`events.js`'s `emitBoardChanged`) — frontend refresh cache
  rồi phát lại đúng `CustomEvent('opc-data-changed')` mà `dataBus.js` đã dùng
  từ trước, nên `Board.jsx`/`RightSidebarPanel.jsx` không cần sửa gì. Polling
  4s trong `Board.jsx` vẫn giữ làm fallback nếu SSE rớt kết nối.

## Khoảng trống đã biết (chưa làm, không phải bug)

- `ChatPage.jsx` không streaming token-by-token nữa (đổi đánh đổi có chủ đích
  khi nối sang server — xem plan Phase 5 §2): `POST /api/orchestrator/command`
  chặn đồng bộ, trả kết quả 1 lần, không có `onDelta`. UI chỉ hiện "đang xử
  lý…" rồi render trọn nội dung + tool activity khi response về.
- Trang Settings vẫn cho đổi model/temperature/baseUrl cho tính năng
  `aiTaskGenerator.js`, nhưng KHÔNG còn ảnh hưởng Chat AI (Chat giờ luôn dùng
  model/temperature của `agents/ceo-orchestrator.md` qua server).
- Auth chỉ là 1 mật khẩu chung cho 1 người dùng nội bộ (`APP_PASSWORD` trong
  `apps/server/src/config.js`, mặc định `change-me-opc-agent-ops` — PHẢI đổi
  qua env var trước khi dùng thật), cookie session lưu trong bảng
  `auth_sessions`. Không có multi-user/role.
- `update_asset`/`update_kpi_result` (R2) dừng ở `awaiting_approval`, duyệt
  qua `AgentRunPanel` trên thẻ task — giống hệt cơ chế duyệt task fields sẵn
  có, không có UI riêng.

## Việc editorial trên app gốc `~/OPC`

Trước khi tách sang project này, phiên làm việc cũng sửa một loạt bug/feature
UI trên app OPC gốc (không liên quan tới agent-ops): thẻ Kanban thu gọn giữ mã
module + priority tag, sửa CSS hero/box đè nhau ở Overview, tách màu nền panel
"BẢNG QUẢN LÝ TIẾN ĐỘ" khỏi nền trang module, gọn lại giao diện lịch ngày/tuần
+ viết tắt "Chủ Nhật"→"CN", cho phép sửa/thêm Case Study (kèm field Rule/
Memory/Skill), responsive KPI/Tài sản/Tài chính giống Project Plan, tích hợp
Google Drive (link thủ công + Picker thật). Những thay đổi này nằm trong
`~/OPC`, không phải trong repo này.
