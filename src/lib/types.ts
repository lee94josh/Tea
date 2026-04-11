export type TeaTypeKey =
  | "green"
  | "black"
  | "white"
  | "oolong"
  | "puerh"
  | "herbal"
  | "yellow";

export interface TeaWithSessions {
  id: string;
  name: string;
  type: string;
  origin: string | null;
  brand: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessions: SessionWithTea[];
}

export interface SessionWithTea {
  id: string;
  teaId: string;
  rating: number;
  notes: string | null;
  brewTempC: number | null;
  steepTimeSec: number | null;
  photoUrl: string | null;
  consumedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  tea: {
    id: string;
    name: string;
    type: string;
    origin: string | null;
    brand: string | null;
  };
}

export interface StatsData {
  ratingDistribution: { rating: number; count: number }[];
  typeStats: { type: string; sessionCount: number; avgRating: number }[];
  weeklyTrend: { week: string; count: number }[];
  totalSessions: number;
  avgRating: number;
}
