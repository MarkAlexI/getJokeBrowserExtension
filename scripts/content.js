'use strict';

const category = document.getElementById("category");
const joke = document.getElementById("joke");
const setup = document.getElementById("setup");
const delivery = document.getElementById("delivery");
const restart = document.getElementById("restart");

async function fetchData() {
  const res = await fetch("https://v2.jokeapi.dev/joke/Any");
  const record = await res.json();
  
  category.innerHTML = record.category;
  
  joke.innerHTML = '';
  setup.innerHTML = '';
  delivery.innerHTML = '';
  
  if (record.type === 'twopart') {
    setup.innerHTML = record.setup;
    delivery.innerHTML = record.delivery;
  }
  
  if (record.type === 'single') {
    joke.innerHTML = record.joke;
  }
}

fetchData();

restart.addEventListener('click', fetchData);