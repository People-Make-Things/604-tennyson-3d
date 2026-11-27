// House data (1 unit = 1 ft). x runs along Tennyson Ave (0 = wall facing Webster St), z runs away from the street.
// Outer walls: City of Palo Alto footprint (OSM way 231878571). Rooms: estimated from the tour video and listing photos.
export const OUTLINE = [[0,0],[18.4,0],[18.4,8.6],[42.4,8.6],[42.4,14.2],[61.4,14.2],[61.4,51.8],[47.4,51.8],[47.4,57.7],[23,57.7],[23,48.6],[0,48.6]];
export const FY = [0, 10];
// Main roof kept low as in the street photo: ridge 20.4 ft above the ground floor at z = 28, front plane at 0.45,
// steeper (0.63) over the front of the east wing so its eave sits at the one-storey height the photo shows.
// Dormers at the aerial's three positions; each dormer ridge is 4.2 ft above the roof at its face.
export const RIDGE_Z = 28, ROOF_TOP = 10.05, PITCH = 0.45, PITCH_E = 0.63;
export const DORMERS = [24, 38.5, 50.5];
export const dormerFace = c => (c > 42.4 ? 14.2 : 12) - 0.5;
export const dormerTop = c => 20.4 - (c > 42.4 ? PITCH_E : PITCH) * (RIDGE_Z - dormerFace(c)) + 4.2;
export const hU = (z, x) => {
  const p = x != null && x > 42.4 && z < RIDGE_Z ? PITCH_E : PITCH;
  let h = Math.max(0.5, Math.min(ROOF_TOP, ROOF_TOP - p * Math.abs(z - RIDGE_Z)));
  if (x != null && z < 16) for (const c of DORMERS) if (Math.abs(x - c) < 2.4) h = Math.max(h, dormerTop(c) - 10.8 - 0.75 * Math.abs(x - c));
  return h; };
