export type KurtDay = { date: string; listened: boolean };

export type KurtStatus = {
  today: string;
  listened_today: boolean;
  listened_yesterday: boolean;
  current_streak: number;
  longest_streak: number;
  last_listen_day: string | null;
  incidents: number;
  total_listen_days: number;
  at_risk: boolean;
  kurt_down: boolean;
  hours_left_today: number;
  recent: KurtDay[];
};
