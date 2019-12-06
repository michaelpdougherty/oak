const form = document.getElementById("login-form");
const go = document.getElementById("go");
const header = document.getElementById("header");
const err = document.getElementById("err");
form.onsubmit = () => {
  header.innerHTML = "LOGGING IN...";
  go.style.display = "none";
  err.style.display = "none";
};
