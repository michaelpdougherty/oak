function redirect(c, a) {
  window.location="/assignment?class=" + c + "&assignment=" + a
}

function collapse(thead) {
  toggle(thead.parentNode.childNodes[1])
}

// iterate over each table body and hide them
window.onload = () => {
  const bodies = document.getElementsByTagName("tbody")
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].style.display = "none"
  }
}
