// ============================================================
//  HỆ THỐNG EXP & LEVEL VÔ HẠN
//  Level N cần tổng: sum(100 * i * 1.15^i) với i từ 1 đến N
//  Càng lên cao càng cần nhiều EXP hơn (prestige style)
// ============================================================

// EXP cần để lên từ level N lên level N+1
export function expToNextLevel(level) {
  return Math.floor(100 * (level + 1) * Math.pow(1.15, level + 1));
}

// Tổng EXP cần để đạt level N (tính từ 0)
export function totalExpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) {
    total += expToNextLevel(i);
  }
  return total;
}

// Tính level và EXP hiện tại từ tổng EXP tích lũy
export function calcLevelFromExp(totalExp) {
  let level = 0;
  let remaining = totalExp;
  while (true) {
    const needed = expToNextLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return {
    level,
    currentExp: remaining,
    expNeeded: expToNextLevel(level),
    percent: Math.floor((remaining / expToNextLevel(level)) * 100),
  };
}

// Tên danh hiệu theo prestige (mỗi 10 level = 1 prestige)
export function getLevelTitle(level) {
  const prestige = Math.floor(level / 10);
  const titles = [
    'Tập Sự', 'Học Sinh', 'Học Giả', 'Thạc Sĩ',
    'Tiến Sĩ', 'Giáo Sư', 'Huyền Thoại', 'Bất Tử',
    'Thần Nhân', 'Siêu Việt',
  ];
  const titleName = titles[Math.min(prestige, titles.length - 1)];
  return prestige >= titles.length
    ? `👑 Vượt Giới Hạn Lv.${level}`
    : `${titleName} Lv.${level}`;
}

// Màu badge theo prestige
export function getLevelColor(level) {
  const prestige = Math.floor(level / 10);
  const colors = [
    'from-gray-400 to-gray-500',       // 0-9
    'from-green-400 to-green-600',     // 10-19
    'from-blue-400 to-blue-600',       // 20-29
    'from-purple-400 to-purple-600',   // 30-39
    'from-yellow-400 to-orange-500',   // 40-49
    'from-red-400 to-red-600',         // 50-59
    'from-pink-400 to-rose-600',       // 60-69
    'from-cyan-400 to-teal-600',       // 70-79
    'from-indigo-400 to-violet-600',   // 80-89
    'from-amber-300 to-yellow-500',    // 90-99
  ];
  return colors[Math.min(prestige, colors.length - 1)];
}

// EXP nhận được theo từng hành động
export const EXP_REWARDS = {
  FLASHCARD_CORRECT: 5,    // Mỗi câu đúng trong Flashcard
  QUIZ_CORRECT: 8,         // Mỗi câu đúng trong Quiz/Test
  CHALLENGE_WIN: 50,       // Thắng trận Thách Đấu (điểm cao nhất)
  DAILY_COMPLETE: 30,      // Hoàn thành session học trong ngày
};