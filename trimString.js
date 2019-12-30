// helper function that trims whitespace and newline characters from the inside of strings
// this thing is a LIFESAVER
const trimString = string => {
  let split = string.split(" ");
  let currentItem = "";
  let newSplit = [];
  for (let i = 0; i < split.length; i++) {
    if (split[i]) {
      currentItem = split[i].trim();
      if (currentItem) {
        newSplit.push(currentItem);
      }
    }
  }
  return newSplit.join(" ");
};

exports.trimString = trimString;
