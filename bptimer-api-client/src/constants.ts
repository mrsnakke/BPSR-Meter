export const CACHE_EXPIRY_MS = 5 * 60 * 1000;
export const HP_REPORT_INTERVAL = 5;

// Mob IDs that require position data for location tracking
export const LOCATION_TRACKED_MOBS = new Set([10900, 10901, 10904]);

export const MOB_MAPPING = new Map([
  ['10007', 'Storm Goblin King'],
  ['10009', 'Frost Ogre'],
  ['10010', 'Tempest Ogre'],
  ['10018', 'Inferno Ogre'],
  ['10029', 'Muku King'],
  ['10032', 'Golden Juggernaut'],
  ['10056', 'Brigand Leader'],
  ['10059', 'Muku Chief'],
  ['10069', 'Phantom Arachnocrab'],
  ['10077', 'Venobzzar Incubator'],
  ['10081', 'Iron Fang'],
  ['10084', 'Celestial Flier'],
  ['10085', 'Lizardman King'],
  ['10086', 'Goblin King'],
  ['10900', 'Golden Nappo'],
  ['10901', 'Silver Nappo'],
  ['10902', 'Lovely Boarlet'],
  ['10903', 'Breezy Boarlet'],
  ['10904', 'Loyal Boarlet']
]);
