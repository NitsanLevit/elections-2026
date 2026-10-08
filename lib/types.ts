export type Party = {
  id: string;
  name: string;
  leader: string;
  pollAverage: number;
  thresholdRisk: boolean;
  order: number;
};

export type PollParty = {
  name: string;
  seats: number;
};

export type Poll = {
  id: string;
  source: string;
  date: string;
  parties: PollParty[];
};

export type LeaderboardEntry = {
  name: string;
  score: number;
  betPlaced: boolean;
};
