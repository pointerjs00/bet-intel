import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/** Valid Ionicons glyph name — use instead of `as any` when an icon name comes from data. */
export type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Narrows a string from data (API, config) to an Ionicons name; falls back when unknown at runtime. */
export function ionicon(name: string | null | undefined, fallback: IoniconName = 'ellipse-outline'): IoniconName {
  return (name || fallback) as IoniconName;
}
