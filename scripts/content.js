console.log('Work!');
async function fetchData() {
  const res = await fetch("https://v2.jokeapi.dev/joke/Any");
  const record = await res.json();
  
  document.getElementById("setup").innerHTML = record.setup;
  document.getElementById("delivery").innerHTML = record.delivery;
  
  console.dir(record);
}

fetchData();