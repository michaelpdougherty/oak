// public/login.js
// prevent multiple form submissions
const form = document.getElementById("login-form");
const usernameInput = document.getElementById("usernameInput")
const passwordInput = document.getElementById("passwordInput")
const go = document.getElementById("go");
const header = document.getElementById("header");
const err = document.getElementById("err");
form.onsubmit = (event) => {
  if (!(usernameInput.value && passwordInput.value)) {
    event.preventDefault()
    event.stopPropagation()
    window.location="https://oakgrades.com/login?err=Please%20enter%20a%20username%20and%20password"
  }
  if (!form.disabled) {
    header.innerHTML = "Please Wait...";
    go.style.display = "none";
    if (err) { err.style.display = "none"; }
    form.disabled = true;
    usernameInput.readOnly = true;
    passwordInput.readOnly = true;
  }
};
