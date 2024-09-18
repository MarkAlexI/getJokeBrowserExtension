let joketypes = "safe";
let lang = "en";

chrome.storage.sync.get(["joketypes", "lang"]).then((result) => {
  document.querySelector(`input[name="joketypes"][value="${result.joketypes || joketypes}"]`).checked = true;
  document.querySelector(`input[name="lang"][value="${result.lang || lang}"]`).checked = true;
});

const form = document.querySelector("form");
const log = document.querySelector("#log");

form.addEventListener(
  "submit",
  (event) => {
    const selectedMode = document.querySelector('input[name="joketypes"]:checked').value;
    const selectedLang = document.querySelector('input[name="lang"]:checked').value;
    
    chrome.storage.sync.set({
      joketypes: selectedMode,
      lang: selectedLang
    });
    
    const data = new FormData(form);
    let output = "";
    for (const entry of data) {
      output = `${output}${entry[0]}=${entry[1]}\r`;
    }
    log.innerText = output;
    event.preventDefault();
  },
  false,
);