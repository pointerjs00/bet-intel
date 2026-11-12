import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/** Icon (not emoji) and colour per sport, used in pickers, filters and share cards. */
export const SPORT_ICON: Record<string, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string }> = {
  FOOTBALL: { icon: 'soccer', color: '#22C55E' },
  BASKETBALL: { icon: 'basketball', color: '#F97316' },
  TENNIS: { icon: 'tennis', color: '#EAB308' },
  HANDBALL: { icon: 'handball', color: '#3B82F6' },
  VOLLEYBALL: { icon: 'volleyball', color: '#8B5CF6' },
  HOCKEY: { icon: 'hockey-sticks', color: '#06B6D4' },
  RUGBY: { icon: 'rugby', color: '#A16207' },
  AMERICAN_FOOTBALL: { icon: 'football', color: '#DC2626' },
  BASEBALL: { icon: 'baseball', color: '#64748B' },
  OTHER: { icon: 'trophy-outline', color: '#94A3B8' },
};

/** Sport glyph in the sport's colour (or `color` when given). */
export function SportIcon({ sport, size = 14, color }: { sport: string; size?: number; color?: string }) {
  const s = SPORT_ICON[sport] ?? SPORT_ICON.OTHER;
  return <MaterialCommunityIcons color={color ?? s.color} name={s.icon} size={size} />;
}
