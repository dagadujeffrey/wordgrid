const fs = require('fs');
const path = require('path');
const { readJson } = require('../utils/file');

const CACHE_DIR = path.join(__dirname, '..', 'data');
const WORDS_CACHE = path.join(CACHE_DIR, 'words_alpha.txt');
const SEED_PATH = path.join(CACHE_DIR, 'dictionary-seed.json');

let dictionary = null;

async function downloadDictionary() {
  const url = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Dictionary download failed: ${response.status}`);
    }
    const text = await response.text();
    fs.writeFileSync(WORDS_CACHE, text);
    return text;
  } catch (error) {
    return null;
  }
}

async function loadDictionary() {
  if (dictionary) {
    return dictionary;
  }
  let content = null;
  if (fs.existsSync(WORDS_CACHE)) {
    content = fs.readFileSync(WORDS_CACHE, 'utf-8');
  } else {
    content = await downloadDictionary();
  }
  let words = [];
  if (content) {
    words = content
      .split(/\r?\n/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && word.length <= 4);
  }
  if (!words.length) {
    words = readJson(SEED_PATH, []).map((word) => word.toString());
  }
  dictionary = new Set(words.map((word) => word.toUpperCase()));
  return dictionary;
}

async function isValidWord(word) {
  const dict = await loadDictionary();
  return dict.has(word.toUpperCase());
}

function resetDictionaryCache() {
  dictionary = null;
}

module.exports = {
  loadDictionary,
  isValidWord,
  resetDictionaryCache
};
