async function fetchData() {
  const res = await fetch("https://v2.jokeapi.dev/joke/Any");
  const record = await res.json();
  
  document.getElementById("category").innerHTML = record.category;
  
  if (record.type === 'twopart') {
    document.getElementById("setup").innerHTML = record.setup;
    document.getElementById("delivery").innerHTML = record.delivery;
  }
  
  if (record.type === 'single') {
    document.getElementById("joke").innerHTML = record.joke;
  }
}

fetchData();

document.getElementById('restart').addEventListener('click', fetchData);