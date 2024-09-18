'use strict';

const category = document.getElementById("category");
const joke = document.getElementById("joke");
const setup = document.getElementById("setup");
const delivery = document.getElementById("delivery");
const restart = document.getElementById("restart");

async function fetchData() {
  let joketype, lang;
  
  const result = await chrome.storage.sync.get(["joketypes", "lang"]);
  joketype = result.joketypes === "unsafe"
    ? ''
    : '&safe-mode';
  lang = result.lang || 'en';

  const res = await fetch(`https://v2.jokeapi.dev/joke/Any?lang=${lang}${joketype}`);
  const record = await res.json();

  category.innerText = record.category;

  joke.innerText = '';
  setup.innerText = '';
  delivery.innerText = '';

  if (record.type === 'twopart') {
    setup.innerText = record.setup;
    delivery.innerText = record.delivery;
  }

  if (record.type === 'single') {
    joke.innerText = record.joke;
  }
}

fetchData();

restart.addEventListener('click', fetchData);

chrome.commands.onCommand.addListener((command) => {
  if (command === 'refresh-joke-feature') {
    fetchData();
  }
});