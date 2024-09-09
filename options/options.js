const safeInput = document.querySelector('#safe');
const unsafeInput = document.querySelector('#unsafe');

chrome.storage.sync.get(["unsafe"]).then((result) => {
  safeInput.checked = result.unsafe === true ? false : true;
  unsafeInput.checked = result.unsafe === true ? true : false;
});

const form = document.querySelector("form");
const log = document.querySelector("#log");

form.addEventListener(
  "submit",
  (event) => {
    chrome.storage.sync.set({
      safe: safeInput.checked,
      unsafe: unsafeInput.checked
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