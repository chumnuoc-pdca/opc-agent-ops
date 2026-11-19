import React, { useEffect, useState, useCallback } from 'react';
import { Timer, Square, User } from 'lucide-react';
import { getPersonnel } from '../utils/personnelStorage';
import {
  getActivePersonnelId, setActivePersonnelId, fetchActiveEntry, stopTimer, formatElapsed
} from '../utils/timeTrackingOperations';
import { onDataChanged } from '../utils/dataBus';

// Thanh trạng thái toàn cục "đang làm việc gì" (TIME-04 trong spec tham
// khảo) - luôn hiện ở mọi trang, không phụ thuộc đang mở module/task nào.
// Gắn theo personnel_id vì app chỉ có 1 mật khẩu chung, không có tài khoản
// người dùng thật (xem plan Phase 12) - người dùng chọn 1 lần "Bạn là ai",
// lưu localStorage, dùng lại cho các lần Start sau.
export default function ActiveTimerBar({ onJumpToModule }) {
  const [personnelId, setPersonnelId] = useState(() => getActivePersonnelId());
  const [activeInfo, setActiveInfo] = useState(null); // { activeEntry, task, module } | null
  // Không đọc trực tiếp - chỉ dùng để ép re-render mỗi giây, formatElapsed
  // tự tính lại theo Date.now() ngay trong lần render đó.
  const [, forceTick] = useState(0);
  const humans = getPersonnel().filter(p => p.type === 'human');

  const refresh = useCallback((id) => {
    if (!id) { setActiveInfo(null); return; }
    fetchActiveEntry(id).then(setActiveInfo).catch(() => {});
  }, []);

  useEffect(() => { refresh(personnelId); }, [personnelId, refresh]);

  // Đồng bộ khi có thay đổi từ nơi khác (start/stop ở Board.jsx/TaskModal,
  // hoặc thiết bị/tab khác) - tái dùng bus opc-data-changed đã có sẵn thay vì
  // dựng riêng 1 kênh mới cho time tracking.
  useEffect(() => onDataChanged(() => refresh(personnelId)), [personnelId, refresh]);

  // Poll dự phòng mỗi 20s (giống pattern polling fallback đã dùng ở Board.jsx)
  // - phòng trường hợp bus không bắt được thay đổi từ thiết bị khác.
  useEffect(() => {
    const id = setInterval(() => refresh(personnelId), 20000);
    return () => clearInterval(id);
  }, [personnelId, refresh]);

  useEffect(() => {
    if (!activeInfo?.activeEntry) return undefined;
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [activeInfo?.activeEntry]);

  const handlePersonnelChange = (e) => {
    const id = e.target.value;
    setActivePersonnelId(id);
    setPersonnelId(id);
  };

  const handleStop = async () => {
    if (!personnelId) return;
    try {
      await stopTimer(personnelId);
      refresh(personnelId);
    } catch (err) {
      alert(err.message || 'Không dừng được phiên theo dõi thời gian.');
    }
  };

  const running = activeInfo?.activeEntry && activeInfo?.task;

  return (
    <div className={`active-timer-bar ${running ? 'is-running' : ''}`}>
      <div className="active-timer-bar-who">
        <User size={14} />
        <select value={personnelId} onChange={handlePersonnelChange}>
          <option value="">Bạn là ai?</option>
          {humans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {running ? (
        <button
          type="button"
          className="active-timer-bar-task"
          onClick={() => onJumpToModule && activeInfo.module && onJumpToModule({ id: activeInfo.module.id })}
          title="Mở module chứa công việc này"
        >
          <Timer size={14} className="active-timer-bar-pulse" />
          <span className="active-timer-bar-content">{activeInfo.task.content}</span>
          {activeInfo.module && <span className="active-timer-bar-module">{activeInfo.module.code}</span>}
          <span className="active-timer-bar-elapsed">{formatElapsed(activeInfo.activeEntry.startedAt)}</span>
        </button>
      ) : (
        personnelId && <span className="active-timer-bar-idle">Chưa theo dõi công việc nào - bấm nút bắt đầu trên 1 thẻ.</span>
      )}

      {running && (
        <button type="button" className="active-timer-bar-stop" onClick={handleStop} title="Dừng theo dõi">
          <Square size={13} /> Dừng
        </button>
      )}
    </div>
  );
}
