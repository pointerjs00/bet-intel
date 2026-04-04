import type { ImageSourcePropType } from 'react-native';

/**
 * Maps betting site slugs to their bundled logo PNG assets.
 * Add a new entry here whenever a new scraper site is registered.
 */
export const SITE_LOGOS: Record<string, ImageSourcePropType> = {
  betano:   require('../assets/logos/betano.png'),
  betclic:  require('../assets/logos/betclic.png'),
  placard:  require('../assets/logos/placard.png'),
  solverde: require('../assets/logos/solverde.png'),
};
