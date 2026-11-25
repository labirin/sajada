const verses = document.getElementById('quranVerses');
const surahs = {
  18: { name: 'Al-Kahfi', verses: 110 },
  36: { name: 'Yasin', verses: 83 },
};
const requestedSurah = Number(new URLSearchParams(location.search).get('surah'));
const surahNumber = surahs[requestedSurah] ? requestedSurah : 18;
const surah = surahs[surahNumber];
document.getElementById('surahPageTitle').textContent = `Baca Surat ${surah.name} — Sajada`;
document.getElementById('surahMeta').textContent = `SURAT KE-${surahNumber} · ${surah.verses} AYAT · MAKKIYAH`;
document.getElementById('surahName').textContent = surah.name;

function showError() {
  verses.replaceChildren();
  const message = document.createElement('p');
  message.className = 'reader-error';
  message.textContent = 'Bacaan belum dapat dimuat. Periksa koneksi internet, lalu coba lagi.';
  const retry = document.createElement('button');
  retry.className = 'reading-button';
  retry.type = 'button';
  retry.textContent = 'Coba lagi';
  retry.addEventListener('click', loadSurah);
  verses.append(message, retry);
}

async function loadSurah() {
  verses.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'reader-loading';
  loading.textContent = 'Memuat ayat…';
  verses.append(loading);

  try {
    const response = await fetch(`https://api.alquran.cloud/v1/surah/${surahNumber}/editions/quran-uthmani,en.transliteration,id.indonesian`);
    if (!response.ok) throw new Error('Request failed');
    const result = await response.json();
    if (result.code !== 200 || !Array.isArray(result.data) || result.data.length < 3) throw new Error('Invalid response');

    const arabic = result.data[0].ayahs;
    const transliteration = result.data[1].ayahs;
    const translation = result.data[2].ayahs;
    if (!arabic?.length || arabic.length !== transliteration?.length || arabic.length !== translation?.length) throw new Error('Incomplete response');

    const fragment = document.createDocumentFragment();
    arabic.forEach((ayah, index) => {
      const block = document.createElement('article');
      block.className = 'quran-verse';

      const number = document.createElement('span');
      number.className = 'verse-number';
      number.textContent = String(ayah.numberInSurah);

      const text = document.createElement('p');
      text.className = 'verse-arabic';
      text.lang = 'ar';
      text.dir = 'rtl';
      text.textContent = ayah.text;

      const latin = document.createElement('p');
      latin.className = 'verse-latin';
      latin.lang = 'en-Latn';
      latin.textContent = transliteration[index].text;

      const meaning = document.createElement('p');
      meaning.className = 'verse-translation';
      meaning.textContent = translation[index].text;

      block.append(number, text, latin, meaning);
      fragment.append(block);
    });
    verses.replaceChildren(fragment);
  } catch {
    showError();
  }
}

loadSurah();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
