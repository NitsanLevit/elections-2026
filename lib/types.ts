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
  seats: number | null;
};

export type Poll = {
  id: string;
  source: string;
  date: string;
  pollingFirm?: string;
  sampleSize?: number | null;
  sourceUrl?: string;
  lastChecked?: string;
  parties: PollParty[];
};

export type ScrapedPoll = {
  source: string;
  date: string;
  sourceKey: string;
  rawData: {
    pollingFirm: string;
    publisher: string;
    sourceUrl: string;
    wikipediaUrl: string;
    fieldworkLabel: string;
    sampleSize: number | null;
    parties: PollParty[];
  };
};

export type LeaderboardEntry = {
  name: string;
  score: number;
  betPlaced: boolean;
};
