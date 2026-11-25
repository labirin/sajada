const $ = (id) => document.getElementById(id);
const prayerNames = { Fajr: 'Subuh', Sunrise: 'Terbit', Dhuhr: 'Dzuhur', Asr: 'Ashar', Maghrib: 'Maghrib', Isha: 'Isya' };
const prayerOrder = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const kaaba = { lat: 21.4225, lon: 39.8262 };
const DESTINATION_KEY = 'sajada-destination-v1';
let coords = null;
let timings = {};
let qiblaBearing = null;
let currentHeading = null;
let destinationTimezone = null;
let timer = null;
let destinationRevision = 0;
let geoRequestId = 0;

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => node.classList.remove('show'), 2800);
}

function getDateParts(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || undefined,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function dateForTimezone(timeZone) {
  const { day, month, year } = getDateParts(timeZone);
  return `${day}-${month}-${year}`;
}

function clockForTimezone() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: destinationTimezone || undefined,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function setDate() {
  $('todayLabel').textContent = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: destinationTimezone || undefined,
  }).format(new Date()).toUpperCase();
}

function getLocation() {
  if (!navigator.geolocation) {
    toast('Browser ini tidak mendukung lokasi.');
    return;
  }
  const requestId = ++geoRequestId;
  const previousLabel = coords ? $('locationLabel').textContent : 'Pilih kota tujuan';
  $('locationLabel').textContent = 'Mencari lokasi…';
  navigator.geolocation.getCurrentPosition(async ({ coords: position }) => {
    const point = { lat: position.latitude, lon: position.longitude };
    const label = await reverseGeocode(point);
    if (requestId !== geoRequestId) return;
    setDestination(point, label);
  }, () => {
    if (requestId !== geoRequestId) return;
    $('locationLabel').textContent = previousLabel;
    toast('Izin lokasi tidak tersedia. Kamu tetap bisa mencari kota tujuan.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
}

async function reverseGeocode(point) {
  try {
    const params = new URLSearchParams({ format: 'jsonv2', lat: point.lat, lon: point.lon, zoom: '10', addressdetails: '1' });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!response.ok) throw new Error('Geocoding failed');
    const data = await response.json();
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.county || address.state;
    return [city, address.country].filter(Boolean).join(', ') || 'Lokasi saat ini';
  } catch {
    return 'Lokasi saat ini';
  }
}

function setDestination(point, label, save = true) {
  geoRequestId += 1;
  destinationRevision += 1;
  coords = { lat: Number(point.lat), lon: Number(point.lon) };
  destinationTimezone = null;
  timings = {};
  qiblaBearing = getBearing(coords.lat, coords.lon);
  $('locationLabel').textContent = label;
  $('tripTitle').textContent = label;
  $('tripHint').textContent = 'Jadwal salat mengikuti waktu lokal kota tujuan.';
  $('bearingValue').textContent = `${Math.round(qiblaBearing)}°`;
  $('bearingLabel').textContent = `Arah kiblat di ${label}`;
  $('mosquesLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`mosque in ${label}`)}`;
  $('halalLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`halal food in ${label}`)}`;
  $('mosquesLocation').textContent = `Cari di ${label}`;
  $('halalLocation').textContent = `Cari di ${label}`;
  $('destinationModal').classList.remove('open');
  $('destinationModal').setAttribute('aria-hidden', 'true');
  if (save) {
    try { localStorage.setItem(DESTINATION_KEY, JSON.stringify({ ...coords, label })); } catch { /* storage can be disabled */ }
  }
  setDate();
  loadPrayerTimes();
}

function cleanTime(value) { return value?.split(' ')[0] || '--:--'; }
function minutesOf(value) {
  const [hour, minute] = cleanTime(value).split(':').map(Number);
  return hour * 60 + minute;
}

async function fetchPrayerData(date, point) {
  const url = `https://api.aladhan.com/v1/timings/${date}?latitude=${point.lat}&longitude=${point.lon}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Gagal mengambil jadwal');
  const body = await response.json();
  if (body.code !== 200) throw new Error('Jadwal tidak tersedia');
  return body.data;
}

async function loadPrayerTimes() {
  if (!coords) return;
  const requestRevision = destinationRevision;
  const requestCoords = { ...coords };
  $('prayerList').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    let schedule = await fetchPrayerData(dateForTimezone(destinationTimezone), requestCoords);
    if (requestRevision !== destinationRevision) return;
    const zone = schedule.meta.timezone;
    const destinationDate = dateForTimezone(zone);
    if (destinationDate !== dateForTimezone(destinationTimezone)) {
      schedule = await fetchPrayerData(destinationDate, requestCoords);
      if (requestRevision !== destinationRevision) return;
    }
    destinationTimezone = zone;
    timings = schedule.timings;
    $('sourceNote').textContent = `Metode ${schedule.meta.method.name} · ${destinationTimezone} · Cocokkan dengan jadwal masjid setempat.`;
    $('tripHint').textContent = `Waktu lokal ${destinationTimezone} · jadwal mengikuti tanggal di kota tujuan.`;
    setDate();
    updateNext();
  } catch {
    if (requestRevision !== destinationRevision) return;
    $('prayerList').innerHTML = '<p class="empty-state">Jadwal belum bisa dimuat. Periksa koneksi, lalu coba perbarui.</p>';
    toast('Jadwal salat gagal dimuat.');
  }
}

function renderPrayerTimes() {
  const now = clockForTimezone();
  const nowMinutes = now.hour * 60 + now.minute;
  const nextKey = prayerOrder.filter((key) => key !== 'Sunrise').find((key) => minutesOf(timings[key]) > nowMinutes);
  $('prayerList').innerHTML = prayerOrder.map((key) => `<article class="prayer-item ${key === nextKey ? 'current' : ''}"><div class="name">${prayerNames[key]}</div><div class="time">${cleanTime(timings[key])}</div></article>`).join('');
}

function updateNext() {
  if (!Object.keys(timings).length) return;
  const now = clockForTimezone();
  const nowSeconds = now.hour * 3600 + now.minute * 60 + now.second;
  let key = prayerOrder.filter((item) => item !== 'Sunrise').find((item) => minutesOf(timings[item]) * 60 > nowSeconds);
  let remaining;
  if (key) remaining = minutesOf(timings[key]) * 60 - nowSeconds;
  else {
    key = 'Fajr';
    remaining = 86400 - nowSeconds + minutesOf(timings.Fajr) * 60;
  }
  const hh = String(Math.floor(remaining / 3600)).padStart(2, '0');
  const mm = String(Math.floor(remaining % 3600 / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  $('nextPrayer').textContent = prayerNames[key];
  $('nextMeta').textContent = `Waktu lokal · ${cleanTime(timings[key])}`;
  $('countdown').textContent = `${hh}:${mm}:${ss}`;
  renderPrayerTimes();
}

function getBearing(lat, lon) {
  const p1 = lat * Math.PI / 180, p2 = kaaba.lat * Math.PI / 180, dl = (kaaba.lon - lon) * Math.PI / 180;
  const y = Math.sin(dl), x = Math.cos(p1) * Math.tan(p2) - Math.sin(p1) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function openCompass() {
  if (!coords) { toast('Pilih kota tujuan atau gunakan lokasi saat ini.'); openDestinationModal(); return; }
  $('compassModal').classList.add('open');
  $('compassModal').setAttribute('aria-hidden', 'false');
  $('bearingValue').textContent = `${Math.round(qiblaBearing)}°`;
  drawCompass();
}

function drawCompass() {
  if (qiblaBearing == null) return;
  const relative = currentHeading == null ? qiblaBearing : (qiblaBearing - currentHeading + 360) % 360;
  $('qiblaPointer').style.transform = `rotate(${relative}deg)`;
  $('degreeLabel').textContent = currentHeading == null ? `${Math.round(qiblaBearing)}° dari utara` : `${Math.round(currentHeading)}°`;
}

async function enableCompass() {
  if (!('DeviceOrientationEvent' in window)) {
    toast('Sensor kompas tidak tersedia di perangkat ini.');
    $('compassInstruction').textContent = 'Perangkat ini tidak menyediakan sensor arah. Gunakan derajat kiblat dari utara sebagai panduan.';
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Izin sensor ditolak');
    }
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
    $('enableCompass').textContent = 'Sensor aktif';
    $('compassInstruction').textContent = 'Putar perlahan sampai penunjuk mengarah ke atas.';
  } catch {
    $('compassInstruction').textContent = 'Izin kompas belum diberikan. Coba aktifkan sensor dari pengaturan browser.';
    toast('Tidak dapat mengakses sensor kompas.');
  }
}

function onOrientation(event) {
  let heading;
  if (typeof event.webkitCompassHeading === 'number') heading = event.webkitCompassHeading;
  else if (event.absolute && typeof event.alpha === 'number') heading = 360 - event.alpha;
  else if (typeof event.alpha === 'number') heading = 360 - event.alpha;
  if (heading != null) { currentHeading = (heading + 360) % 360; drawCompass(); }
}

function openDestinationModal() {
  $('destinationModal').classList.add('open');
  $('destinationModal').setAttribute('aria-hidden', 'false');
  $('destinationStatus').textContent = '';
  $('destinationResults').replaceChildren();
  setTimeout(() => $('destinationQuery').focus(), 50);
}

function destinationLabel(result) {
  const address = result.address || {};
  const city = address.city || address.town || address.village || address.municipality || result.name;
  return [city, address.country].filter(Boolean).join(', ') || result.display_name;
}

async function searchDestination(event) {
  event.preventDefault();
  const query = $('destinationQuery').value.trim();
  if (!query) return;
  const searchButton = $('destinationSearchForm').querySelector('button');
  searchButton.disabled = true;
  $('destinationStatus').textContent = 'Mencari kota…';
  $('destinationResults').replaceChildren();
  try {
    const params = new URLSearchParams({ format: 'jsonv2', q: query, addressdetails: '1', limit: '5' });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!response.ok) throw new Error('Pencarian gagal');
    const results = await response.json();
    if (!results.length) { $('destinationStatus').textContent = 'Kota belum ditemukan. Coba nama kota dan negara.'; return; }
    $('destinationStatus').textContent = 'Pilih lokasi tujuan:';
    results.forEach((result) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'destination-result';
      const title = document.createElement('strong');
      title.textContent = destinationLabel(result);
      const detail = document.createElement('span');
      detail.textContent = result.display_name;
      button.append(title, detail);
      button.addEventListener('click', () => setDestination({ lat: result.lat, lon: result.lon }, destinationLabel(result)));
      $('destinationResults').append(button);
    });
  } catch {
    $('destinationStatus').textContent = 'Pencarian belum bisa dilakukan. Periksa koneksi, lalu coba lagi.';
  } finally {
    searchButton.disabled = false;
  }
}

function restoreDestination() {
  try {
    const saved = JSON.parse(localStorage.getItem(DESTINATION_KEY));
    if (Number.isFinite(saved?.lat) && Number.isFinite(saved?.lon) && saved?.label) { setDestination(saved, saved.label, false); return true; }
  } catch { /* no saved location */ }
  return false;
}

function closeCompass() {
  $('compassModal').classList.remove('open');
  $('compassModal').setAttribute('aria-hidden', 'true');
}

$('locationButton').addEventListener('click', openDestinationModal);
$('openDestination').addEventListener('click', openDestinationModal);
$('navLocation').addEventListener('click', openDestinationModal);
$('destinationSearchForm').addEventListener('submit', searchDestination);
$('useMyLocation').addEventListener('click', () => { $('destinationModal').classList.remove('open'); $('destinationModal').setAttribute('aria-hidden', 'true'); getLocation(); });
$('refreshButton').addEventListener('click', () => coords ? loadPrayerTimes() : openDestinationModal());
$('openCompass').addEventListener('click', openCompass);
$('navQibla').addEventListener('click', (event) => { event.preventDefault(); openCompass(); });
$('enableCompass').addEventListener('click', enableCompass);
document.querySelectorAll('[data-close]').forEach((element) => element.addEventListener('click', closeCompass));
document.querySelectorAll('[data-close-destination]').forEach((element) => element.addEventListener('click', () => {
  $('destinationModal').classList.remove('open');
  $('destinationModal').setAttribute('aria-hidden', 'true');
}));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeCompass(); $('destinationModal').classList.remove('open'); $('destinationModal').setAttribute('aria-hidden', 'true'); }
});

setDate();
if (!restoreDestination()) getLocation();
timer = setInterval(updateNext, 1000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