export const HFN = [() => 9, hU];
export const C = { wall:'paint', den:'paneling', bathG:'paintGreen', half:'paintGrey', oak:'oak', oakDark:'oakDark', terra:'terra', tileBlue:'tileHex', tileBeige:'tileBeige', tileWhite:'tileWhite', brick:'brick', deck:'deck', grass:'grass', grass2:'grass', concrete:'concrete', gravel:'gravel' };
export const ROOMS = [
 // ground floor
 {id:'den',f:0,r:[0,0,18.4,18],name:'Office / den',floor:C.oakDark,wall:C.den,
  desc:'Wood-paneled room with a stone fireplace, built-in shelves and a row of side windows. It sits in the front wing that sticks out toward Tennyson, with its side windows facing Webster St. The video calls it bedroom/office.',
  idea:'Office', imgs:['z09','v030','v032','v034'], t:28},
 {id:'living',f:0,r:[18.4,8.6,42.4,24],name:'Living room',floor:C.oak,
  desc:'Long main room right inside the front door. Wood floors, fireplace, open staircase along the back wall and big front windows.',
  idea:'Living room / lounge', imgs:['z07','z08','v018','v019','v056'], t:16},
 {id:'back',f:0,r:[0,18,18.4,24],name:'Back hall',floor:C.oakDark,
  desc:'Links the office, kitchen and a side door. Position inferred from how the video moves between rooms.', imgs:[], t:52},
 {id:'kitchen',f:0,r:[0,24,18.4,48.6],name:'Kitchen',floor:C.terra,
  desc:'Vaulted ceiling with skylights, terracotta tile floor, oak cabinets, tile counters, double wall oven, fridge and dishwasher. French doors open to the pergola. The two skylights show on the aerial photo in this back corner.',
  imgs:['z04','z03','z05','v080','v081','v082','v083'], t:60},
 {id:'dining',f:0,r:[42.4,14.2,61.4,32],name:'Dining room',floor:C.oak,
  desc:'Formal dining room with a beamed ceiling, chandelier and windows onto the garden.',
  idea:'Meeting room', imgs:['z06'], t:56},
 {id:'hall',f:0,r:[18.4,24,42.4,30],name:'Inner hall',floor:C.oak,
  desc:'Connects living room, dining room, kitchen, half bath, laundry and the ground-floor bath. Position inferred.', imgs:[], t:84},
 {id:'half',f:0,r:[18.4,30,23,36],name:'Half bath',floor:C.tileBeige,wall:C.half,
  desc:'Powder room with a wall-mounted sink and toilet.', imgs:['v047'], t:42},
 {id:'laundry',f:0,r:[23,30,30,38],name:'Laundry',floor:C.terra,
  desc:'Washer, dryer and utility sink. The listing says washer and dryer are included.', imgs:['v086'], t:84},
 {id:'bathG',f:0,r:[30,30,42.4,38],name:'Full bath (ground)',floor:C.tileBlue,wall:C.bathG,
  desc:'Green botanical wallpaper, white subway tile, pedestal sink, tub and a green-tiled shower.',
  imgs:['z12','v106','v108','v110'], t:102},
 {id:'pantry',f:0,r:[18.4,36,23,48.6],name:'Pantry / storage',floor:C.oak,
  desc:'Narrow space between the kitchen and the back rooms. Use is inferred.', imgs:[], t:null},
 {id:'family',f:0,r:[42.4,32,61.4,51.8],name:'Family room / bedroom 2',floor:C.oak,
  desc:'Back room with a beamed ceiling, built-in shelves and French doors to the garden. Sits next to the ground-floor full bath.',
  imgs:['z11','v090','v092','v094'], t:88},
 {id:'rear',f:0,r:[23,38,42.4,57.7],name:'Back room',floor:C.oak,
  desc:'The city outline shows the house reaching this far back as a one-story wing. The tour does not clearly show this room, so its use is unknown.', imgs:[], t:null},
 // upstairs
 {id:'bed3',f:1,r:[18,12,31,21.4],name:'Bedroom 3',floor:C.oak,
  desc:'Front bedroom under the roof slope with a dormer window toward Tennyson.', imgs:['z13'], t:112},
 {id:'bed4',f:1,r:[31,12,42.4,21.4],name:'Bedroom 4',floor:C.oak,
  desc:'Front bedroom with sloped ceilings, a dormer window and built-in storage.', imgs:['z14','v137','v142'], t:134},
 {id:'bed5',f:1,r:[42.4,14.2,61.4,27],name:'Bedroom 5',floor:C.oak,
  desc:'Corner bedroom with sloped ceiling, a dormer and a gable-end window. Exact size not visible in the video.', imgs:['v141','v138'], t:124},
 {id:'hallU',f:1,r:[18,21.4,42.4,27],name:'Upstairs hall',floor:C.oak,hole:[26,21.5,40,24],
  desc:'Top of the main stair, under the roof ridge. Leads to the bedrooms, the bath and the balcony door.', imgs:['v140','v128','v124'], t:122},
 {id:'bathU',f:1,r:[18,27,28,37],name:'Full bath (upstairs)',floor:C.tileWhite,
  desc:'Tub with hand shower tucked under the roof slope, cast-iron wall sink, toilet.', imgs:['z10','v151','v153'], t:146},
 {id:'hall2',f:1,r:[28,27,36,32],name:'Balcony landing',floor:C.oak,
  desc:'Short hall ending in a glass French door to the balcony.', imgs:['v133'], t:128},
 {id:'store',f:1,r:[36,27,61.4,42],name:'Eaves storage',floor:C.oak,
  desc:'Space under the back roof slope. Inferred.', imgs:[], t:null},
 // outside
 {id:'porch',f:0,r:[18.4,1,30,8.6],name:'Front porch',floor:C.brick,out:true,
  desc:'Brick steps, covered porch and the red front door with glass side panels, tucked next to the front wing.', imgs:['v014','v016'], t:10},
 {id:'balcony',f:1,r:[28,32,36,38],name:'Balcony',floor:C.deck,out:true,
  desc:'Small deck cut into the back roof off the upstairs landing. A flat patch shows here on the aerial photo.', imgs:['v133'], t:130},
 {id:'pergola',f:0,r:[0,48.6,18.4,62],name:'Wisteria pergola',floor:C.brick,out:true,
  desc:'Wooden pergola wrapped in old wisteria, right outside the kitchen French doors. The purple wisteria shows on the aerial photo here.', imgs:['v074','v078'], t:72},
 {id:'front',f:0,r:[-40,-35,66,-3],name:'Front yard',floor:C.grass,out:true,lowLabel:true,
  desc:'Lawn on Tennyson Ave, straight concrete walk from the gate, shrubs and maples along the house.', imgs:['z01'], t:0},
 {id:'garden',f:0,r:[-40,62,80,118],name:'Back garden',floor:C.grass,out:true,lowLabel:true,
  desc:'Big lawn with curved brick paths, brick terraces and tall redwoods. Listing: owner pays yard service.', imgs:['z02','v184','v186'], t:180},
 {id:'side',f:0,r:[66,-35,76,62],name:'Driveway / side yard',floor:C.gravel,out:true,lowLabel:true,
  desc:'Off-street parking and a stepping-stone side path. Listing mentions a Tesla charger on site. Which side the driveway is on is an estimate.', imgs:['v174','v178'], t:166},
];
// openings: [floor, 'h' (wall at z=const) | 'v' (wall at x=const), at, center, width, type]
export const OPEN = [
 // ground: doors and openings
 [0,'h',8.6,23,3.5,'front'], [0,'v',18.4,11,3,'door'], [0,'h',24,30,5,'open'], [0,'v',42.4,19,4,'open'],
 [0,'h',18,9,3,'door'], [0,'h',24,9,4,'open'], [0,'v',0,21,3,'door'], [0,'v',18.4,27,3,'door'],
 [0,'v',42.4,27,3,'door'], [0,'h',30,20.7,2.4,'door'], [0,'h',30,26.5,2.4,'door'], [0,'h',30,36,2.6,'door'],
 [0,'h',48.6,9,5,'french'], [0,'v',18.4,42,2.6,'door'], [0,'h',32,52,4,'open'], [0,'h',51.8,54,5,'french'],
 [0,'v',42.4,46,3,'door'], [0,'h',57.7,35,5,'french'], [0,'h',38,26.5,2.6,'door'],
 // ground: windows
 [0,'h',0,9.2,5,'win'], [0,'v',0,4,3,'win'], [0,'v',0,9,3,'win'], [0,'v',0,14,3,'win'],
 [0,'h',8.6,32,6,'win'], [0,'h',8.6,39,3,'win'], [0,'h',14.2,48,4,'win'], [0,'h',14.2,56,4,'win'],
 [0,'v',61.4,20,4,'win'], [0,'v',61.4,27,4,'win'], [0,'v',61.4,40,4,'win'], [0,'v',61.4,46,4,'win'],
 [0,'v',0,31,4,'win'], [0,'v',0,38,4,'win'], [0,'v',0,44,3,'win'], [0,'h',48.6,20.7,2,'win'],
 [0,'v',23,53,3,'win'], [0,'h',57.7,28,3,'win'], [0,'h',57.7,41,3,'win'],
 // upstairs
 [1,'h',12,24,3.6,'win'], [1,'h',12,39,3.6,'win'], [1,'h',14.2,52,3.6,'win'],
 [1,'h',21.4,22,2.8,'door'], [1,'h',21.4,41,2.4,'door'], [1,'v',42.4,24,2.8,'door'], [1,'h',27,22,2.4,'door'],
 [1,'h',27,32,4,'open'], [1,'h',32,32,4,'french'], [1,'h',27,41,2.6,'door'],
 [1,'v',61.4,19,3,'win'], [1,'v',61.4,34,3,'win'],
];
