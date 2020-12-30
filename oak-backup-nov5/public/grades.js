// initial page layout
const cardsView = document.getElementById("cardsView")
const nodes = document.getElementById("root").childNodes;

function redirect(index) {
  // redirect to assignment page
  window.location=`/classAssignments?c=${index}`
}

function expand(index) {
  if (index === "close") {
    // hide alt views
    hideAltViews();

    // show main view
    cardsView.style.display = "flex";
  } else {
    // hide current view
    cardsView.style.display = "none";

    // show correct view
    nodes[index + 1].style.display = "flex";
  }
}

function hideAltViews() {
  // remove alternate views
  for (let i = 1; i < nodes.length; i++) {
    nodes[i].style.display = "none";
  }
}

window.onload = function() {
  if(/iP(hone|ad)/.test(window.navigator.userAgent)) {
    document.body.addEventListener('touchstart', function() {}, false);
  }

  hideAltViews();
};
