import type { LeaderboardEntry, Party, Poll } from './types';

export const mockParties: Party[] = [
  { id: 'p1', name: 'ישר!', leader: 'גדי איזנקוט', pollAverage: 7.4, thresholdRisk: false, order: 1 },
  { id: 'p2', name: 'הליכוד', leader: 'בנימין נתניהו', pollAverage: 34.1, thresholdRisk: false, order: 2 },
  { id: 'p3', name: 'ביחד', leader: 'נפתלי בנט', pollAverage: 11.8, thresholdRisk: false, order: 3 },
  { id: 'p4', name: 'ישראל ביתנו', leader: 'אביגדור ליברמן', pollAverage: 10.3, thresholdRisk: false, order: 4 },
  { id: 'p5', name: 'הדמוקרטים', leader: 'יאיר גולן', pollAverage: 6.1, thresholdRisk: false, order: 5 },
  { id: 'p6', name: 'הרשימה המשותפת / חד"ש-תע"ל', leader: "יוסף ג'בארין", pollAverage: 5.9, thresholdRisk: false, order: 6 },
  { id: 'p7', name: 'יהדות התורה', leader: 'יעקב אשר', pollAverage: 8.2, thresholdRisk: false, order: 7 },
  { id: 'p8', name: 'ש"ס', leader: 'אריה דרעי', pollAverage: 10.1, thresholdRisk: false, order: 8 },
  { id: 'p9', name: 'עוצמה יהודית', leader: 'איתמר בן גביר', pollAverage: 8.9, thresholdRisk: false, order: 9 },
  { id: 'p10', name: 'הציונות הדתית', leader: "בצלאל סמוטריץ' ומשה פייגלין", pollAverage: 7.6, thresholdRisk: false, order: 10 },
  { id: 'p11', name: 'רע"ם', leader: 'מנסור עבאס ויואב סגלוביץ', pollAverage: 5.2, thresholdRisk: false, order: 11 },
  { id: 'p12', name: 'המילואימניקים', leader: 'יועז הנדל וירון זליכה', pollAverage: 3.6, thresholdRisk: false, order: 12 },
  { id: 'p13', name: 'עמך ישראל', leader: 'עופר וינטר', pollAverage: 2.4, thresholdRisk: true, order: 13 },
  { id: 'p14', name: 'הציבור החרדי', leader: 'מוטי לייטנר', pollAverage: 1.8, thresholdRisk: true, order: 14 },
  { id: 'p15', name: 'כחול לבן', leader: 'בני גנץ', pollAverage: 1.2, thresholdRisk: true, order: 15 },
];

export const mockPolls: Poll[] = [
  {
    id: 'poll-1',
    source: 'ערוץ 11',
    date: '08.10.2026',
    parties: [
      { name: 'הליכוד', seats: 32 },
      { name: 'ש"ס', seats: 11 },
      { name: 'ביחד', seats: 12 },
      { name: 'ישראל ביתנו', seats: 10 },
    ],
  },
  {
    id: 'poll-2',
    source: 'ערוץ 12',
    date: '10.10.2026',
    parties: [
      { name: 'הליכוד', seats: 34 },
      { name: 'ביחד', seats: 13 },
      { name: 'ש"ס', seats: 10 },
      { name: 'ישראל ביתנו', seats: 9 },
    ],
  },
  {
    id: 'poll-3',
    source: 'ערוץ 13',
    date: '12.10.2026',
    parties: [
      { name: 'הליכוד', seats: 33 },
      { name: 'ביחד', seats: 11 },
      { name: 'ש"ס', seats: 11 },
      { name: 'ישראל ביתנו', seats: 9 },
    ],
  },
  {
    id: 'poll-4',
    source: 'ערוץ 14',
    date: '14.10.2026',
    parties: [
      { name: 'הליכוד', seats: 35 },
      { name: 'ביחד', seats: 12 },
      { name: 'ש"ס', seats: 10 },
      { name: 'ישראל ביתנו', seats: 10 },
    ],
  },
];

export const mockLeaderboard: LeaderboardEntry[] = [
  { name: 'בטטה', score: 12, betPlaced: true },
  { name: 'רפי', score: 18, betPlaced: true },
  { name: 'מיכל', score: 27, betPlaced: false },
  { name: 'עידו', score: 31, betPlaced: true },
  { name: 'ליאורה', score: 36, betPlaced: true },
];
