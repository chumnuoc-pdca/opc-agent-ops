import React, { useEffect, useState, useCallback } from 'react';
import { Play, Square, Clock } from 'lucide-react';
import {
  getActivePersonnelId, startTimer, stopTimer, fetchTaskTimeEntries, formatMinutes, formatElapsed
} from '../utils/timeTrackingOperations';
import { onDataChanged } from '../utils/dataBus';

const formatEntryWhen = (ts) => new Date(ts).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

// Section "Theo dõi thời gian" trong TaskModal - độc lập với nút Lưu thay
// đổi của form (Start/Stop tác động ngay lập tức, giống AgentRunPanel).
// Chỉ dùng ở mode='edit' (cần taskId thật đã lưu).
export default function TimeTrackingSection({ task, actualMinutes: initialActualMinutes }) {
  const [entries, setEntries] = useState([]);
  const [personnelId, setPersonnelId] = useState(() => getActivePersonnelId());
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);

  const loadEntries = useCallback(() => {
    fetchTaskTimeEntries(task.id).then(setEntries).catch(() => {});
  }, [task.id]);

  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => onDataChanged((moduleId) => { if (moduleId === task.moduleId) loadEntries(); }), [loadEntries, task.moduleId]);

  const activeEntry = entries.find(e => !e.endedAt && e.personnelId === personnelId);

  // Tự tính tổng từ chính danh sách entries (đã refresh qua onDataChanged)
  // thay vì tin vào prop `actualMinutes` chụp lúc mở modal - nếu không, tổng
  // hiển thị sẽ đứng yên sau khi Stop dù danh sách bên dưới đã cập nhật
  // (phát hiện qua kiểm thử Playwright thật, không phải suy đoán).
  const finishedSeconds = entries.reduce((sum, e) => sum + (e.endedAt ? (e.durationSeconds || 0) : 0), 0);
  const liveSeconds = activeEntry ? Math.max(0, Math.floor((Date.now() - activeEntry.startedAt) / 1000)) : 0;
  const totalMinutes = entries.length > 0
    ? Math.round((finishedSeconds + liveSeconds) / 60)
    : (initialActualMinutes || 0);

  useEffect(() => {
    if (!activeEntry) return undefined;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeEntry]);

  const handleStart = async () => {
    const id = getActivePersonnelId();
    if (!id) {
      alert('Chọn "Bạn là ai?" ở thanh theo dõi thời gian trên đầu trang trước khi bắt đầu.');
      return;
    }
    setPersonnelId(id);
    setBusy(true);
    try {
      await startTimer(task.id, id);
      loadEntries();
    } catch (err) {
      alert(err.message || 'Không bắt đầu được phiên theo dõi thời gian.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await stopTimer(personnelId);
      loadEntries();
    } catch (err) {
      alert(err.message || 'Không dừng được phiên theo dõi thời gian.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-field time-tracking-section">
      <label>Theo dõi thời gian</label>
      <div className="time-tracking-summary">
        <span className="time-tracking-total"><Clock size={13} /> Đã làm: <strong>{formatMinutes(totalMinutes)}</strong></span>
        {activeEntry ? (
          <button type="button" className="time-tracking-btn stop" disabled={busy} onClick={handleStop}>
            <Square size={13} /> Dừng ({formatElapsed(activeEntry.startedAt)})
          </button>
        ) : (
          <button type="button" className="time-tracking-btn start" disabled={busy} onClick={handleStart}>
            <Play size={13} /> Bắt đầu
          </button>
        )}
      </div>
      {entries.length > 0 && (
        <ul className="time-tracking-entries">
          {entries.slice(0, 8).map(e => (
            <li key={e.id}>
              <span className="time-tracking-entry-person">{e.personnelName}</span>
              <span className="time-tracking-entry-when">{formatEntryWhen(e.startedAt)}</span>
              <span className="time-tracking-entry-duration">
                {e.endedAt ? formatMinutes(Math.round((e.durationSeconds || 0) / 60)) : 'Đang chạy...'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
