import React, { useState, useEffect, useRef } from 'react';
import { ref, get, set } from 'firebase/database';
import { database } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { ArrowLeft, TrendingUp, Calendar, Users, Trophy, RotateCcw, Trash2 } from 'lucide-react';
import { Typewriter } from './ui/typewriter-text';

const AttendanceStats = ({ onBack }) => {
  const [statsData, setStatsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trophyPosition, setTrophyPosition] = useState({ left: '50%', top: '10px' });
  const chartContainerRef = useRef(null);

  useEffect(() => {
    fetchAttendanceStats();
  }, []);

  // 첫 번째 바의 정확한 위치 계산 (참가일수가 같은 유저가 없을 때만)
  useEffect(() => {
    if (statsData.length > 0 && chartContainerRef.current) {
      // 참가일수가 같은 유저가 복수 존재하는지 확인
      const firstUserJoinCount = statsData[0].joinCount;
      const sameCountUsers = statsData.filter(user => user.joinCount === firstUserJoinCount);
      const hasMultipleTopUsers = sameCountUsers.length > 1;

      // 참가일수가 같은 유저가 복수 존재하면 트로피 위치 계산 안 함
      if (hasMultipleTopUsers) {
        return;
      }

      const calculateTrophyPosition = () => {
        const container = chartContainerRef.current;
        if (!container) return;

        // recharts가 렌더링한 첫 번째 바 요소 찾기 (금색 바)
        // 여러 방법으로 시도: fill 속성, 첫 번째 rect 요소 등
        let firstBar = container.querySelector('rect[fill="#fbbf24"]');
        
        // 금색 바를 찾지 못한 경우, 모든 rect 요소 중 첫 번째를 찾기
        if (!firstBar) {
          const allBars = container.querySelectorAll('rect[class*="recharts-bar-rectangle"], rect[fill="#10b981"]');
          // 첫 번째 바는 금색이어야 하는데, 아직 렌더링되지 않았을 수 있으므로
          // 첫 번째 rect 요소를 찾기
          const rects = container.querySelectorAll('rect');
          // recharts의 바는 일반적으로 특정 클래스를 가지거나 특정 구조를 가짐
          for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const fill = rect.getAttribute('fill');
            // 금색 바이거나, 첫 번째 바일 가능성이 높은 요소 찾기
            if (fill === '#fbbf24' || (i === 0 && fill && fill !== 'none')) {
              firstBar = rect;
              break;
            }
          }
        }
        
        if (firstBar) {
          const barRect = firstBar.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          // 첫 번째 바의 중앙 위치 계산 (컨테이너 기준)
          const barCenterX = barRect.left + barRect.width / 2 - containerRect.left;
          const leftPercent = (barCenterX / containerRect.width) * 100;
          
          // 바의 상단 위치 계산 (그래프바의 정중앙 상단에 위치하도록)
          const barTop = barRect.top - containerRect.top;
          // 트로피 아이콘 크기를 고려하여 바 상단에서 약간 위에 배치
          // 스마트폰에서는 작은 아이콘(32px), 데스크톱에서는 큰 아이콘(40px)
          const isMobile = window.innerWidth < 640;
          const trophySize = isMobile ? 32 : 40;
          const topPosition = Math.max(barTop - trophySize - 10, 5);
          
          setTrophyPosition({
            left: `${leftPercent}%`,
            top: `${topPosition}px`
          });
        } else {
          // 바가 아직 렌더링되지 않은 경우, 약간의 지연 후 다시 시도
          setTimeout(calculateTrophyPosition, 100);
        }
      };

      // 차트가 렌더링된 후 위치 계산 (스마트폰에서도 정확하게 계산되도록 지연 시간 증가)
      setTimeout(calculateTrophyPosition, 500);
      
      // 윈도우 리사이즈 시 위치 재계산
      window.addEventListener('resize', calculateTrophyPosition);
      return () => window.removeEventListener('resize', calculateTrophyPosition);
    }
  }, [statsData]);

  const fetchAttendanceStats = async () => {
    try {
      setLoading(true);
      const attendanceRef = ref(database, 'attendance');
      const snapshot = await get(attendanceRef);

      if (!snapshot.exists()) {
        setStatsData([]);
        setLoading(false);
        return;
      }

      const attendanceData = snapshot.val();
      const userStats = {};

      // 모든 날짜의 참가 데이터를 순회하며 유저별 참가일수 계산
      Object.keys(attendanceData).forEach(dateKey => {
        const dateData = attendanceData[dateKey];
        if (dateData && dateData.participants && Array.isArray(dateData.participants)) {
          dateData.participants.forEach(participant => {
            if (participant.nickname && participant.status === 'join') {
              if (!userStats[participant.nickname]) {
                userStats[participant.nickname] = {
                  nickname: participant.nickname,
                  joinCount: 0
                };
              }
              userStats[participant.nickname].joinCount++;
            }
          });
        }
      });

      // 배열로 변환하고 참가일수 기준으로 정렬
      const statsArray = Object.values(userStats)
        .sort((a, b) => b.joinCount - a.joinCount)
        .slice(0, 20); // 상위 20명만 표시

      setStatsData(statsArray);
    } catch (error) {
      console.error('統計データ取得失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  // 사용자별 참여 기록 리셋 함수
  const resetUserRecords = async (targetNickname) => {
    if (!targetNickname) {
      alert('ユーザー名が指定されていません。');
      return;
    }

    if (!confirm(`${targetNickname}さんの参加記録をすべてリセットしますか？\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      const attendanceRef = ref(database, 'attendance');
      const allAttendanceSnapshot = await get(attendanceRef);
      
      if (!allAttendanceSnapshot.exists()) {
        alert('参加記録が見つかりませんでした。');
        return;
      }

      const attendanceData = allAttendanceSnapshot.val();
      const updates = {};
      
      // 모든 날짜에서 해당 닉네임 제거
      Object.keys(attendanceData).forEach(dateKey => {
        const dateData = attendanceData[dateKey];
        if (dateData && dateData.participants && Array.isArray(dateData.participants)) {
          const filteredParticipants = dateData.participants.filter(
            p => p.nickname !== targetNickname
          );
          
          if (filteredParticipants.length !== dateData.participants.length) {
            updates[`attendance/${dateKey}/participants`] = filteredParticipants;
          }
        }
      });
      
      // 여러 날짜 동시 업데이트
      if (Object.keys(updates).length > 0) {
        await Promise.all(
          Object.entries(updates).map(([path, value]) => {
            const pathRef = ref(database, path);
            return set(pathRef, value);
          })
        );
        alert(`${targetNickname}さんの参加記録をリセットしました。`);
        // 통계 데이터 다시 가져오기
        await fetchAttendanceStats();
      } else {
        alert(`${targetNickname}さんの参加記録が見つかりませんでした。`);
      }
    } catch (error) {
      console.error('参加記録リセット失敗:', error);
      alert('参加記録のリセット中にエラーが発生しました。');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl shadow-lg border-b border-white/20 px-3 sm:px-4 py-3 sm:py-4 md:py-5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={onBack}
              className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white/90 hover:bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              <ArrowLeft size={18} className="sm:w-[20px] sm:h-[20px] text-gray-600 group-hover:text-emerald-600 transition-colors" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                <Typewriter
                  text={["The Most Passionate Player"]}
                  speed={100}
                  loop={true}
                  className="text-lg sm:text-xl md:text-2xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent"
                />
              </h1>
              <p className="text-gray-600 text-xs sm:text-sm font-medium mt-0.5">
                ユーザーごとの参加記録
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        {statsData.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/20 p-8 sm:p-10 md:p-12 text-center">
            <div className="text-4xl sm:text-5xl mb-4">📊</div>
            <p className="text-gray-600 text-sm sm:text-base font-medium">
              まだ参加データがありません。
            </p>
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/20 p-4 sm:p-6 md:p-8">
              <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
                <span className="w-1 h-4 sm:h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></span>
                ユーザーごとの参加記録
              </h2>
              <div className="w-full relative" style={{ height: '400px' }} ref={chartContainerRef}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData} margin={{ top: 50, right: 20, left: 0, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="nickname" 
                      angle={-45}
                      textAnchor="end"
                      height={120}
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      label={{ value: '参加日数', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        padding: '8px'
                      }}
                    />
                    <Bar dataKey="joinCount" name="参加日数" radius={[8, 8, 0, 0]}>
                      {statsData.map((entry, index) => {
                        // 참가일수가 같은 유저가 복수 존재하는지 확인
                        const firstUserJoinCount = statsData[0].joinCount;
                        const sameCountUsers = statsData.filter(user => user.joinCount === firstUserJoinCount);
                        const hasMultipleTopUsers = sameCountUsers.length > 1;
                        
                        // 참가일수가 같은 유저가 복수 존재하면 모든 바를 기본 색상으로
                        const fillColor = (index === 0 && !hasMultipleTopUsers) ? '#fbbf24' : '#10b981';
                        
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={fillColor} 
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* 트로피 - 첫 번째 유저(1위) 바 상단 중앙에 배치 (참가일수가 같은 유저가 없을 때만) */}
                {statsData.length > 0 && (() => {
                  // 참가일수가 같은 유저가 복수 존재하는지 확인
                  const firstUserJoinCount = statsData[0].joinCount;
                  const sameCountUsers = statsData.filter(user => user.joinCount === firstUserJoinCount);
                  const hasMultipleTopUsers = sameCountUsers.length > 1;
                  
                  // 참가일수가 같은 유저가 복수 존재하면 트로피 표시 안 함
                  if (hasMultipleTopUsers) {
                    return null;
                  }
                  
                  return (
                    <div 
                      className="absolute flex justify-center z-10"
                      style={{ 
                        top: trophyPosition.top,
                        left: trophyPosition.left,
                        transform: 'translateX(-50%)',
                        pointerEvents: 'none'
                      }}
                    >
                      <div className="animate-bounce">
                        <Trophy 
                          size={40} 
                          className="text-yellow-500 sm:w-[40px] sm:h-[40px] w-[32px] h-[32px]" 
                          fill="#fbbf24"
                          style={{ 
                            filter: 'drop-shadow(0 4px 8px rgba(251, 191, 36, 0.4))',
                            animation: 'bounce 1s infinite'
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6 sm:mt-8">
              <div className="bg-gradient-to-br from-yellow-500 to-amber-500 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-white shadow-lg">
                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                  <Trophy size={20} className="sm:w-[22px] sm:h-[22px]" fill="white" />
                  <span className="text-xs sm:text-sm font-semibold">The Most Passionate Player</span>
                </div>
                <div className="text-lg sm:text-xl md:text-2xl font-extrabold truncate">
                  {statsData.length > 0 ? statsData[0].nickname : '-'}
                </div>
                <div className="text-xs sm:text-sm mt-1 opacity-90">
                  {statsData.length > 0 ? `${statsData[0].joinCount}日参加` : ''}
                </div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-white shadow-lg">
                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                  <Users size={20} className="sm:w-[22px] sm:h-[22px]" />
                  <span className="text-xs sm:text-sm font-semibold">プレイヤー数</span>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold">{statsData.length}名</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-white shadow-lg">
                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                  <Calendar size={20} className="sm:w-[22px] sm:h-[22px]" />
                  <span className="text-xs sm:text-sm font-semibold">平均参加日数</span>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold">
                  {statsData.length > 0 
                    ? Math.round((statsData.reduce((sum, user) => sum + user.joinCount, 0) / statsData.length) * 10) / 10
                    : 0}日
                </div>
              </div>
            </div>

            {/* User List with Reset Button */}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/20 p-4 sm:p-6 md:p-8 mt-6 sm:mt-8">
              <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2">
                <span className="w-1 h-4 sm:h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></span>
                ユーザーごとの参加記録管理
              </h2>
              <div className="space-y-2 sm:space-y-3">
                {statsData.map((user, index) => (
                  <div
                    key={user.nickname}
                    className="flex items-center justify-between p-3 sm:p-4 bg-gray-50/80 hover:bg-gray-100 border border-gray-200 rounded-xl sm:rounded-2xl transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl font-bold text-sm sm:text-base ${
                        index === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm sm:text-base text-gray-800 truncate">
                          {user.nickname}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-500">
                          {user.joinCount}日参加
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => resetUserRecords(user.nickname)}
                      className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg sm:rounded-xl text-red-600 hover:text-red-700 transition-all duration-200 transform hover:scale-105 active:scale-95"
                      title={`${user.nickname}さんの参加記録をリセット`}
                    >
                      <Trash2 size={14} className="sm:w-[16px] sm:h-[16px]" />
                      <span className="text-xs sm:text-sm font-semibold hidden sm:inline">リセット</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceStats;

