'use strict';

const category = document.getElementById("category");
const joke = document.getElementById("joke");
const setup = document.getElementById("setup");
const delivery = document.getElementById("delivery");
const restart = document.getElementById("restart");

async function fetchData() {
  const res = await fetch("https://v2.jokeapi.dev/joke/Any");
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
