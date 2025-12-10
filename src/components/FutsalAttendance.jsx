import React, { useState, useEffect } from 'react';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '../firebase';
import { Cloud, CloudRain, Wind, AlertTriangle, Users, Clock, UserCircle, Pencil, CheckCircle2, XCircle, Target, AlertCircle, Flame } from 'lucide-react';
import { Typewriter } from './ui/typewriter-text';

const FutsalAttendance = () => {

  const [nickname, setNickname] = useState('');

  const [isRegistered, setIsRegistered] = useState(false);

  const [myStatus, setMyStatus] = useState('none');

  const [participants, setParticipants] = useState([]);

  const [weather, setWeather] = useState({ condition: 'clear', temp: 18 });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentDateKey, setCurrentDateKey] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  });

  const [inputNickname, setInputNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  // 오늘 날짜 키 생성 (YYYY-MM-DD 형식)
  const getTodayKey = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  };

  // 고유 사용자 ID 가져오기 또는 생성
  const getOrCreateUserId = () => {
    let userId = localStorage.getItem('futsalUserId');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('futsalUserId', userId);
    }
    return userId;
  };

  useEffect(() => {
    // 닉네임 확인
    const storedNickname = localStorage.getItem('futsalNickname');
    if (storedNickname) {
      setNickname(storedNickname);
      setIsRegistered(true);
    }

    // 실시간 시간 업데이트 (1초마다)
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // 날짜가 바뀌었는지 확인
      const newDateKey = now.toISOString().split('T')[0];
      if (newDateKey !== currentDateKey) {
        setCurrentDateKey(newDateKey);
      }
      
      // 자정(00:00:00)에 자동 리셋
      const hour = now.getHours();
      const minute = now.getMinutes();
      const second = now.getSeconds();
      if (hour === 0 && minute === 0 && second === 0) {
        resetTodayAttendance();
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [currentDateKey]);

  // 날짜가 바뀔 때마다 자동 리셋 및 Firebase 리스너 재설정
  useEffect(() => {
    const todayKey = getTodayKey();
    
    // 날짜가 바뀌었을 때 자동 리셋 (자정 이후)
    const lastResetDate = localStorage.getItem('lastAutoResetDate');
    if (lastResetDate !== todayKey) {
      resetTodayAttendance(true); // 자동 리셋 (알림 없음)
      localStorage.setItem('lastAutoResetDate', todayKey);
    }
    
    const attendanceRef = ref(database, `attendance/${todayKey}`);

    // 실시간 리스너 연결
    const unsubscribe = onValue(attendanceRef, (snapshot) => {
      const data = snapshot.val();
      const currentNickname = localStorage.getItem('futsalNickname'); // 현재 닉네임 가져오기
      
      if (data && data.participants) {
        setParticipants(data.participants || []);
        
        // 내 상태 업데이트
        if (currentNickname) {
          const myData = data.participants.find(p => p.nickname === currentNickname);
          if (myData) {
            setMyStatus(myData.status);
          } else {
            setMyStatus('none');
          }
        }
      } else {
        // 데이터가 없으면 빈 배열
        setParticipants([]);
        if (currentNickname) {
          setMyStatus('none');
        }
      }
    }, (error) => {
      console.error('Firebaseリアルタイム更新エラー:', error);
    });

    return () => {
      unsubscribe(); // Firebase 리스너 제거
    };
  }, [currentDateKey]);


  const handleRegister = async () => {
    const trimmedNickname = inputNickname.trim();
    
    if (!trimmedNickname) {
      setNicknameError('ニックネームを入力してください。');
      return;
    }

    // 닉네임 길이 검증 (10글자 제한)
    if (trimmedNickname.length > 10) {
      setNicknameError('ニックネームは最大10文字まで入力可能です。');
      return;
    }

    // 에러 메시지 초기화
    setNicknameError('');

    try {
      const userId = getOrCreateUserId();
      
      // Firebase에서 모든 날짜의 참가자 목록 가져오기
      const attendanceRef = ref(database, 'attendance');
      const snapshot = await get(attendanceRef);
      
      const allNicknames = new Set();
      let previousNickname = null;
      let previousStatus = null;
      let previousTime = null;
      
      if (snapshot.exists()) {
        const attendanceData = snapshot.val();
        
        // 사용자 매핑 확인
        const userMappingRef = ref(database, `userMappings/${userId}`);
        const userMappingSnapshot = await get(userMappingRef);
        
        if (userMappingSnapshot.exists()) {
          previousNickname = userMappingSnapshot.val().nickname;
        }
        
        // 모든 날짜의 참가자 목록을 순회하며 닉네임 수집 및 이전 닉네임 찾기
        Object.keys(attendanceData).forEach(dateKey => {
          const dateData = attendanceData[dateKey];
          if (dateData && dateData.participants && Array.isArray(dateData.participants)) {
            dateData.participants.forEach(participant => {
              if (participant.nickname) {
                allNicknames.add(participant.nickname.toLowerCase());
                
                // 이전 닉네임으로 투표한 기록이 있으면 저장
                if (previousNickname && participant.nickname === previousNickname) {
                  previousStatus = participant.status;
                  previousTime = participant.time;
                }
              }
            });
          }
        });
      }

      // 닉네임 중복 체크 (대소문자 구분 없이, 단 같은 사용자가 이전에 사용한 닉네임이 아니어야 함)
      if (allNicknames.has(trimmedNickname.toLowerCase()) && trimmedNickname.toLowerCase() !== previousNickname?.toLowerCase()) {
        setNicknameError('既に使用中のニックネームです。別のニックネームを入力してください。');
        return;
      }

      // 이전 닉네임으로 투표한 기록이 있으면 모든 날짜에서 제거
      if (previousNickname && previousNickname !== trimmedNickname) {
        const attendanceRef = ref(database, 'attendance');
        const allAttendanceSnapshot = await get(attendanceRef);
        
        if (allAttendanceSnapshot.exists()) {
          const attendanceData = allAttendanceSnapshot.val();
          const updates = {};
          
          // 모든 날짜에서 이전 닉네임 제거
          Object.keys(attendanceData).forEach(dateKey => {
            const dateData = attendanceData[dateKey];
            if (dateData && dateData.participants && Array.isArray(dateData.participants)) {
              const filteredParticipants = dateData.participants.filter(
                p => p.nickname !== previousNickname
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
          }
        }
      }

      // 사용자 매핑 업데이트
      const userMappingRef = ref(database, `userMappings/${userId}`);
      await set(userMappingRef, {
        nickname: trimmedNickname,
        updatedAt: new Date().toISOString()
      });

      // 중복이 없으면 등록 진행
      localStorage.setItem('futsalNickname', trimmedNickname);
      setNickname(trimmedNickname);
      setIsRegistered(true);
      setNicknameError('');

      // 이전 상태가 있었고 닉네임이 바뀌었다면 새 닉네임으로 상태 복원
      if (previousNickname && previousNickname !== trimmedNickname && previousStatus) {
        // 약간의 지연 후 상태 업데이트 (Firebase 업데이트 완료 대기)
        setTimeout(() => {
          updateStatus(previousStatus);
        }, 500);
      }

    } catch (error) {
      console.error('ニックネーム登録失敗:', error);
      setNicknameError('ニックネーム確認中にエラーが発生しました。再度お試しください。');
    }
  };

  const updateStatus = async (status) => {
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 기존 참가자 목록에서 내 정보 제거
    let updatedParticipants = participants.filter(p => p.nickname !== nickname);

    // 새 상태 추가 (none이 아니면)
    if (status !== 'none') {
      updatedParticipants.push({
        nickname,
        status,
        time: timeStr
      });
    }

    // 로컬 상태 업데이트
    setParticipants(updatedParticipants);
    setMyStatus(status);

    // Firebase에 저장
    try {
      const todayKey = getTodayKey();
      const attendanceRef = ref(database, `attendance/${todayKey}`);
      
      await set(attendanceRef, {
        participants: updatedParticipants,
        date: new Date().toDateString(),
        lastUpdated: now.toISOString()
      });
    } catch (error) {
      console.error('Firebase保存失敗:', error);
      // 오류 발생 시 사용자에게 알림 (선택사항)
      alert('状態更新に失敗しました。再度お試しください。');
    }
  };

  // 오늘 날짜의 참가자 리스트 리셋 함수 (자동 리셋용)
  const resetTodayAttendance = async (silent = true) => {
    try {
      const todayKey = getTodayKey();
      const attendanceRef = ref(database, `attendance/${todayKey}`);
      await remove(attendanceRef);
      
      // 로컬 상태도 초기화
      setParticipants([]);
      setMyStatus('none');
      
      if (!silent) {
        alert('参加者リストがリセットされました。');
      }
    } catch (error) {
      console.error('リセット失敗:', error);
      if (!silent) {
        alert('リセット中にエラーが発生しました。');
      }
    }
  };

  const getStatusCount = (status) => {

    return participants.filter(p => p.status === status).length;

  };

  const joinCount = getStatusCount('join');

  const passCount = getStatusCount('pass');

  const getStatusColor = () => {

    if (joinCount >= 4) return 'bg-green-500';

    if (joinCount >= 2) return 'bg-yellow-500';

    return 'bg-gray-400';

  };

  const getStatusMessage = () => {
    if (joinCount >= 4) {
      return {
        icon: Target,
        text: '試合可能です！',
        color: 'text-white'
      };
    }
    if (joinCount >= 2) {
      return {
        icon: Users,
        text: 'パス練習可能です！',
        color: 'text-white'
      };
    }
    return {
      icon: AlertCircle,
        text: 'まだ人数が不足しています',
      color: 'text-white/80'
    };
  };

  const isCloseToLunchTime = () => {

    const hour = currentTime.getHours();

    const minute = currentTime.getMinutes();

    return (hour === 12 && minute >= 20) || (hour === 11 && minute >= 50);

  };

  const shouldShowWeatherWarning = () => {

    return weather.condition === 'rain' || weather.condition === 'storm';

  };

  if (!isRegistered) {

    return (

      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-3 sm:p-4">

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl border border-white/20 p-6 sm:p-8 md:p-10 max-w-md w-full transform transition-all hover:scale-[1.02]">

          <div className="text-center mb-6 sm:mb-8 md:mb-10">

            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full mb-4 sm:mb-5 md:mb-6 shadow-lg">
              <span className="text-3xl sm:text-4xl md:text-5xl">⚽</span>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2 sm:mb-3">
              <Typewriter
                text={["Today's Lunch Soccer"]}
                speed={100}
                loop={true}
                className="text-2xl sm:text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent"
              />
            </h1>

            <p className="text-gray-600 text-sm sm:text-base font-medium">ニックネームを入力してください</p>

          </div>

          

          <div className="space-y-2 sm:space-y-3">

            <input

              type="text"

              value={inputNickname}

              onChange={(e) => {
                setInputNickname(e.target.value);
                setNicknameError(''); // 입력 시 에러 메시지 초기화
              }}

              onKeyPress={(e) => e.key === 'Enter' && handleRegister()}

              placeholder="例: サッカー王, タロウ"

              className={`w-full px-4 py-3 sm:px-5 sm:py-4 border-2 rounded-xl sm:rounded-2xl text-sm sm:text-base font-medium focus:outline-none transition-all duration-200 ${
                nicknameError 
                  ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-100' 
                  : 'border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100'
              }`}

              maxLength={10}

            />

            <p className="text-gray-400 text-xs font-medium px-2">
              ニックネームは最大10文字まで入力可能です。
            </p>

            {nicknameError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-2 sm:p-3">
                <p className="text-red-600 text-xs sm:text-sm font-medium">{nicknameError}</p>
              </div>
            )}

            <button

              onClick={handleRegister}

              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg hover:from-emerald-600 hover:to-teal-600 transition-all duration-200 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"

              disabled={!inputNickname.trim()}

            >

              始める

            </button>

          </div>

        </div>

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 pb-20">

      {/* Weather Warning */}

      {shouldShowWeatherWarning() && (

        <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 shadow-lg">

          <AlertTriangle size={18} className="sm:w-[20px] sm:h-[20px] md:w-[22px] md:h-[22px] animate-pulse flex-shrink-0" />

          <span className="text-xs sm:text-sm md:text-base font-semibold">今日は雨が予想されます。安全のため室内活動を推奨します。</span>

        </div>

      )}

      {/* Header */}

      <div className="bg-white/80 backdrop-blur-xl shadow-lg border-b border-white/20 px-3 sm:px-4 py-3 sm:py-4 md:py-5 sticky top-0 z-10">

        <div className="max-w-2xl mx-auto">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">

            <div className="flex-1 min-w-0">

              <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                <Typewriter
                  text={["Today's Lunch Soccer"]}
                  speed={100}
                  loop={true}
                  className="text-lg sm:text-xl md:text-2xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent"
                />
              </h1>

              <p className="text-gray-900 text-xs sm:text-sm font-medium mt-1">

                {currentTime.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}

                <span className="ml-1 sm:ml-2 text-gray-900 font-semibold">12:30~12:55</span>

              </p>

            </div>

            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* 닉네임 카드 */}
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg sm:rounded-xl shadow-lg">
                <UserCircle size={14} className="sm:w-[16px] sm:h-[16px] md:w-[18px] md:h-[18px] text-white/80" />
                <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[60px] sm:max-w-none">{nickname}</span>
              </div>

              {/* 닉네임 변경 버튼 */}
              <button 
                onClick={async () => {
                  const userId = getOrCreateUserId();
                  const currentNick = nickname;
                  
                  // 현재 닉네임으로 투표한 기록이 있으면 제거
                  if (currentNick) {
                    try {
                      const attendanceRef = ref(database, 'attendance');
                      const allAttendanceSnapshot = await get(attendanceRef);
                      
                      if (allAttendanceSnapshot.exists()) {
                        const attendanceData = allAttendanceSnapshot.val();
                        const updates = {};
                        
                        // 모든 날짜에서 현재 닉네임 제거
                        Object.keys(attendanceData).forEach(dateKey => {
                          const dateData = attendanceData[dateKey];
                          if (dateData && dateData.participants && Array.isArray(dateData.participants)) {
                            const filteredParticipants = dateData.participants.filter(
                              p => p.nickname !== currentNick
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
                        }
                      }
                    } catch (error) {
                      console.error('以前の投票記録削除失敗:', error);
                    }
                  }
                  
                  localStorage.removeItem('futsalNickname');
                  setIsRegistered(false);
                  setMyStatus('none');
                  setInputNickname('');
                }}
                className="group flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-white/90 hover:bg-white border border-gray-200 rounded-lg sm:rounded-xl shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
              >
                <Pencil size={12} className="sm:w-[13px] sm:h-[13px] md:w-[14px] md:h-[14px] text-gray-600 group-hover:text-emerald-600 transition-colors" />
                <span className="text-[10px] sm:text-xs font-semibold text-gray-700 group-hover:text-emerald-600 transition-colors hidden sm:inline">変更</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Main Content */}

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">

        {/* Attendance Count */}

        <div className={`${getStatusColor()} rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10 text-white text-center mb-6 sm:mb-8 shadow-2xl transition-all transform hover:scale-[1.02] relative overflow-hidden`}>

          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
          <div className="relative z-10">
            <div className="text-base sm:text-lg md:text-xl font-semibold mb-2 sm:mb-3">現在の参加者</div>

            <div className="text-5xl sm:text-6xl md:text-7xl font-extrabold mb-2 sm:mb-3 drop-shadow-lg">{joinCount}人</div>

            {(() => {
              const statusMsg = getStatusMessage();
              const IconComponent = statusMsg.icon;
              return (
                <div className="mt-4 sm:mt-5 md:mt-6 flex items-center justify-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-white/20 backdrop-blur-sm rounded-lg sm:rounded-xl">
                    <IconComponent size={16} className={`sm:w-[18px] sm:h-[18px] md:w-[20px] md:h-[20px] ${statusMsg.color}`} />
                  </div>
                  <span className={`text-sm sm:text-base md:text-lg font-semibold ${statusMsg.color}`}>
                    {statusMsg.text}
                  </span>
                </div>
              );
            })()}

            {isCloseToLunchTime() && joinCount >= 4 && (

              <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 text-sm sm:text-base md:text-lg font-bold animate-pulse">

                <div className="p-1 sm:p-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Flame size={14} className="sm:w-[16px] sm:h-[16px] md:w-[18px] md:h-[18px] text-white" />
                </div>
                <span>まもなく開始します！</span>

              </div>

            )}
          </div>

        </div>

        {/* Status Buttons */}

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/20 p-4 sm:p-5 md:p-6 mb-4 sm:mb-5 md:mb-6">

          <h2 className="text-base sm:text-lg font-extrabold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
            <span className="w-1 h-4 sm:h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></span>
            私の参加意思
          </h2>

          <div className="space-y-2 sm:space-y-3">

            <button

              onClick={() => updateStatus(myStatus === 'join' ? 'none' : 'join')}

              className={`w-full py-3 sm:py-3.5 md:py-4 px-4 sm:px-5 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg transition-all duration-200 transform flex items-center justify-center gap-2 sm:gap-3 ${
                myStatus === 'join'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-xl scale-105 hover:shadow-2xl'
                  : 'bg-gray-100 text-gray-700 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 hover:border-2 hover:border-emerald-200 hover:scale-[1.02] active:scale-[0.98] border-2 border-transparent'
              }`}

            >

              <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all ${
                myStatus === 'join'
                  ? 'bg-white/20 backdrop-blur-sm'
                  : 'bg-emerald-100'
              }`}>
                <CheckCircle2 
                  size={20} 
                  className={`sm:w-[22px] sm:h-[22px] md:w-[24px] md:h-[24px] ${myStatus === 'join' ? 'text-white' : 'text-emerald-600'}`} 
                />
              </div>
              <span>参加します</span>
              <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-sm sm:text-base font-semibold ${
                myStatus === 'join'
                  ? 'bg-white/20 backdrop-blur-sm text-white'
                  : 'bg-emerald-500 text-white'
              }`}>
                {joinCount}
              </span>

            </button>

            

            <button

              onClick={() => updateStatus(myStatus === 'pass' ? 'none' : 'pass')}

              className={`w-full py-3 sm:py-3.5 md:py-4 px-4 sm:px-5 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg transition-all duration-200 transform flex items-center justify-center gap-2 sm:gap-3 ${
                myStatus === 'pass'
                  ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-xl scale-105 hover:shadow-2xl'
                  : 'bg-gray-100 text-gray-700 hover:bg-gradient-to-r hover:from-red-50 hover:to-pink-50 hover:border-2 hover:border-red-200 hover:scale-[1.02] active:scale-[0.98] border-2 border-transparent'
              }`}

            >

              <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all ${
                myStatus === 'pass'
                  ? 'bg-white/20 backdrop-blur-sm'
                  : 'bg-red-100'
              }`}>
                <XCircle 
                  size={20} 
                  className={`sm:w-[22px] sm:h-[22px] md:w-[24px] md:h-[24px] ${myStatus === 'pass' ? 'text-white' : 'text-red-600'}`} 
                />
              </div>
              <span>不参加です</span>
              <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-sm sm:text-base font-semibold ${
                myStatus === 'pass'
                  ? 'bg-white/20 backdrop-blur-sm text-white'
                  : 'bg-red-500 text-white'
              }`}>
                {passCount}
              </span>

            </button>

          </div>

        </div>

        {/* Participants List */}

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/20 p-4 sm:p-6 md:p-8">

          <h2 className="text-lg sm:text-xl font-extrabold text-gray-800 mb-4 sm:mb-5 md:mb-6 flex items-center gap-2 sm:gap-3">

            <div className="p-1.5 sm:p-2 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg sm:rounded-xl">
              <Users size={16} className="sm:w-[18px] sm:h-[18px] md:w-[20px] md:h-[20px] text-emerald-600" />
            </div>
            参加者リスト

          </h2>

          

          {participants.length === 0 ? (

            <div className="text-center py-8 sm:py-10 md:py-12">
              <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">⚽</div>
              <p className="text-gray-500 text-sm sm:text-base font-medium">まだ参加意思を表明した人がいません</p>
            </div>

          ) : (

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">

              {participants

                .sort((a, b) => {

                  const order = { join: 0, pass: 1 };

                  return (order[a.status] ?? 2) - (order[b.status] ?? 2);

                })

                .map((p, idx) => (

                  <div

                    key={idx}

                    className={`flex flex-col p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all duration-200 transform hover:scale-[1.02] ${
                      p.nickname === nickname 
                        ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 shadow-md' 
                        : 'bg-gray-50/80 hover:bg-gray-100 border border-gray-200'
                    }`}

                  >

                    <div className="flex items-center gap-2 sm:gap-3">

                      <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all ${
                        p.status === 'join' 
                          ? 'bg-emerald-100' 
                          : 'bg-red-100'
                      }`}>
                        {p.status === 'join' ? (
                          <CheckCircle2 
                            size={18} 
                            className="sm:w-[19px] sm:h-[19px] md:w-[20px] md:h-[20px] text-emerald-600" 
                          />
                        ) : (
                          <XCircle 
                            size={18} 
                            className="sm:w-[19px] sm:h-[19px] md:w-[20px] md:h-[20px] text-red-600" 
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">

                        <div className="font-semibold text-sm sm:text-base text-gray-800 flex items-center gap-1.5 sm:gap-2 truncate">

                          <span className="truncate">{p.nickname}</span>

                          {p.nickname === nickname && (

                            <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500 text-white text-[10px] sm:text-xs font-bold rounded-full flex-shrink-0">私</span>

                          )}

                        </div>

                        <div className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1">

                          <Clock size={10} className="sm:w-[11px] sm:h-[11px] md:w-[12px] md:h-[12px]" />

                          {p.time} 表示

                        </div>

                      </div>

                    </div>

                  </div>

                ))}

            </div>

          )}

        </div>

        {/* Info Box */}

        <div className="mt-6 sm:mt-7 md:mt-8 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 border border-emerald-200 shadow-lg">

          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-700">
            <p className="flex items-center gap-1.5 sm:gap-2 font-semibold">
              <span className="text-base sm:text-lg">💡</span>
              <strong className="text-emerald-700">4人以上</strong>なら試合ができます
            </p>
            <p className="flex items-center gap-1.5 sm:gap-2 font-semibold">
              <span className="text-base sm:text-lg">💡</span>
              <strong className="text-teal-700">2-3人</strong>ならパス練習が可能です
            </p>
          </div>

        </div>

      </div>

    </div>

  );

};

export default FutsalAttendance;

