import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, push, get, remove } from 'firebase/database';
import { database } from '../firebase';
import { Heart, MessageSquare, Send, Clock, UserCircle, Edit2, Trash2, Pin, PinOff, ChevronDown, ChevronUp, Calendar } from 'lucide-react';

const MessageBoard = ({ nickname, userId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [likedMessages, setLikedMessages] = useState(new Set());
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [collapsedDates, setCollapsedDates] = useState(new Set());
  const initializedDatesRef = useRef(false);

  // Firebase에서 메시지 로드 및 자동 삭제
  useEffect(() => {
    const messagesRef = ref(database, 'messages');
    
    const unsubscribe = onValue(messagesRef, async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7일 전
        
        // 공지사항 목록 가져오기
        const announcementsSnapshot = await get(ref(database, 'announcements'));
        const announcementIds = new Set();
        if (announcementsSnapshot.exists()) {
          const announcementsData = announcementsSnapshot.val();
          Object.values(announcementsData).forEach(announcement => {
            if (announcement.messageId) {
              announcementIds.add(announcement.messageId);
            }
          });
        }
        
        // 7일 이상 된 메시지 중 공지사항이 아닌 것들 삭제
        const messagesToDelete = [];
        const updates = {};
        
        Object.keys(data).forEach(messageId => {
          const message = data[messageId];
          const messageDate = new Date(message.createdAt);
          
          // 7일 이상 지났고 공지사항이 아닌 경우 삭제 대상
          if (messageDate < oneWeekAgo && !announcementIds.has(messageId)) {
            messagesToDelete.push(messageId);
            
            // 메시지 삭제
            updates[`messages/${messageId}`] = null;
          }
        });
        
        // 삭제할 메시지가 있으면 Firebase 업데이트
        if (messagesToDelete.length > 0) {
          try {
            // 사용자별 좋아요 정보에서도 삭제
            const userLikesRef = ref(database, 'userLikes');
            const userLikesSnapshot = await get(userLikesRef);
            
            if (userLikesSnapshot.exists()) {
              const userLikesData = userLikesSnapshot.val();
              
              Object.keys(userLikesData).forEach(userId => {
                messagesToDelete.forEach(messageId => {
                  if (userLikesData[userId] && userLikesData[userId][messageId]) {
                    updates[`userLikes/${userId}/${messageId}`] = null;
                  }
                });
              });
            }
            
            // 모든 업데이트를 한 번에 실행
            if (Object.keys(updates).length > 0) {
              await Promise.all(
                Object.entries(updates).map(([path, value]) => {
                  const pathRef = ref(database, path);
                  return set(pathRef, value);
                })
              );
            }
          } catch (error) {
            console.error('古いメッセージ削除エラー:', error);
          }
        }
        
        // 객체를 배열로 변환하고 일주일 이내 메시지만 필터링, 최신순으로 정렬
        const messagesArray = Object.keys(data)
          .map(key => ({
            id: key,
            ...data[key]
          }))
          .filter(message => {
            const messageDate = new Date(message.createdAt);
            return messageDate >= oneWeekAgo;
          })
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        setMessages(messagesArray);
      } else {
        setMessages([]);
      }
    }, (error) => {
      console.error('メッセージ読み込みエラー:', error);
    });

    // 사용자가 좋아요한 메시지 로드
    if (userId) {
      const userLikesRef = ref(database, `userLikes/${userId}`);
      get(userLikesRef).then((snapshot) => {
        if (snapshot.exists()) {
          const likes = snapshot.val();
          setLikedMessages(new Set(Object.keys(likes)));
        }
      });
    }

    return () => {
      unsubscribe();
    };
  }, [userId]);

  // 공지사항 로드
  useEffect(() => {
    const announcementsRef = ref(database, 'announcements');
    
    const unsubscribe = onValue(announcementsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const announcementsArray = Object.keys(data)
          .map(key => ({
            id: key,
            ...data[key]
          }))
          .sort((a, b) => new Date(b.pinnedAt || b.createdAt) - new Date(a.pinnedAt || a.createdAt))
          .slice(0, 5); // 최대 5개만
        
        setAnnouncements(announcementsArray);
      } else {
        setAnnouncements([]);
      }
    }, (error) => {
      console.error('お知らせ読み込みエラー:', error);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 날짜별 수납 기본값 설정 (초기 로드 시 모든 날짜를 기본적으로 닫힌 상태로)
  useEffect(() => {
    if (messages.length === 0 || initializedDatesRef.current) return;
    
    const todayDateKey = getTodayDateKey();
    const dateKeys = messages
      .map(msg => getDateKey(msg.createdAt))
      .filter(dateKey => dateKey !== todayDateKey)
      .filter((dateKey, index, self) => self.indexOf(dateKey) === index); // 중복 제거
    
    if (dateKeys.length > 0) {
      setCollapsedDates(new Set(dateKeys));
      initializedDatesRef.current = true;
    }
  }, [messages]);

  // 메시지 전송
  const handleSendMessage = async () => {
    const trimmedMessage = newMessage.trim();
    
    if (!trimmedMessage || !nickname) {
      return;
    }

    try {
      const messagesRef = ref(database, 'messages');
      const newMessageRef = push(messagesRef);
      
      await set(newMessageRef, {
        text: trimmedMessage,
        author: nickname,
        authorId: userId,
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: {}
      });

      setNewMessage('');
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      alert('メッセージの送信に失敗しました。');
    }
  };

  // 좋아요 토글
  const handleToggleLike = async (messageId, currentLikes, currentLikedBy) => {
    if (!userId) return;

    try {
      const messageRef = ref(database, `messages/${messageId}`);
      const userLikesRef = ref(database, `userLikes/${userId}/${messageId}`);
      
      const isLiked = likedMessages.has(messageId);
      const newLikedBy = { ...currentLikedBy };
      
      if (isLiked) {
        // 좋아요 취소
        delete newLikedBy[userId];
        await set(userLikesRef, null);
        await set(ref(database, `messages/${messageId}/likes`), currentLikes - 1);
        await set(ref(database, `messages/${messageId}/likedBy`), newLikedBy);
        
        setLikedMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
      } else {
        // 좋아요 추가
        newLikedBy[userId] = true;
        await set(userLikesRef, true);
        await set(ref(database, `messages/${messageId}/likes`), currentLikes + 1);
        await set(ref(database, `messages/${messageId}/likedBy`), newLikedBy);
        
        setLikedMessages(prev => new Set(prev).add(messageId));
      }
    } catch (error) {
      console.error('いいねエラー:', error);
    }
  };

  // 메시지 수정 시작
  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    setEditText(message.text);
  };

  // 메시지 수정 취소
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

    // 메시지 수정 저장
  const handleSaveEdit = async (messageId) => {
    const trimmedText = editText.trim();
    
    if (!trimmedText) {
      alert('メッセージを入力してください。');
      return;
    }

    try {
      await set(ref(database, `messages/${messageId}/text`), trimmedText);
      await set(ref(database, `messages/${messageId}/updatedAt`), new Date().toISOString());
      
      // 공지사항인 경우 공지사항의 텍스트도 업데이트
      const announcementRef = ref(database, `announcements/${messageId}`);
      const announcementSnapshot = await get(announcementRef);
      if (announcementSnapshot.exists()) {
        await set(ref(database, `announcements/${messageId}/text`), trimmedText);
      }
      
      setEditingMessageId(null);
      setEditText('');
    } catch (error) {
      console.error('メッセージ編集エラー:', error);
      alert('メッセージの編集に失敗しました。');
    }
  };

  // 메시지 삭제
  const handleDeleteMessage = async (messageId) => {
    if (!confirm('このメッセージを削除しますか？')) {
      return;
    }

    try {
      // 공지사항인 경우 공지사항에서도 삭제
      const announcementRef = ref(database, `announcements/${messageId}`);
      await remove(announcementRef);
      
      // 메시지 삭제
      await remove(ref(database, `messages/${messageId}`));
      
      // 사용자별 좋아요 정보에서도 삭제
      const userLikesRef = ref(database, `userLikes`);
      const userLikesSnapshot = await get(userLikesRef);
      
      if (userLikesSnapshot.exists()) {
        const userLikesData = userLikesSnapshot.val();
        const updates = {};
        
        Object.keys(userLikesData).forEach(userId => {
          if (userLikesData[userId] && userLikesData[userId][messageId]) {
            updates[`userLikes/${userId}/${messageId}`] = null;
          }
        });
        
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
      console.error('メッセージ削除エラー:', error);
      alert('メッセージの削除に失敗しました。');
    }
  };

  // 공지사항으로 만들기/해제
  const handleToggleAnnouncement = async (message) => {
    if (!userId) return;

    try {
      const announcementRef = ref(database, `announcements/${message.id}`);
      const announcementsSnapshot = await get(ref(database, 'announcements'));
      
      let currentAnnouncements = [];
      if (announcementsSnapshot.exists()) {
        currentAnnouncements = Object.values(announcementsSnapshot.val());
      }

      // 현재 공지사항인지 확인
      const isAnnouncement = currentAnnouncements.some(a => a.messageId === message.id);

      if (isAnnouncement) {
        // 공지사항 해제
        await remove(announcementRef);
      } else {
        // 공지사항으로 만들기 전 체크
        // 전체 공지사항 개수 체크 (최대 5개)
        if (currentAnnouncements.length >= 5) {
          alert('お知らせは最大5件まで設定できます。');
          return;
        }

        // 같은 사용자의 공지사항 개수 체크 (최대 3개)
        const userAnnouncements = currentAnnouncements.filter(a => a.authorId === userId);
        if (userAnnouncements.length >= 3) {
          alert('同じユーザーは最大3件までお知らせを設定できます。');
          return;
        }

        // 공지사항으로 설정
        await set(announcementRef, {
          messageId: message.id,
          text: message.text,
          author: message.author,
          authorId: message.authorId,
          createdAt: message.createdAt,
          pinnedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('お知らせ設定エラー:', error);
      alert('お知らせの設定に失敗しました。');
    }
  };

  // 공지사항인지 확인
  const isAnnouncement = (messageId) => {
    return announcements.some(a => a.messageId === messageId);
  };

  // 날짜 키 계산 (17시 기준)
  const getDateKey = (date) => {
    const messageDate = new Date(date);
    // 17시 이후면 다음날 날짜로 계산
    if (messageDate.getHours() >= 17) {
      const nextDay = new Date(messageDate);
      nextDay.setDate(nextDay.getDate() + 1);
      return nextDay.toISOString().split('T')[0];
    }
    return messageDate.toISOString().split('T')[0];
  };

  // 오늘 날짜 키 계산
  const getTodayDateKey = () => {
    const now = new Date();
    if (now.getHours() >= 17) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    return now.toISOString().split('T')[0];
  };

  // 메시지를 날짜별로 그룹화
  const groupMessagesByDate = () => {
    const todayDateKey = getTodayDateKey();
    
    const grouped = {};
    const todayMessages = [];
    
    messages.forEach(message => {
      const messageDateKey = getDateKey(message.createdAt);
      
      // 오늘이 아닌 메시지는 날짜별로 그룹화 (공지사항 포함)
      if (messageDateKey !== todayDateKey) {
        if (!grouped[messageDateKey]) {
          grouped[messageDateKey] = [];
        }
        grouped[messageDateKey].push(message);
      } else {
        // 오늘 메시지 (공지사항 포함)
        todayMessages.push(message);
      }
    });
    
    return { todayMessages, grouped };
  };

  // 날짜 포맷팅
  const formatDateKey = (dateKey) => {
    const date = new Date(dateKey + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return '今日';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨日';
    } else {
      return date.toLocaleDateString('ja-JP', { 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
      });
    }
  };

  // 날짜별 수납 토글
  const toggleDateCollapse = (dateKey) => {
    setCollapsedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  // 시간 포맷팅
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    // 1분 미만
    if (diff < 60000) {
      return 'たった今';
    }
    
    // 1시간 미만
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}分前`;
    }
    
    // 오늘
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    
    // 어제
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `昨日 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // 그 외
    return date.toLocaleString('ja-JP', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="mt-6 sm:mt-7 md:mt-8 bg-white/80 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-xl border border-white/20 p-4 sm:p-5 md:p-6">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5 flex-wrap">
        <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-gray-800 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg sm:rounded-xl">
            <MessageSquare size={16} className="sm:w-[18px] sm:h-[18px] md:w-[20px] md:h-[20px] text-emerald-600" />
          </div>
          掲示板
        </h2>
        <p className="text-xs sm:text-sm text-gray-500">
          お知らせ以外の投稿は1週間保持されます。
        </p>
      </div>

      {/* 메시지 입력 */}
      <div className="mb-4 sm:mb-5 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="メッセージを入力..."
          className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          maxLength={200}
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim()}
          className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base hover:from-emerald-600 hover:to-teal-600 transition-all duration-200 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 flex items-center gap-1.5"
        >
          <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          <span className="hidden sm:inline">作成</span>
        </button>
      </div>

      {/* 메시지 목록 */}
      <div className="space-y-3 sm:space-y-4 max-h-[400px] sm:max-h-[500px] overflow-y-auto">
        {(() => {
          const { todayMessages, grouped } = groupMessagesByDate();
          const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
          
          if (todayMessages.length === 0 && sortedDates.length === 0) {
            return (
              <div className="text-center py-8 sm:py-10">
                <div className="text-3xl sm:text-4xl mb-2 sm:mb-3">💬</div>
                <p className="text-gray-500 text-sm sm:text-base font-medium">まだメッセージがありません</p>
              </div>
            );
          }

          const renderMessage = (message) => {
            const isLiked = likedMessages.has(message.id);
            const likes = message.likes || 0;
            
            return (
              <div
                key={message.id}
                className={`p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all duration-200 ${
                  message.authorId === userId
                    ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
                    : 'bg-gray-50/80 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg flex-shrink-0">
                    <UserCircle size={16} className="sm:w-[18px] sm:h-[18px] text-emerald-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2 flex-wrap">
                      <span className="font-semibold text-sm sm:text-base text-gray-800">
                        {message.author}
                      </span>
                      {message.authorId === userId && (
                        <span className="px-1.5 sm:px-2 py-0.5 bg-emerald-500 text-white text-[10px] sm:text-xs font-bold rounded-full">
                          私
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-500">
                        <Clock size={10} className="sm:w-[11px] sm:h-[11px]" />
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <button
                        onClick={() => handleToggleLike(message.id, likes, message.likedBy || {})}
                        className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg transition-all duration-200 ${
                          isLiked
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Heart 
                          size={12} 
                          className={`sm:w-[14px] sm:h-[14px] ${isLiked ? 'fill-current' : ''}`}
                        />
                        <span className="text-[10px] sm:text-xs font-semibold">{likes}</span>
                      </button>
                      {message.authorId === userId && (
                        <div className="flex items-center gap-1 ml-auto">
                          {editingMessageId === message.id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(message.id)}
                                className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-emerald-500 text-white text-[10px] sm:text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-all"
                              >
                                保存
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-400 text-white text-[10px] sm:text-xs font-semibold rounded-lg hover:bg-gray-500 transition-all"
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleToggleAnnouncement(message)}
                                className={`p-1 sm:p-1.5 rounded-lg transition-all ${
                                  isAnnouncement(message.id)
                                    ? 'text-amber-600 hover:bg-amber-100'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                                title={isAnnouncement(message.id) ? 'お知らせ解除' : 'お知らせにする'}
                              >
                                {isAnnouncement(message.id) ? (
                                  <PinOff size={12} className="sm:w-[14px] sm:h-[14px]" />
                                ) : (
                                  <Pin size={12} className="sm:w-[14px] sm:h-[14px]" />
                                )}
                              </button>
                              <button
                                onClick={() => handleStartEdit(message)}
                                className="p-1 sm:p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all"
                                title="編集"
                              >
                                <Edit2 size={12} className="sm:w-[14px] sm:h-[14px]" />
                              </button>
                              <button
                                onClick={() => handleDeleteMessage(message.id)}
                                className="p-1 sm:p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                                title="削除"
                              >
                                <Trash2 size={12} className="sm:w-[14px] sm:h-[14px]" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {editingMessageId === message.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-emerald-300 rounded-lg text-sm sm:text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 resize-none"
                          rows={3}
                          maxLength={200}
                        />
                      </div>
                    ) : (
                      <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          };

          return (
            <>
              {/* 오늘 메시지 (공지사항 포함) */}
              {todayMessages
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(renderMessage)}
              
              {/* 날짜별 수납된 메시지 */}
              {sortedDates.map(dateKey => {
                const dateMessages = grouped[dateKey];
                const isCollapsed = collapsedDates.has(dateKey);
                
                return (
                  <div key={dateKey}>
                    <button
                      onClick={() => toggleDateCollapse(dateKey)}
                      className="w-full flex items-center justify-between p-2 sm:p-3 bg-gray-100 hover:bg-gray-200 rounded-lg sm:rounded-xl transition-all duration-200 mb-2 sm:mb-3"
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Calendar size={14} className="sm:w-[16px] sm:h-[16px] text-gray-600" />
                        <span className="text-sm sm:text-base font-semibold text-gray-700">
                          {formatDateKey(dateKey)}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-300 text-gray-700 text-[10px] sm:text-xs font-semibold rounded-full">
                          {dateMessages.length}件
                        </span>
                      </div>
                      {isCollapsed ? (
                        <ChevronDown size={16} className="sm:w-[18px] sm:h-[18px] text-gray-600" />
                      ) : (
                        <ChevronUp size={16} className="sm:w-[18px] sm:h-[18px] text-gray-600" />
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-3 sm:space-y-4">
                        {dateMessages.map(renderMessage)}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default MessageBoard;

