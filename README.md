# Sajada

Sajada is a travel companion for Muslim travelers. Choose a destination to find prayer times and the Qibla direction for that city, and discover nearby mosques and halal food.

## Features

- Search for a destination city or use your current location.
- View prayer times based on the destination’s local date and time zone.
- Find the Qibla direction and use the device compass when available.
- Search Google Maps for mosques, prayer spaces, and halal food near the selected destination.
- Read Surah Al-Kahfi and Surah Yasin in Arabic, with Latin transliteration and Indonesian translation.
- Use the responsive, installable Progressive Web App on mobile devices.

Your selected destination is saved in the browser on your device.

## Run locally

This is a static website and does not require a build step.

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Data sources

- Prayer times: [AlAdhan API](https://aladhan.com/prayer-times-api)
- Destination search and geocoding: [OpenStreetMap Nominatim](https://nominatim.org/)
- Quran text, transliteration, and Indonesian translation: [Al Quran Cloud](https://alquran.cloud/api)
- Nearby place searches: Google Maps

## Deployment

The site can be deployed to Cloudflare Pages as a static site. No build command is required; use the project root as the output directory.
