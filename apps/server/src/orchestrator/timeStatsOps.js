// Phase 16: thống kê thời gian thật từ time_entries (Phase 12) - tổng theo
// nhóm/module/task/ngày, phục vụ trang Dashboard thời gian. Đọc-only, không
// ghi gì cả.
import { db } from '../db/client.js';

// Ngày theo giờ máy chủ (app chỉ vận hành 1 múi giờ - xem timeBlockOps.js
// cùng lý do), KHÔNG dùng SQLite's date()/unixepoch vì hàm đó quy đổi UTC,
// lệch với cách tính "ngày" ở mọi nơi khác trong app (đều dùng Date cục bộ).
const localDateISO = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toMinutes = (seconds) => Math.round((seconds || 0) / 60);

const BASE_JOIN = `
  FROM time_entries te
  JOIN tasks t ON t.id = te.task_id
  JOIN modules m ON m.id = t.module_id
  JOIN groups g ON g.id = m.group_id
  WHERE te.ended_at IS NOT NULL AND te.started_at >= @from AND te.started_at < @to
`;

export const getTimeStats = ({ fromMs, toMs, groupId }) => {
  const params = { from: fromMs, to: toMs };
  const groupFilter = groupId ? ' AND g.id = @groupId' : '';
  if (groupId) params.groupId = groupId;

  const totalRow = db.prepare(`SELECT COALESCE(SUM(te.duration_seconds), 0) AS totalSeconds ${BASE_JOIN}${groupFilter}`).get(params);

  const byGroup = db.prepare(`
    SELECT g.id AS groupId, g.title AS groupTitle, SUM(te.duration_seconds) AS totalSeconds
    ${BASE_JOIN}${groupFilter}
    GROUP BY g.id ORDER BY totalSeconds DESC
  `).all(params);

  const byModule = db.prepare(`
    SELECT m.id AS moduleId, m.code AS moduleCode, m.title AS moduleTitle, g.title AS groupTitle,
           SUM(te.duration_seconds) AS totalSeconds
    ${BASE_JOIN}${groupFilter}
    GROUP BY m.id ORDER BY totalSeconds DESC LIMIT 12
  `).all(params);

  const byTask = db.prepare(`
    SELECT t.id AS taskId, t.code AS code, t.content AS content, t.estimate_minutes AS estimateMinutes,
           m.code AS moduleCode, SUM(te.duration_seconds) AS totalSeconds
    ${BASE_JOIN}${groupFilter}
    GROUP BY t.id ORDER BY totalSeconds DESC LIMIT 15
  `).all(params);

  const rawEntries = db.prepare(`SELECT te.started_at AS startedAt, te.duration_seconds AS durationSeconds ${BASE_JOIN}${groupFilter}`).all(params);
  const byDayMap = new Map();
  rawEntries.forEach((r) => {
    const day = localDateISO(r.startedAt);
    byDayMap.set(day, (byDayMap.get(day) || 0) + (r.durationSeconds || 0));
  });
  const byDay = Array.from(byDayMap.entries())
    .map(([date, totalSeconds]) => ({ date, totalMinutes: toMinutes(totalSeconds) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // So sánh kế hoạch (estimate_minutes) vs thực tế (actual_minutes cache) -
  // chỉ tính task ĐÃ đặt estimate, tránh so sánh lệch nghĩa với task chưa
  // ước lượng bao giờ (actual > 0 không có nghĩa "trễ" nếu chưa từng ước lượng).
  const estimateFilter = groupId ? ' AND m.group_id = @groupId' : '';
  const estimateParams = groupId ? { groupId } : {};
  const estimateRow = db.prepare(`
    SELECT COALESCE(SUM(t.estimate_minutes), 0) AS totalEstimate, COALESCE(SUM(t.actual_minutes), 0) AS totalActual,
           COUNT(*) AS taskCount
    FROM tasks t JOIN modules m ON m.id = t.module_id
    WHERE t.estimate_minutes IS NOT NULL AND t.archived = 0 ${estimateFilter}
  `).get(estimateParams);

  return {
    totalMinutes: toMinutes(totalRow?.totalSeconds),
    byGroup: byGroup.map((r) => ({ groupId: r.groupId, groupTitle: r.groupTitle, totalMinutes: toMinutes(r.totalSeconds) })),
    byModule: byModule.map((r) => ({
      moduleId: r.moduleId, moduleCode: r.moduleCode, moduleTitle: r.moduleTitle, groupTitle: r.groupTitle,
      totalMinutes: toMinutes(r.totalSeconds)
    })),
    byTask: byTask.map((r) => ({
      taskId: r.taskId, code: r.code, content: r.content, moduleCode: r.moduleCode,
      estimateMinutes: r.estimateMinutes ?? null, totalMinutes: toMinutes(r.totalSeconds)
    })),
    byDay,
    estimateVsActual: {
      estimateMinutes: estimateRow?.totalEstimate || 0,
      actualMinutes: estimateRow?.totalActual || 0,
      taskCount: estimateRow?.taskCount || 0
    }
  };
};
