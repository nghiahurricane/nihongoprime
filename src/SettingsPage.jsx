import React from 'react';

function SettingsPage({
  bgmVolume = 0.3,
  sfxVolume = 0.8,
  onBgmVolumeChange,
  onSfxVolumeChange,
  studySessionWordCount = 10,
  reviewSessionWordCount = 10,
  onStudySessionWordCountChange,
  onReviewSessionWordCountChange,
  studySessionOptions = [10, 20, 30],
  reviewSessionOptions = [10, 30, 50, 100]
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2">⚙️ Cài Đặt</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Tùy chỉnh âm thanh và số từ cho từng phiên học.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-5 flex items-center gap-2">🔊 Âm Thanh</h3>
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="settings-bgm-volume" className="font-bold text-gray-700 dark:text-gray-200">🎵 Nhạc nền (BGM)</label>
              <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{Math.round(bgmVolume * 100)}%</span>
            </div>
            <input
              id="settings-bgm-volume"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(bgmVolume * 100)}
              onChange={(e) => onBgmVolumeChange?.(Number(e.target.value) / 100)}
              className="w-full accent-indigo-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="settings-sfx-volume" className="font-bold text-gray-700 dark:text-gray-200">✅ SFX</label>
              <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{Math.round(sfxVolume * 100)}%</span>
            </div>
            <input
              id="settings-sfx-volume"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(sfxVolume * 100)}
              onChange={(e) => onSfxVolumeChange?.(Number(e.target.value) / 100)}
              className="w-full accent-indigo-600"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-5 flex items-center gap-2">📚 Phiên Học</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
            <label htmlFor="settings-study-session-size" className="block font-bold text-indigo-700 dark:text-indigo-300 mb-2">Số từ / phiên học</label>
            <select
              id="settings-study-session-size"
              value={studySessionWordCount}
              onChange={(e) => onStudySessionWordCountChange?.(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border-2 border-indigo-200 dark:border-indigo-700 rounded-xl px-3 py-2 font-bold text-indigo-700 dark:text-indigo-300 outline-none"
            >
              {studySessionOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <p className="text-xs text-indigo-500 dark:text-indigo-300 mt-2">Mức cho học mới/từ khó/học tự do: 10, 20, 30.</p>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4">
            <label htmlFor="settings-review-session-size" className="block font-bold text-green-700 dark:text-green-300 mb-2">Số từ / phiên ôn tập</label>
            <select
              id="settings-review-session-size"
              value={reviewSessionWordCount}
              onChange={(e) => onReviewSessionWordCountChange?.(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border-2 border-green-200 dark:border-green-700 rounded-xl px-3 py-2 font-bold text-green-700 dark:text-green-300 outline-none"
            >
              {reviewSessionOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <p className="text-xs text-green-500 dark:text-green-300 mt-2">Mức ôn tập: 10, 30, 50, 100.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
