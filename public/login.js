const form = document.getElementById("login-form");
const usernameInput = document.getElementById("usernameInput")
const passwordInput = document.getElementById("passwordInput")
const go = document.getElementById("go");
const header = document.getElementById("header");
const err = document.getElementById("err");
form.onsubmit = () => {
  if (!form.disabled) {
    header.innerHTML = "LOGGING IN...";
    go.style.display = "none";
    if (err) { err.style.display = "none"; }
    form.disabled = true;
    usernameInput.readOnly = true;
    passwordInput.readOnly = true;
    //usernameInput.blur();
    //passwordInput.blur();
    //form.blur();
  }
};
