// Firebase에서 12/12 날짜의 참가자 리스트를 리셋하는 스크립트
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, remove } from 'firebase/database';

const firebaseConfig = {
  databaseURL: 'https://futsal-6fa05-default-rtdb.asia-southeast1.firebasedatabase.app/'
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// 12/12 날짜 키 생성 (YYYY-MM-DD 형식)
const getDateKey = () => {
  // 2024-12-12로 고정
  return '2024-12-12';
};

async function reset1212Attendance() {
  try {
    const dateKey = getDateKey();
    const attendanceRef = ref(database, `attendance/${dateKey}`);
    
    console.log(`12/12 날짜(${dateKey})의 참가자 리스트를 리셋합니다...`);
    
    await remove(attendanceRef);
    
    console.log('✅ 성공적으로 리셋되었습니다!');
    process.exit(0);
  } catch (error) {
    console.error('❌ 리셋 실패:', error);
    process.exit(1);
  }
}

reset1212Attendance();
