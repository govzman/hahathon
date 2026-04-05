export interface MissionTemplate {
  text: string;
  reward: number;
  emoji: string;
  urgent: boolean;
  action: string; // button label
}

export const MISSIONS_POOL: MissionTemplate[] = [];
