// public/index.js
// lighten button background for 2 sec
const gradesButton = document.getElementById("gradesButton")
gradesButton.onclick = () => {
  gradesButton.style.background = "var(--highlight-secondary)"//"#BBBE64"
  setTimeout(() => {
    gradesButton.style.background = "var(--highlight)"
  }, 2000)
}
const assignmentsButton = document.getElementById("assignmentsButton")
assignmentsButton.onclick = () => {
  assignmentsButton.style.background = "var(--highlight-secondary)"//"#BBBE64"
  setTimeout(() => {
    assignmentsButton.style.background = "var(--highlight)"
  }, 2000)
}
