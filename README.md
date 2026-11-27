# 604 Tennyson Ave, Palo Alto: 3D house model

Live: https://604-tennyson-3d-nine.vercel.app

A browser 3D model of 604 Tennyson Ave, Palo Alto, CA 94301, on the corner of Tennyson Ave and Webster St. It has 5 bedrooms, 2.5 baths and about 3,078 sq ft. Click a room to see its photos and jump to that spot in the house tour video. You can also walk through the house, split the two floors apart, show the roof and furniture, and download a .glb file.

## What is measured and what is estimated

| Part | Source | Accuracy |
|-|-|-|
| Outer walls (footprint) | City of Palo Alto building outline, via OpenStreetMap way 231878571 | Measured. 2,761 sq ft ground footprint, about 61 ft along Tennyson and 58 ft deep |
| Which way the house faces, corner side | Outline plus street data | Measured. Front faces Tennyson, the den wing faces Webster |
| Roof shape, 3 front dormers, kitchen skylights, back balcony, wisteria spot | Esri World Imagery aerial photo (zoom 20), lined up with the outline | Read from the photo. Heights and pitch are estimates |
| Rooms inside: names, order, photos | 3:15 house tour video + 14 listing photos | Estimated. There is no public floor plan, so room sizes are guesses |
| Upstairs layout | Dormer positions + tour video | Estimated |
| Driveway side | Not visible in any source | Guess |

The first version (Nov 26) was built before the outline and aerial photo were used. It was narrower (48 ft) and mirrored left to right. This version fixes both.

## Listing facts (Zillow, captured Nov 26, 2026)

- For rent: $12,000/month, deposit $12,000, available now
- Lease: 1 year, then month to month
- Sale history: listed for sale Sep 10, 2026 at $9.5M, pending Sep 18, sold Nov 16, 2026 for $9.65M, listed for rent Nov 17, 2026
- Baths: the description says 2.5, Zillow's fact list says 3 full
- Hardwood floors, forced-air heat, no AC listed
- Washer, dryer, dishwasher, oven and fridge included; laundry in unit
- Off-street parking, Tesla charger on site
- Cats and dogs allowed
- Owner pays yard service; tenant pays utilities and internet
- Parcel 124-03-001, tax-assessed value $6.3M
- Listed by Bin Zhou, Open Realty
- Listing: https://www.zillow.com/homedetails/604-Tennyson-Ave-Palo-Alto-CA-94301/19496239_zpid/
- Tour video: https://www.youtube.com/watch?v=jN0Pn0SuR54 (uploaded by the listing agent, Nov 21, 2026)

## Files

| Path | What it is |
|-|-|
| `index.html` | The model (Three.js from a CDN, no build step) |
| `img/` | Room photos. `z01`-`z14` are the Zillow listing photos, `v###` are frames from the tour video (the number is roughly the second in the video) |
| `604-tennyson-house-tour.mp4` | The full house tour video (3:15) |
| `604-tennyson-ave.glb` | 3D export in meters, for Blender, SketchUp and similar tools |
| `604-tennyson-3d-model-single-file.html` | Same model with all photos built in, so it works as one file (the video still needs the mp4 next to it) |
| `source/zillow-listing-2026-11-26.json` | Listing facts and price history as captured |
| `source/listing-photos-zillow/` | The 14 listing photos at full size |
| `source/osm-building-outlines.geojson` | Building outlines for this house and its neighbors |
| `source/aerial/` | Aerial photo of the block, the same photo with city outlines drawn on, and a crop turned to the house's own grid (8 px per ft) |
| `source/youtube-video-info.json` | Tour video details |

## Run it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening the file directly also works, but some browsers block the video that way.

## How the model is set up

- 1 unit = 1 ft. `x` runs along Tennyson Ave (0 is the wall facing Webster St), `z` runs away from the street (0 is the front of the den wing).
- `OUTLINE` holds the measured footprint. `ROOMS` holds each room as a rectangle with its photos and tour timestamp. `OPEN` holds doors and windows.
- The main roof ridge runs parallel to Tennyson at `z = 28`. Upstairs wall heights follow the roof slope, with extra height at the three dormers.

## Credits

Listing photos and video: Bin Zhou, Open Realty. Building outlines: OpenStreetMap contributors (ODbL), from City of Palo Alto data. Aerial imagery: Esri World Imagery (Esri, Maxar, Earthstar Geographics).
